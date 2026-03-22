/**
 * AI Orchestrator
 * Coordinates satellite service and 3 AI agents
 * Calculates consensus and submits to blockchain
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { logger } from './utils/logger';
import { calculateConsensus } from './consensus';
import { submitVerification, submitRejection, submitToConsensusEngine, publicClient } from './submitter';
import * as pdfParse from 'pdf-parse';
import { extractTextWithOCR } from './utils/ocrService';
import FormData from 'form-data';
import axios from 'axios';
import Groq from 'groq-sdk';

// Singleton — created once, reused across all agent calls
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
];

const FETCH_TIMEOUT_MS = 30_000;
const AGENT_MODELS = ['Groq (Llama 3.3 70B)', 'Groq (Llama 3.3 70B)', 'Groq (Llama 3.1 8B)'] as const;

interface VerificationRequest {
  requestId: string;
  requester: string;
  assetType: number;
  latitude: number;
  longitude: number;
  documentHashes: string[];
  blockNumber: bigint;
  transactionHash: string;
}

interface AgentResponse {
  valuation: number;
  confidence: number;
  reasoning: string;
  risk_factors: string[];
  agent: string;
  error?: string;
  document_verification?: {
    is_land_document?: boolean;
    document_type_found?: string;
    authenticity_score: number;
    missing_fields: string[];
    red_flags: string[];
  };
}

// ─── IPFS helpers ─────────────────────────────────────────────────────────────

/** Race all gateways simultaneously — returns first successful response */
async function ipfsFetch(cid: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const clean = cid.replace('ipfs://', '');
  const races = IPFS_GATEWAYS.map(async (gw) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${gw}${clean}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } finally {
      clearTimeout(timer);
    }
  });
  return Promise.any(races);
}

/** Fetch and extract text from a document CID (handles JSON wrappers, PDF, images) */
async function fetchDocumentContent(documentHash: string): Promise<string> {
  const clean = documentHash.replace('ipfs://', '');
  logger.info(`   📥 Fetching: ${clean.substring(0, 20)}...`);

  let res: Response;
  try {
    res = await ipfsFetch(clean);
  } catch {
    logger.error(`   ❌ All gateways failed for ${clean.substring(0, 20)}`);
    return 'Document content not available';
  }

  const ct = res.headers.get('content-type') || '';

  // ── Structured JSON wrapper ──
  if (ct.includes('json')) {
    const json = await res.json() as any;

    // Our own land_document wrapper — fetch and OCR the original file
    if (json.document_type === 'land_document' && json.original_file_cid) {
      logger.info(`   📄 Structured JSON: ${json.file_name} — fetching original for OCR`);
      return fetchAndOcr(json.original_file_cid, json.file_name);
    }

    // Frontend metadata wrapper with nested documents
    if (json.files?.documents?.length > 0) {
      logger.info(`   📄 Metadata JSON with ${json.files.documents.length} doc(s) — fetching first`);
      return fetchDocumentContent(json.files.documents[0]);
    }

    return JSON.stringify(json, null, 2);
  }

  // ── Plain text ──
  if (ct.includes('text')) return res.text();

  // ── Image ──
  if (ct.includes('image/')) {
    const buf = Buffer.from(await res.arrayBuffer());
    const text = await extractTextWithOCR(buf, 'document.img', ct);
    return text || `Image document (${clean}) — no text extracted`;
  }

  // ── PDF ──
  if (ct.includes('pdf') || clean.toLowerCase().endsWith('.pdf')) {
    const buf = Buffer.from(await res.arrayBuffer());
    return extractPdfText(buf, clean);
  }

  return `Binary document (${ct}) — ${clean}`;
}

async function fetchAndOcr(cid: string, fileName: string): Promise<string> {
  let res: Response;
  try {
    res = await ipfsFetch(cid);
  } catch {
    logger.warn(`   ⚠️  Could not fetch original file for OCR`);
    return 'Original file not available';
  }

  const ct = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());

  if (ct.includes('pdf') || fileName.toLowerCase().endsWith('.pdf')) {
    return extractPdfText(buf, fileName);
  }
  if (ct.includes('image')) {
    const text = await extractTextWithOCR(buf, fileName, ct);
    return text || 'No text extracted from image';
  }
  return buf.toString('utf-8');
}

async function extractPdfText(buf: Buffer, name: string): Promise<string> {
  try {
    const data = await (pdfParse as any)(buf);
    if (data.text.trim().length > 100) return data.text.trim();
  } catch {}
  logger.info(`   📄 PDF text layer thin — using OCR`);
  const ocr = await extractTextWithOCR(buf, name, 'application/pdf');
  return ocr || `PDF (${name}) — no text extracted`;
}

// ─── Satellite ────────────────────────────────────────────────────────────────

function fetchSatelliteData(latitude: number, longitude: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const pythonPath = process.env.PYTHON_PATH || 'python3';
    const scriptPath = path.join(__dirname, '..', 'satellite_service.py');
    const py = spawn(pythonPath, [scriptPath]);

    let out = '', err = '';
    py.stdout.on('data', (d: Buffer) => { out += d; });
    py.stderr.on('data', (d: Buffer) => { err += d; });
    py.on('close', (code: number) => {
      if (code !== 0) return reject(new Error(`Satellite service failed: ${err}`));
      try { resolve(JSON.parse(out)); }
      catch { reject(new Error(`Bad satellite JSON: ${out}`)); }
    });

    py.stdin.write(JSON.stringify({ latitude, longitude }));
    py.stdin.end();

    const timer = setTimeout(() => {
      py.kill();
      reject(new Error('Satellite service timeout (3 min)'));
    }, 180_000);
    py.on('close', () => clearTimeout(timer));
  });
}

// ─── Valuation helpers ────────────────────────────────────────────────────────

function calcValuationA2(area: number, ndvi: number, cloud: number, docs: number) {
  const base = ndvi > 0.6 ? 2500 : ndvi > 0.4 ? 2200 : 1800;
  const af   = area < 500 ? 1.0 : area < 1000 ? 0.95 : 0.90;
  const df   = Math.min(1.0, 0.7 + docs * 0.15);
  let conf   = 85;
  if (cloud > 10) conf -= 5;
  if (docs < 2)   conf -= 10;
  if (ndvi < 0.3) conf -= 5;
  return { valuation: Math.floor(area * base * af * df), confidence: Math.max(60, Math.min(95, conf)) };
}

function calcValuationA3(area: number, ndvi: number, cloud: number, docs: number) {
  const base = ndvi > 0.65 ? 2700 : ndvi > 0.5 ? 2400 : ndvi > 0.3 ? 2000 : 1700;
  const af   = area < 500 ? 1.0 : area < 1000 ? 0.93 : 0.88;
  const df   = Math.min(1.0, 0.65 + docs * 0.175);
  let conf   = 82;
  if (cloud > 15) conf -= 8;
  if (docs < 2)   conf -= 12;
  if (ndvi < 0.25) conf -= 7;
  return { valuation: Math.floor(area * base * af * df), confidence: Math.max(55, Math.min(95, conf)) };
}

// ─── Groq agent runner ────────────────────────────────────────────────────────

async function runAgent(agentNum: 1 | 2 | 3, data: any): Promise<AgentResponse> {
  const sat      = data.satellite_data || {};
  const area     = sat.area_sqm       ?? 200;
  const ndvi     = sat.ndvi           ?? 0.5;
  const cloud    = sat.cloud_coverage ?? 5;
  const docs     = data.document_count ?? 0;
  const contents: string[] = data.document_contents || [];

  const docSection = contents.length > 0
    ? '\n\nDOCUMENT CONTENT FOR VERIFICATION:\n' +
      contents.map((c, i) => `\nDocument ${i + 1} (${c.length} chars):\n${c}`).join('\n')
    : '';

  let model: string;
  let system: string;
  let user: string;

  if (agentNum === 1) {
    const val = calcValuationA2(area, ndvi, cloud, docs);
    model  = 'llama-3.3-70b-versatile';
    system = 'You are an expert real estate appraiser specializing in Indian property markets. Provide TOTAL property valuations in USD. Return ONLY valid JSON.';
    user   = `Analyze this property for land document verification and return a JSON valuation.

PROPERTY DATA:
Location: ${data.latitude}, ${data.longitude} | Satellite Area: ${area} sqm | NDVI: ${ndvi} | Documents: ${docs}
Satellite-based reference valuation: $${val.valuation.toLocaleString()} USD (use as anchor — adjust ±30% based on document quality)
${docSection}

VALUATION RULES:
- "valuation" = TOTAL property value in USD (NOT per sqm, NOT per sqft, NOT in INR)
- Use the reference valuation above as your baseline — do NOT deviate by more than 30% without strong justification
- Indian residential/agricultural land near Chennai: typically $1,000–$2,500 per sqm

STRICT VERIFICATION RULES:
- Document MUST be: Sale Deed, Purchase Deed, Land Title, Property Deed, Transfer Deed, or Conveyance Deed → else score=0
- ALL mandatory fields must exist: survey/plot number, owner name+address, property location, total area, boundaries, deed type+registration → missing any → score 0-30
- Placeholders (TODO/TBD/N/A) → score=0 | Area mismatch >20% vs ${area} sqm → add red flag

Return ONLY:
{"valuation":<total USD>,"confidence":<0-100>,"reasoning":"<findings>","risk_factors":["<r>"],"document_verification":{"is_land_document":<bool>,"document_type_found":"<t>","authenticity_score":<0-100>,"missing_fields":["<f>"],"red_flags":["<f>"]},"agent":"groq"}`;

  } else if (agentNum === 2) {
    const val = calcValuationA2(area, ndvi, cloud, docs);
    model  = 'llama-3.3-70b-versatile';
    system = 'You are a real estate valuation expert for land document verification. REJECT if mandatory fields are missing. Return ONLY valid JSON.';
    user   = `Property Analysis — STRICT Land Document Verification

SATELLITE: ${area} sqm | NDVI ${ndvi} | Cloud ${cloud}%
DOCS: ${docs} submitted | Base valuation: $${val.valuation.toLocaleString()} | Confidence: ${val.confidence}%
${docSection}

VALID doc types: Sale Deed, Purchase Deed, Land Title, Property Deed, Transfer Deed, Conveyance Deed → else score=0
ALL required: survey/plot/deed number | owner name+address | property location | total area | boundaries | deed type+registration
Rules: missing field → 0-20 | placeholder → 0 | area mismatch >20% vs ${area} sqm → flag

Return ONLY:
{"valuation":<USD>,"confidence":<0-100>,"reasoning":"<4-5 sentences>","risk_factors":["<r>"],"document_verification":{"is_land_document":<bool>,"document_type_found":"<t>","authenticity_score":<0-100>,"missing_fields":["<f>"],"red_flags":["<f>"]},"agent":"groq"}`;

  } else {
    const val = calcValuationA3(area, ndvi, cloud, docs);
    model  = 'llama-3.1-8b-instant';
    system = 'You are a certified land surveyor. Verify all 8 mandatory land document fields. REJECT non-compliant documents. Return ONLY valid JSON.';
    user   = `Land Document Authentication

SATELLITE: ${area} sqm | NDVI ${ndvi} | Cloud ${cloud}%
DOCS: ${docs} submitted | Valuation: $${val.valuation.toLocaleString()} | Confidence: ${val.confidence}%
${docSection}

VALID types: Sale/Purchase Deed, Land/Property Title, Transfer/Conveyance Deed → else score=0
8 REQUIRED fields: (1) Survey/Plot/Deed Number (2) Owner Name (3) Owner Address (4) Property Location (5) Total Area (6) Boundaries (7) Deed Type (8) Registration Details
Penalties: missing field → 0-25 | placeholder → 0 | area mismatch >20% vs ${area} sqm → flag | suspicious → 0-10

Return ONLY:
{"valuation":<USD>,"confidence":<0-100>,"reasoning":"<3-4 sentences>","risk_factors":["<r>"],"document_verification":{"is_land_document":<bool>,"document_type_found":"<t>","authenticity_score":<0-100>,"missing_fields":["<f>"],"red_flags":["<f>"]},"agent":"llama"}`;
  }

  try {
    const completion = await groq.chat.completions.create({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.3,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');

    if (result.document_verification) {
      const dv = result.document_verification;
      logger.info(`   📋 Agent ${agentNum}: land_doc=${dv.is_land_document} score=${dv.authenticity_score}${dv.missing_fields?.length ? ` missing=[${dv.missing_fields.join(', ')}]` : ''}`);
    }

    return result;
  } catch (e: any) {
    logger.error(`   ❌ Agent ${agentNum} error: ${e.message}`);
    return { valuation: 0, confidence: 0, reasoning: '', risk_factors: [], agent: 'groq', error: e.message };
  }
}

// ─── IPFS image upload ────────────────────────────────────────────────────────

async function uploadImageToIPFS(filePath: string, name: string): Promise<string | null> {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('pinataMetadata', JSON.stringify({ name }));
    const res = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', form, {
      headers: { Authorization: `Bearer ${process.env.PINATA_JWT}`, ...form.getHeaders() },
      timeout: 60_000,
    });
    return `https://gateway.pinata.cloud/ipfs/${res.data.IpfsHash}`;
  } catch (e: any) {
    logger.warn(`   ⚠️  Upload failed for ${name}: ${e.message}`);
    return null;
  } finally {
    try { fs.unlinkSync(filePath); } catch {}
  }
}

// ─── Document summary extraction ─────────────────────────────────────────────

function extractDocumentSummary(documentContents: string[], agentResponses: AgentResponse[]) {
  const summary = { seller: [] as string[], buyer: [] as string[], surveyNumber: [] as string[], area: [] as string[] };

  for (const content of documentContents) {
    const tryPatterns = (patterns: RegExp[]) => {
      for (const p of patterns) { const m = content.match(p); if (m && m[1] && m[1].trim().length > 3) return m[1].trim(); }
      return null;
    };

    const seller = tryPatterns([
      /seller[:\s]*\r?\n([^\r\n]+)/i, /vendor[:\s]*\r?\n([^\r\n]+)/i, /owner[:\s]*\r?\n([^\r\n]+)/i,
      /(?:seller|vendor|owner)[:\s]+([^,\r\n]+(?:,[^,\r\n]+){0,2})/i,
    ]);
    if (seller) summary.seller.push(seller);

    const buyer = tryPatterns([
      /purchaser[:\s]*\r?\n([^\r\n]+)/i, /buyer[:\s]*\r?\n([^\r\n]+)/i, /vendee[:\s]*\r?\n([^\r\n]+)/i,
      /(?:purchaser|buyer|vendee)[:\s]+([^,\r\n]+(?:,[^,\r\n]+){0,2})/i,
    ]);
    if (buyer) summary.buyer.push(buyer);

    const survey = tryPatterns([
      /(?:rs\s+plot\s+no|plot\s+no)[:\s]*([^\r\n,]+)/i,
      /(?:survey|plot)[\s\w]*(?:number|no\.?|#)[:\s]*([^\r\n,]+)/i,
    ]);
    if (survey) summary.surveyNumber.push(survey);

    const areaMatch = content.match(/(?:total\s+area|area)[:\s]*([0-9,]+\.?\d*)\s*(sq\.?\s*(?:m|ft|meters?|feet|yards?|acres?))/i);
    if (areaMatch) summary.area.push(`${areaMatch[1]} ${areaMatch[2]}`);
  }

  // Fallback: extract from agent reasoning
  for (const res of agentResponses) {
    const r = res.reasoning || '';
    if (!summary.seller.length) {
      const m = r.match(/(?:seller|owner|vendor)[:\s]+([^\n,\.]+)/i);
      if (m) summary.seller.push(m[1].trim());
    }
    if (!summary.buyer.length) {
      const m = r.match(/(?:buyer|purchaser|vendee)[:\s]+([^\n,\.]+)/i);
      if (m) summary.buyer.push(m[1].trim());
    }
    if (!summary.surveyNumber.length) {
      const m = r.match(/(?:survey|plot)[:\s#]+([^\n,\.]+)/i);
      if (m) summary.surveyNumber.push(m[1].trim());
    }
    if (!summary.area.length) {
      const m = r.match(/(\d+[\d,]*\.?\d*)\s*(sq\.?m|sq\.?ft|acres?|hectares?)/i);
      if (m) summary.area.push(`${m[1]} ${m[2]}`);
    }
  }

  return summary;
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export async function processVerificationRequest(request: VerificationRequest) {
  const startTime = Date.now();
  const elapsed = () => `${((Date.now() - startTime) / 1000).toFixed(1)}s`;

  try {
    logger.info('🔄 Starting AI analysis pipeline...\n');

    if (request.documentHashes.length === 0) throw new Error('REJECTED: No documents provided.');

    // ── Step 0 + 0.5: Validate accessibility + fetch content in parallel ──
    logger.info(`📄 Fetching ${request.documentHashes.length} document(s)...`);
    const documentContents = await Promise.all(
      request.documentHashes.map(async (hash) => {
        // Quick HEAD check to validate accessibility
        const clean = hash.replace('ipfs://', '');
        const check = await fetch(`https://gateway.pinata.cloud/ipfs/${clean}`, { method: 'HEAD' }).catch(() => null);
        if (!check?.ok) throw new Error(`REJECTED: Document ${clean.substring(0, 20)} not accessible`);
        logger.info(`📄 Validating document: ${clean.substring(0, 20)}...`);
        return fetchDocumentContent(hash);
      })
    );
    logger.info(`✅ ${documentContents.length} document(s) fetched [${elapsed()}]\n`);

    for (let i = 0; i < documentContents.length; i++) {
      const c = documentContents[i];
      logger.info(`   Doc ${i + 1}: ${c.length} chars — ${c.substring(0, 150).replace(/\n/g, ' ')}...`);
    }

    // ── Step 1: Satellite + Step 2: Agents — launch CONCURRENTLY ──
    logger.info('📡 Fetching satellite imagery + launching agents...');

    const satellitePromise = fetchSatelliteData(request.latitude, request.longitude);

    // Agents need satellite data, so wait for satellite first, then fire agents
    const satelliteData = await satellitePromise;
    logger.info(`✅ Satellite: ${satelliteData.area_sqm} sqm, NDVI ${satelliteData.ndvi}, cloud ${satelliteData.cloud_coverage}% [${elapsed()}]\n`);

    const analysisPackage = {
      request_id: request.requestId,
      latitude: request.latitude,
      longitude: request.longitude,
      satellite_data: satelliteData,
      document_count: request.documentHashes.length,
      document_hashes: request.documentHashes,
      document_contents: documentContents,
    };

    // ── Upload images + run agents in parallel ──
    logger.info('📸 Uploading satellite images & running 3 AI agents in parallel...');
    const id = request.requestId;

    const [rgbUrl, ndviUrl, cirUrl, trueColorUrl, agent1Result, agent2Result, agent3Result] = await Promise.all([
      uploadImageToIPFS(satelliteData.rgb_image_path,        `satellite_rgb_${id}.png`),
      uploadImageToIPFS(satelliteData.ndvi_image_path,       `satellite_ndvi_${id}.png`),
      uploadImageToIPFS(satelliteData.cir_image_path,        `satellite_cir_${id}.png`),
      uploadImageToIPFS(satelliteData.true_color_image_path, `satellite_true_color_${id}.png`),
      runAgent(1, analysisPackage),
      runAgent(2, analysisPackage),
      runAgent(3, analysisPackage),
    ]);

    // Attach uploaded URLs
    if (rgbUrl)       { satelliteData.rgb_image_url   = rgbUrl;   logger.info(`   ✅ RGB: ${rgbUrl}`); }
    if (ndviUrl)      { satelliteData.ndvi_image_url  = ndviUrl;  logger.info(`   ✅ NDVI: ${ndviUrl}`); }
    if (cirUrl)       { satelliteData.cir_image_url   = cirUrl;   logger.info(`   ✅ CIR: ${cirUrl}`); }
    if (trueColorUrl) { satelliteData.true_color_url  = trueColorUrl; logger.info(`   ✅ True Color: ${trueColorUrl}`); }

    // Remove temp paths
    delete satelliteData.rgb_image_path;
    delete satelliteData.ndvi_image_path;
    delete satelliteData.cir_image_path;
    delete satelliteData.true_color_image_path;

    logger.info(`✅ Images + agents complete [${elapsed()}]\n`);

    // ── Filter agent responses ──
    const responses = [agent1Result, agent2Result, agent3Result];
    const validResponses: AgentResponse[] = [];

    for (let i = 0; i < responses.length; i++) {
      if (responses[i].error) {
        logger.error(`❌ Agent ${i + 1} (${AGENT_MODELS[i]}) failed: ${responses[i].error}`);
      } else {
        validResponses.push(responses[i]);
        logger.info(`✅ Agent ${i + 1} — ${AGENT_MODELS[i]}: $${responses[i].valuation.toLocaleString()} (${responses[i].confidence}% confidence)`);
      }
    }

    if (validResponses.length < 2) throw new Error(`Insufficient AI responses: only ${validResponses.length} succeeded`);

    // ── Document summary & validation ──
    const summary = extractDocumentSummary(documentContents, validResponses);

    logger.info('\n📄 DOCUMENT SUMMARY:');
    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info(`👤 Seller/Owner:     ${summary.seller.length    ? [...new Set(summary.seller)].join(', ')       : 'NOT FOUND ❌'}`);
    logger.info(`👤 Buyer/Purchaser:  ${summary.buyer.length     ? [...new Set(summary.buyer)].join(', ')        : 'NOT FOUND ❌'}`);
    logger.info(`📍 Survey/Plot No:   ${summary.surveyNumber.length ? [...new Set(summary.surveyNumber)].join(', ') : 'NOT FOUND ⚠️'}`);
    logger.info(`📏 Property Area:    ${summary.area.length      ? [...new Set(summary.area)].join(', ')         : 'NOT FOUND ⚠️'}`);
    logger.info('═══════════════════════════════════════════════════════════════\n');

    if (!summary.seller.length) throw new Error('REJECTED: Seller/Owner information missing from document.');
    if (!summary.buyer.length)  throw new Error('REJECTED: Buyer/Purchaser information missing from document.');

    // Authenticity score summary
    const authScores = validResponses.filter(r => r.document_verification).map(r => r.document_verification!.authenticity_score);
    if (authScores.length) {
      const avg = authScores.reduce((a, b) => a + b, 0) / authScores.length;
      const issues = validResponses.flatMap(r => [...(r.document_verification?.red_flags || []), ...(r.document_verification?.missing_fields || []).map(f => `Missing: ${f}`)]);
      if (avg < 60) logger.warn(`⚠️  Avg authenticity score: ${avg.toFixed(1)}%`);
      else          logger.info(`📊 Avg authenticity score: ${avg.toFixed(1)}%`);
      if (issues.length) logger.warn(`⚠️  Issues: ${[...new Set(issues)].slice(0, 5).join(', ')}`);
    }

    // ── Consensus ──
    logger.info('\n🔮 Calculating consensus...');
    const consensus = calculateConsensus(validResponses);
    logger.info(`✅ Consensus: $${consensus.finalValuation.toLocaleString()} @ ${consensus.finalConfidence}% confidence (score ${consensus.consensusScore}/100, σ ±$${consensus.statistics.standardDeviation.toLocaleString()})\n`);

    logger.info('📊 AGENT BREAKDOWN:');
    consensus.nodeResponses.forEach((n, i) => {
      logger.info(`   ${i + 1}. ${AGENT_MODELS[i]}: $${n.valuation.toLocaleString()} @ ${n.confidence}%`);
    });

    // ── Verify request is still PENDING ──
    logger.info('\n⛓️  Submitting to blockchain...');
    try {
      const RWA_ORACLE_CORE_ADDRESS = process.env.RWA_ORACLE_CORE_ADDRESS!;
      const ORACLE_CORE_ABI = [{
        inputs: [{ name: '_requestId', type: 'uint256' }],
        name: 'getRequest',
        outputs: [{ components: [
          { name: 'requestId', type: 'uint256' }, { name: 'owner', type: 'address' },
          { name: 'assetType', type: 'uint8' }, { name: 'location', type: 'string' },
          { name: 'ipfsHashes', type: 'string[]' }, { name: 'status', type: 'uint8' },
          { name: 'timestamp', type: 'uint256' }, { name: 'valuation', type: 'uint256' },
          { name: 'confidence', type: 'uint256' },
        ], type: 'tuple' }],
        stateMutability: 'view', type: 'function',
      }] as const;

      const req = await publicClient.readContract({
        address: RWA_ORACLE_CORE_ADDRESS as `0x${string}`,
        abi: ORACLE_CORE_ABI,
        functionName: 'getRequest',
        args: [BigInt(request.requestId)],
      });

      if (req.status !== 0) {
        const names = ['PENDING', 'PROCESSING', 'VERIFIED', 'REJECTED'];
        logger.warn(`⚠️  Request #${request.requestId} already ${names[req.status]} — skipping`);
        return;
      }
    } catch (e: any) {
      logger.warn(`⚠️  Could not verify request status: ${e.message} — attempting anyway`);
    }

    // ── Submit ──
    const { txHash, evidenceHash } = await submitVerification(
      request.requestId, consensus.finalValuation, consensus.finalConfidence,
      satelliteData, validResponses, consensus.nodeResponses
    );
    logger.info(`✅ OracleRouter: ${txHash}`);

    if (consensus.finalConfidence >= 70) {
      const boosted = Math.min(100, consensus.finalConfidence + 10);
      await submitToConsensusEngine(request.requestId, consensus.finalValuation, boosted, evidenceHash);
      logger.info(`✅ ConsensusEngine submitted (confidence boosted ${consensus.finalConfidence}% → ${boosted}%)`);

      logger.info(`ℹ️  Tokenization handled by RWAAssetManager.registerAsset() on-chain`);
    } else {
      logger.warn(`⚠️  Confidence ${consensus.finalConfidence}% < 70% — skipping ConsensusEngine + tokenization`);
    }

    logger.info(`\n✅ REQUEST #${request.requestId} COMPLETED IN ${elapsed()}\n`);

  } catch (error: any) {
    const msg = error?.message || String(error);
    if (msg.includes('REJECTED:')) {
      logger.warn(`\n🚫 REQUEST REJECTED: ${msg.replace('REJECTED:', '').trim()}`);
      try {
        await submitRejection(request.requestId, msg.replace('REJECTED:', '').trim());
        logger.info(`✅ Rejection submitted [${elapsed()}]\n`);
      } catch (e) {
        logger.error('❌ Failed to submit rejection:', e);
        throw e;
      }
    } else {
      logger.error(`❌ Error processing request [${elapsed()}]:`, error);
      throw error;
    }
  }
}
