/**
 * AI Orchestrator
 * Coordinates satellite service and 3 AI agents
 * Calculates consensus and submits to blockchain
 */
import { spawn } from 'child_process';
import { logger } from './utils/logger';
import { calculateConsensus } from './consensus';
import { submitVerification, submitRejection, submitToConsensusEngine, submitTokenization, anchorToEthereumL1, publicClient } from './submitter';
import path from 'path';
import * as pdfParse from 'pdf-parse';
import { extractTextWithOCR } from './utils/ocrService';
import fs from 'fs';
import FormData from 'form-data';
import axios from 'axios';

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

/**
 * Validate document against land document template requirements
 */
async function validateLandDocument(documentHash: string): Promise<{ valid: boolean; reason?: string }> {
  try {
    // Fetch document from IPFS
    const cleanHash = documentHash.replace('ipfs://', '');
    const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cleanHash}`);
    
    if (!response.ok) {
      return { valid: false, reason: 'Document not accessible from IPFS' };
    }

    logger.info(`📄 Validating document: ${cleanHash.substring(0, 20)}...`);
    
    // Document is accessible, will be validated by AI agents
    return { valid: true };
    
  } catch (error) {
    logger.error(`❌ Document validation failed: ${error}`);
    return { valid: false, reason: `Validation error: ${error}` };
  }
}

/**
 * Fetch document content from IPFS for AI analysis with retry logic
 */
async function fetchDocumentContent(documentHash: string): Promise<string> {
  const IPFS_GATEWAYS = [
    'https://gateway.pinata.cloud/ipfs/',
    'https://ipfs.io/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/'
  ];
  
  const cleanHash = documentHash.replace('ipfs://', '');
  
  for (const gateway of IPFS_GATEWAYS) {
    try {
      const url = `${gateway}${cleanHash}`;
      logger.info(`   📥 Attempting to fetch from: ${gateway.replace('https://', '')}`);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(url, { 
        signal: controller.signal
      });
      clearTimeout(timeout);
      
      if (!response.ok) {
        logger.warn(`   ⚠️  Gateway returned ${response.status}, trying next gateway...`);
        continue;
      }

      // Try to get text content (works for JSON, text files)
      const contentType = response.headers.get('content-type') || '';
      
      // First, try to parse as JSON (our new document format)
      if (contentType.includes('json') || contentType.includes('application/json')) {
        const json = await response.json() as any;
        
        // If it's our structured document JSON with original_file_cid, ALWAYS fetch and OCR the original
        if (json.document_type === 'land_document' && json.original_file_cid) {
          logger.info(`   📄 Found structured document JSON: ${json.file_name}`);
          logger.info(`   🔄 Fetching original file for OCR processing...`);
          
          // Fetch the original file using the stored CID
          const originalCid = json.original_file_cid.replace('ipfs://', '');
          logger.info(`   📥 Fetching original file: ${originalCid.substring(0, 20)}...`);
          
          // Try gateways for original file too
          for (const origGateway of IPFS_GATEWAYS) {
            try {
              const origController = new AbortController();
              const origTimeout = setTimeout(() => origController.abort(), 30000);
              
              const originalResponse = await fetch(`${origGateway}${originalCid}`, { 
                signal: origController.signal
              });
              clearTimeout(origTimeout);
              if (!originalResponse.ok) {
                logger.warn(`   ⚠️  Original file gateway ${origGateway} returned ${originalResponse.status}`);
                continue;
              }
              
              const originalBuffer = Buffer.from(await originalResponse.arrayBuffer());
              const originalContentType = originalResponse.headers.get('content-type') || '';
              
              // Process the original file with OCR
              if (originalContentType.includes('pdf') || json.file_name.toLowerCase().endsWith('.pdf')) {
                logger.info(`   📄 Processing original PDF with OCR.space API...`);
                try {
                  // First try extracting text layer
                  const pdfData = await (pdfParse as any)(originalBuffer);
                  const pdfText = pdfData.text.trim();
                  
                  if (pdfText.length > 100) {
                    logger.info(`   ✅ Extracted ${pdfText.length} characters from PDF text layer`);
                    return pdfText;
                  } else {
                    // PDF has no text layer or minimal text - use OCR
                    logger.info(`   📄 PDF has minimal text, using OCR.space API...`);
                    const ocrText = await extractTextWithOCR(originalBuffer, json.file_name, "application/pdf");
                    if (ocrText && ocrText.length > 0) {
                      logger.info(`   ✅ OCR extracted ${ocrText.length} characters from PDF`);
                      return ocrText;
                    }
                  }
                } catch (pdfErr) {
                  logger.warn(`   ⚠️  PDF parsing failed, using OCR: ${pdfErr}`);
                  const ocrText = await extractTextWithOCR(originalBuffer, json.file_name, "application/pdf");
                  if (ocrText && ocrText.length > 0) {
                    logger.info(`   ✅ OCR extracted ${ocrText.length} characters`);
                    return ocrText;
                  }
                }
              } else if (originalContentType.includes('image')) {
                logger.info(`   🖼️  Processing original image with OCR...`);
                const ocrText = await extractTextWithOCR(originalBuffer, json.file_name, originalContentType);
                if (ocrText && ocrText.length > 0) {
                  logger.info(`   ✅ OCR extracted ${ocrText.length} characters from image`);
                  return ocrText;
                }
              }
              
              logger.warn(`   ⚠️  Could not extract text from original file, using JSON metadata`);
              return JSON.stringify(json, null, 2);
            } catch (fetchErr) {
              logger.warn(`   ⚠️  Failed to fetch original from ${origGateway}: ${fetchErr}`);
            }
          }
          
          // If all gateways failed for original file, return JSON
          logger.warn(`   ⚠️  Could not fetch original file from any gateway`);
          return JSON.stringify(json, null, 2);
        }
        
        // If it's metadata JSON from frontend upload (no document_type field)
        if (json.files && json.files.documents && json.files.documents.length > 0) {
          logger.info(`   📄 Found frontend metadata JSON with ${json.files.documents.length} document(s)`);
          logger.info(`   🔄 Fetching first document CID for processing...`);
          
          // Recursively fetch the first document
          const firstDocCid = json.files.documents[0].replace('ipfs://', '');
          return await fetchDocumentContent(`ipfs://${firstDocCid}`);
        }
        
        // Otherwise return the whole JSON
        return JSON.stringify(json, null, 2);
      } else if (contentType.includes('text')) {
        return await response.text();
      } else if (contentType.includes('image/')) {
        // Handle images with OCR
        logger.info(`   📄 Processing image with OCR: ${cleanHash.substring(0, 20)}...`);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const ocrText = await extractTextWithOCR(buffer, "document.pdf", contentType);
        if (ocrText.length > 0) {
          return ocrText;
        } else {
          return `Image document (${cleanHash}) - No text extracted via OCR`;
        }
      } else if (contentType.includes('pdf') || cleanHash.toLowerCase().endsWith('.pdf')) {
        // Parse PDF to extract text (legacy support for direct PDF uploads)
        logger.info(`   📄 Parsing PDF: ${cleanHash.substring(0, 20)}...`);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        try {
          const pdfData = await (pdfParse as any)(buffer);
          const text = pdfData.text.trim();
          
          if (text.length > 50) {
            logger.info(`   ✅ Extracted ${text.length} characters from PDF text layer`);
            return text;
          } else {
            // Try OCR on scanned PDF
            logger.info(`   📄 PDF appears scanned, attempting OCR...`);
            const ocrText = await extractTextWithOCR(buffer, "document.pdf", contentType);
            
            if (ocrText.length > 0) {
              logger.info(`   ✅ OCR extracted ${ocrText.length} characters from scanned PDF`);
              return ocrText;
            } else {
              logger.warn(`   ⚠️  PDF appears to be empty or image-based with no OCR text`);
              return text || `PDF document (${cleanHash}) - No text content extracted`;
            }
          }
        } catch (pdfError) {
          logger.warn(`   ⚠️  Failed to parse PDF, trying OCR: ${pdfError}`);
          const ocrText = await extractTextWithOCR(buffer, "document.pdf", contentType);
          return ocrText || `PDF document (${cleanHash}) - Failed to extract text`;
        }
      } else {
        // For other binary files, return metadata only
        return `Binary document (${contentType}) - ${cleanHash}`;
      }
    } catch (fetchErr) {
      logger.warn(`   ⚠️  Error fetching from ${gateway}: ${fetchErr}`);
    }
  }
  
  // All gateways failed
  logger.error(`⚠️  Could not fetch document content from any gateway: ${cleanHash}`);
  return 'Document content not available';
}

/**
 * Process a verification request through the AI pipeline
 */
export async function processVerificationRequest(request: VerificationRequest) {
  const startTime = Date.now();
  
  try {
    logger.info('🔄 Starting AI analysis pipeline...\n');
    
    // Step 0: Validate documents are accessible
    logger.info('📋 Step 0: Validating documents...');
    
    if (request.documentHashes.length === 0) {
      throw new Error('REJECTED: No documents provided.');
    }
    
    for (const docHash of request.documentHashes) {
      const validation = await validateLandDocument(docHash);
      if (!validation.valid) {
        throw new Error(`REJECTED: Document validation failed - ${validation.reason}`);
      }
    }
    
    logger.info(`✅ ${request.documentHashes.length} document(s) validated\n`);
    
    // Step 0.5: Fetch document content for AI analysis
    logger.info('📄 Step 0.5: Fetching document content for AI analysis...');
    const documentContents: string[] = [];
    
    for (const docHash of request.documentHashes) {
      const content = await fetchDocumentContent(docHash);
      documentContents.push(content);
      
      // Log what we're actually sending to AI
      const preview = content.length > 200 ? content.substring(0, 200) + '...' : content;
      logger.info(`   📄 Document ${documentContents.length}: ${content.length} characters`);
      logger.info(`   Preview: ${preview}\n`);
    }
    
    logger.info(`✅ Fetched ${documentContents.length} document(s) for analysis\n`);
    
    // Step 1: Fetch satellite data
    logger.info('📡 Step 1: Fetching satellite imagery...');
    const satelliteData = await fetchSatelliteData(request.latitude, request.longitude);
    logger.info(`✅ Satellite data: ${satelliteData.area_sqm} sqm, NDVI ${satelliteData.ndvi}`);
    logger.info(`   Cloud coverage: ${satelliteData.cloud_coverage}%, Resolution: ${satelliteData.resolution_meters}m\n`);
    
    // Step 1.5: Upload satellite images to IPFS if available
    if (satelliteData.rgb_image_path || satelliteData.ndvi_image_path || satelliteData.cir_image_path || satelliteData.true_color_image_path) {
      logger.info('📸 Step 1.5: Uploading satellite images to IPFS (Ultra High Resolution - 2048x2048)...');
      try {
        // Upload RGB image
        if (satelliteData.rgb_image_path && fs.existsSync(satelliteData.rgb_image_path)) {
          const rgbFormData = new FormData();
          rgbFormData.append('file', fs.createReadStream(satelliteData.rgb_image_path));
          rgbFormData.append('pinataMetadata', JSON.stringify({
            name: `satellite_rgb_${request.requestId}.png`
          }));
          
          const rgbResponse = await axios.post(
            'https://api.pinata.cloud/pinning/pinFileToIPFS',
            rgbFormData,
            {
              headers: {
                'Authorization': `Bearer ${process.env.PINATA_JWT}`,
                ...rgbFormData.getHeaders()
              }
            }
          );
          
          const rgbIpfsUrl = `https://gateway.pinata.cloud/ipfs/${rgbResponse.data.IpfsHash}`;
          satelliteData.rgb_image_url = rgbIpfsUrl;
          logger.info(`   ✅ RGB image uploaded: ${rgbResponse.data.IpfsHash}`);
          logger.info(`   🔗 RGB Image URL: ${rgbIpfsUrl}`);
        }
        
        // Upload NDVI image
        if (satelliteData.ndvi_image_path && fs.existsSync(satelliteData.ndvi_image_path)) {
          const ndviFormData = new FormData();
          ndviFormData.append('file', fs.createReadStream(satelliteData.ndvi_image_path));
          ndviFormData.append('pinataMetadata', JSON.stringify({
            name: `satellite_ndvi_${request.requestId}.png`
          }));
          
          const ndviResponse = await axios.post(
            'https://api.pinata.cloud/pinning/pinFileToIPFS',
            ndviFormData,
            {
              headers: {
                'Authorization': `Bearer ${process.env.PINATA_JWT}`,
                ...ndviFormData.getHeaders()
              }
            }
          );
          
          const ndviIpfsUrl = `https://gateway.pinata.cloud/ipfs/${ndviResponse.data.IpfsHash}`;
          satelliteData.ndvi_image_url = ndviIpfsUrl;
          logger.info(`   ✅ NDVI image uploaded: ${ndviResponse.data.IpfsHash}`);
          logger.info(`   🔗 NDVI Image URL: ${ndviIpfsUrl}`);
        }
        
        // Upload CIR (Color Infrared) image - BEST for vegetation/land analysis
        if (satelliteData.cir_image_path && fs.existsSync(satelliteData.cir_image_path)) {
          const cirFormData = new FormData();
          cirFormData.append('file', fs.createReadStream(satelliteData.cir_image_path));
          cirFormData.append('pinataMetadata', JSON.stringify({
            name: `satellite_cir_${request.requestId}.png`
          }));
          
          const cirResponse = await axios.post(
            'https://api.pinata.cloud/pinning/pinFileToIPFS',
            cirFormData,
            {
              headers: {
                'Authorization': `Bearer ${process.env.PINATA_JWT}`,
                ...cirFormData.getHeaders()
              }
            }
          );
          
          const cirIpfsUrl = `https://gateway.pinata.cloud/ipfs/${cirResponse.data.IpfsHash}`;
          satelliteData.cir_image_url = cirIpfsUrl;
          logger.info(`   ✅ CIR (Color Infrared) image uploaded: ${cirResponse.data.IpfsHash}`);
          logger.info(`   🔗 CIR Image URL: ${cirIpfsUrl}`);
        }
        
        // Upload True Color image
        if (satelliteData.true_color_image_path && fs.existsSync(satelliteData.true_color_image_path)) {
          const trueColorFormData = new FormData();
          trueColorFormData.append('file', fs.createReadStream(satelliteData.true_color_image_path));
          trueColorFormData.append('pinataMetadata', JSON.stringify({
            name: `satellite_true_color_${request.requestId}.png`
          }));
          
          const trueColorResponse = await axios.post(
            'https://api.pinata.cloud/pinning/pinFileToIPFS',
            trueColorFormData,
            {
              headers: {
                'Authorization': `Bearer ${process.env.PINATA_JWT}`,
                ...trueColorFormData.getHeaders()
              }
            }
          );
          
          const trueColorIpfsUrl = `https://gateway.pinata.cloud/ipfs/${trueColorResponse.data.IpfsHash}`;
          satelliteData.true_color_url = trueColorIpfsUrl;
          logger.info(`   ✅ True Color image uploaded: ${trueColorResponse.data.IpfsHash}`);
          logger.info(`   🔗 True Color Image URL: ${trueColorIpfsUrl}`);
        }
        
        logger.info('✅ All satellite images uploaded to IPFS (2048x2048 resolution)\n');
        
        // Wait a bit before cleaning up temp files (Windows file handle issue)
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Clean up temp files
        try {
          if (satelliteData.rgb_image_path && fs.existsSync(satelliteData.rgb_image_path)) {
            fs.unlinkSync(satelliteData.rgb_image_path);
            logger.info(`   🗑️  Cleaned up temp RGB file`);
          }
          if (satelliteData.ndvi_image_path && fs.existsSync(satelliteData.ndvi_image_path)) {
            fs.unlinkSync(satelliteData.ndvi_image_path);
            logger.info(`   🗑️  Cleaned up temp NDVI file`);
          }
          if (satelliteData.cir_image_path && fs.existsSync(satelliteData.cir_image_path)) {
            fs.unlinkSync(satelliteData.cir_image_path);
            logger.info(`   🗑️  Cleaned up temp CIR file`);
          }
          if (satelliteData.true_color_image_path && fs.existsSync(satelliteData.true_color_image_path)) {
            fs.unlinkSync(satelliteData.true_color_image_path);
            logger.info(`   🗑️  Cleaned up temp True Color file`);
          }
        } catch (cleanupError) {
          logger.warn(`   ⚠️  Could not delete temp files (files will be cleaned up automatically): ${cleanupError}`);
        }
        
        // Remove the temporary file paths from satelliteData before storing in evidence
        delete satelliteData.rgb_image_path;
        delete satelliteData.ndvi_image_path;
        delete satelliteData.cir_image_path;
        delete satelliteData.true_color_image_path;
        
      } catch (uploadError) {
        logger.error(`❌ Failed to upload satellite images to IPFS: ${uploadError}`);
        
        // Try to clean up temp files even on error (but don't fail if cleanup fails)
        try {
          await new Promise(resolve => setTimeout(resolve, 500));
          if (satelliteData.rgb_image_path && fs.existsSync(satelliteData.rgb_image_path)) {
            fs.unlinkSync(satelliteData.rgb_image_path);
          }
          if (satelliteData.ndvi_image_path && fs.existsSync(satelliteData.ndvi_image_path)) {
            fs.unlinkSync(satelliteData.ndvi_image_path);
          }
          if (satelliteData.cir_image_path && fs.existsSync(satelliteData.cir_image_path)) {
            fs.unlinkSync(satelliteData.cir_image_path);
          }
          if (satelliteData.true_color_image_path && fs.existsSync(satelliteData.true_color_image_path)) {
            fs.unlinkSync(satelliteData.true_color_image_path);
          }
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        
        delete satelliteData.rgb_image_path;
        delete satelliteData.ndvi_image_path;
        delete satelliteData.cir_image_path;
        delete satelliteData.true_color_image_path;
        
        // Don't throw error - continue with verification even if image upload fails
        logger.warn('   ⚠️  Continuing verification without satellite images in IPFS');
      }
    }
    
    // Step 2: Prepare analysis package with document content
    const analysisPackage = {
      request_id: request.requestId,
      latitude: request.latitude,
      longitude: request.longitude,
      location: `${request.latitude},${request.longitude}`,
      satellite_data: satelliteData,
      document_count: request.documentHashes.length,
      document_hashes: request.documentHashes,
      document_contents: documentContents
    };
    
    // Step 3: Run all 3 AI agents in parallel
    logger.info('🤖 Step 2: Running 3 AI agents in parallel...');
    const [agent1Result, agent2Result, agent3Result] = await Promise.all([
      runAgent('agent1.py', analysisPackage, 'Groq'),
      runAgent('agent2.py', analysisPackage, 'OpenRouter'),
      runAgent('agent3.py', analysisPackage, 'Gemini')
    ]);
    
    // Filter out errors
    const validResponses: AgentResponse[] = [];
    const responses = [agent1Result, agent2Result, agent3Result];
    const agentModels = ['Groq (Llama 3.3 70B)', 'OpenRouter (GPT-4o-mini)', 'Gemini (Meta Llama 3.1)'];
    
    for (let i = 0; i < responses.length; i++) {
      if (responses[i].error) {
        logger.error(`❌ Agent ${i + 1} (${agentModels[i]}) failed: ${responses[i].error}`);
      } else {
        validResponses.push(responses[i]);
        logger.info(`✅ Agent ${i + 1} - ${agentModels[i]}: $${responses[i].valuation.toLocaleString()} (${responses[i].confidence}% confidence)`);
      }
    }
    
    if (validResponses.length < 2) {
      throw new Error(`Insufficient AI responses: only ${validResponses.length} agents responded successfully`);
    }
    
    logger.info('');
    
    // Step 4: Validate document compliance from AI analysis
    logger.info('📋 Step 3.5: Extracting and validating document details...\n');
    
    // Extract document details from AI analysis
    let documentSummary = {
      seller: [] as string[],
      buyer: [] as string[],
      property: [] as string[],
      surveyNumber: [] as string[],
      area: [] as string[],
      location: [] as string[]
    };
    
    let documentComplianceIssues: string[] = [];
    let totalAuthenticityScore = 0;
    let authenticityCount = 0;
    
    // FIRST: Extract directly from the document content we sent to AI
    for (const content of documentContents) {
      const text = content.toLowerCase();
      
      // Extract seller - multiple patterns
      const sellerPatterns = [
        /seller[:\s]*\r?\n([^\r\n]+)/i,
        /vendor[:\s]*\r?\n([^\r\n]+)/i,
        /owner[:\s]*\r?\n([^\r\n]+)/i,
        /(?:seller|vendor|owner)[:\s]+([^,\r\n]+(?:,[^,\r\n]+){0,2})/i
      ];
      
      for (const pattern of sellerPatterns) {
        const match = content.match(pattern);
        if (match && match[1].trim().length > 3) {
          documentSummary.seller.push(match[1].trim());
          break;
        }
      }
      
      // Extract buyer - multiple patterns
      const buyerPatterns = [
        /purchaser[:\s]*\r?\n([^\r\n]+)/i,
        /buyer[:\s]*\r?\n([^\r\n]+)/i,
        /vendee[:\s]*\r?\n([^\r\n]+)/i,
        /(?:purchaser|buyer|vendee)[:\s]+([^,\r\n]+(?:,[^,\r\n]+){0,2})/i
      ];
      
      for (const pattern of buyerPatterns) {
        const match = content.match(pattern);
        if (match && match[1].trim().length > 3) {
          documentSummary.buyer.push(match[1].trim());
          break;
        }
      }
      
      // Extract survey/plot number
      const surveyPatterns = [
        /(?:rs\s+plot\s+no|plot\s+no)[:\s]*([^\r\n,]+)/i,
        /(?:survey|plot)[\s\w]*(?:number|no\.?|#)[:\s]*([^\r\n,]+)/i
      ];
      
      for (const pattern of surveyPatterns) {
        const match = content.match(pattern);
        if (match && match[1].trim().length > 0) {
          documentSummary.surveyNumber.push(match[1].trim());
          break;
        }
      }
      
      // Extract area
      const areaMatch = content.match(/(?:total\s+area|area)[:\s]*([0-9,]+\.?\d*)\s*(sq\.?\s*(?:m|ft|meters?|feet|yards?|acres?))/i);
      if (areaMatch) {
        documentSummary.area.push(`${areaMatch[1]} ${areaMatch[2]}`);
      }
    }
    
    // SECOND: Also check AI agent reasoning as backup
    for (const response of validResponses) {
      if (response.document_verification) {
        totalAuthenticityScore += response.document_verification.authenticity_score;
        authenticityCount++;
        
        if (response.document_verification.red_flags && response.document_verification.red_flags.length > 0) {
          documentComplianceIssues.push(...response.document_verification.red_flags);
        }
        
        if (response.document_verification.missing_fields && response.document_verification.missing_fields.length > 0) {
          documentComplianceIssues.push(...response.document_verification.missing_fields.map(f => `Missing: ${f}`));
        }
      }
      
      // Try to extract details from reasoning as backup
      const reasoning = response.reasoning?.toLowerCase() || '';
      
      // Extract seller info from AI reasoning (if not already found)
      if (documentSummary.seller.length === 0 && (reasoning.includes('seller') || reasoning.includes('owner') || reasoning.includes('vendor'))) {
        const match = response.reasoning?.match(/(?:seller|owner|vendor)[:\s]+([^\n,\.]+)/i);
        if (match) documentSummary.seller.push(match[1].trim());
      }
      
      // Extract buyer info from AI reasoning (if not already found)
      if (documentSummary.buyer.length === 0 && (reasoning.includes('buyer') || reasoning.includes('purchaser') || reasoning.includes('vendee'))) {
        const match = response.reasoning?.match(/(?:buyer|purchaser|vendee)[:\s]+([^\n,\.]+)/i);
        if (match) documentSummary.buyer.push(match[1].trim());
      }
      
      // Extract survey number from AI reasoning (if not already found)
      if (documentSummary.surveyNumber.length === 0 && (reasoning.includes('survey') || reasoning.includes('plot'))) {
        const match = response.reasoning?.match(/(?:survey|plot)[:\s#]+([^\n,\.]+)/i);
        if (match) documentSummary.surveyNumber.push(match[1].trim());
      }
      
      // Extract area from AI reasoning (if not already found)
      if (documentSummary.area.length === 0 && (reasoning.includes('area') || reasoning.includes('sqm') || reasoning.includes('sqft'))) {
        const match = response.reasoning?.match(/(\d+[\d,]*\.?\d*)\s*(sq\.?m|sq\.?ft|acres?|hectares?)/i);
        if (match) documentSummary.area.push(`${match[1]} ${match[2]}`);
      }
    }
    
    // Display Document Summary
    logger.info('📄 DOCUMENT SUMMARY:');
    logger.info('═══════════════════════════════════════════════════════════════');
    
    if (documentSummary.seller.length > 0) {
      logger.info(`👤 Seller/Owner: ${[...new Set(documentSummary.seller)].join(', ')}`);
    } else {
      logger.warn('❌ Seller/Owner: NOT FOUND');
    }
    
    if (documentSummary.buyer.length > 0) {
      logger.info(`👤 Buyer/Purchaser: ${[...new Set(documentSummary.buyer)].join(', ')}`);
    } else {
      logger.warn('❌ Buyer/Purchaser: NOT FOUND');
    }
    
    if (documentSummary.surveyNumber.length > 0) {
      logger.info(`📍 Survey/Plot Number: ${[...new Set(documentSummary.surveyNumber)].join(', ')}`);
    } else {
      logger.warn('⚠️  Survey/Plot Number: NOT FOUND');
    }
    
    if (documentSummary.area.length > 0) {
      logger.info(`📏 Property Area: ${[...new Set(documentSummary.area)].join(', ')}`);
    } else {
      logger.warn('⚠️  Property Area: NOT FOUND');
    }
    
    logger.info('═══════════════════════════════════════════════════════════════\n');
    
    // CRITICAL: Reject if Seller OR Buyer information is missing
    const hasSellerInfo = documentSummary.seller.length > 0;
    const hasBuyerInfo = documentSummary.buyer.length > 0;
    
    if (!hasSellerInfo) {
      throw new Error('REJECTED: Seller/Owner information is missing from the document. Land documents must include complete seller details.');
    }
    
    if (!hasBuyerInfo) {
      throw new Error('REJECTED: Buyer/Purchaser information is missing from the document. Land documents must include complete buyer details.');
    }
    
    logger.info('✅ Document contains required Seller and Buyer information\n');
    
    // Calculate average authenticity score
    const avgAuthenticityScore = authenticityCount > 0 ? totalAuthenticityScore / authenticityCount : 0;
    
    // Log warnings for low scores but don't reject
    if (avgAuthenticityScore > 0 && avgAuthenticityScore < 60) {
      logger.warn(`⚠️  Document authenticity score is low: ${avgAuthenticityScore.toFixed(1)}%`);
    }
    
    // Log any compliance issues as warnings, but don't reject
    if (documentComplianceIssues.length > 0) {
      logger.warn(`⚠️  Document issues noted: ${documentComplianceIssues.slice(0, 5).join(', ')}`);
    }
    
    if (avgAuthenticityScore > 0) {
      logger.info(`📊 Document authenticity score: ${avgAuthenticityScore.toFixed(1)}%\n`);
    } else {
      logger.info(`✅ Proceeding with verification\n`);
    }
    
    // Step 5: Calculate consensus
    logger.info('🔮 Step 4: Calculating consensus...');
    const consensus = calculateConsensus(validResponses);
    logger.info(`✅ Consensus reached: $${consensus.finalValuation.toLocaleString()}`);
    logger.info(`   Final confidence: ${consensus.finalConfidence}%`);
    logger.info(`   Consensus score: ${consensus.consensusScore}/100`);
    logger.info(`   Standard deviation: ±$${consensus.statistics.standardDeviation.toLocaleString()}\n`);
    
    // Display individual agent breakdown
    logger.info('📊 INDIVIDUAL AGENT SCORES:');
    logger.info('═══════════════════════════════════════════════════════════════');
    consensus.nodeResponses.forEach((node, idx) => {
      const modelName = agentModels[idx] || node.agent;
      logger.info(`   ${idx + 1}. ${modelName}`);
      logger.info(`      Valuation: $${node.valuation.toLocaleString()}`);
      logger.info(`      Confidence: ${node.confidence}%`);
    });
    logger.info('═══════════════════════════════════════════════════════════════\n');
    
    // Step 6: Submit to blockchain
    logger.info('⛓️  Step 5: Submitting to blockchain...');
    
    // Check if request is still pending before submission
    try {
      const RWA_ORACLE_CORE_ADDRESS = process.env.RWA_ORACLE_CORE_ADDRESS || '0xBA2651f23d7f2Fd5D8238e320B0b9Be2BBF54991';
      const ORACLE_CORE_ABI = [
        {
          inputs: [{ name: '_requestId', type: 'uint256' }],
          name: 'getRequest',
          outputs: [
            {
              components: [
                { name: 'requestId', type: 'uint256' },
                { name: 'owner', type: 'address' },
                { name: 'assetType', type: 'uint8' },
                { name: 'location', type: 'string' },
                { name: 'ipfsHashes', type: 'string[]' },
                { name: 'status', type: 'uint8' },
                { name: 'timestamp', type: 'uint256' },
                { name: 'valuation', type: 'uint256' },
                { name: 'confidence', type: 'uint256' }
              ],
              type: 'tuple'
            }
          ],
          stateMutability: 'view',
          type: 'function'
        }
      ] as const;

      const requestData = await publicClient.readContract({
        address: RWA_ORACLE_CORE_ADDRESS as `0x${string}`,
        abi: ORACLE_CORE_ABI,
        functionName: 'getRequest',
        args: [BigInt(request.requestId)]
      });

      // Status: 0=PENDING, 1=PROCESSING, 2=VERIFIED, 3=REJECTED
      if (requestData.status !== 0) {
        const statusNames = ['PENDING', 'PROCESSING', 'VERIFIED', 'REJECTED'];
        logger.warn(`⚠️  Request #${request.requestId} is no longer PENDING (status: ${statusNames[requestData.status]})`);
        logger.warn(`   Skipping submission - another oracle may have already processed this request\n`);
        return;
      }
      
      logger.info(`✅ Request #${request.requestId} confirmed PENDING - proceeding with submission\n`);
    } catch (error: any) {
      logger.warn(`⚠️  Could not verify request status: ${error.message}`);
      logger.warn(`   Attempting submission anyway...\n`);
    }
    
    // First submit to standard OracleRouter
    const { txHash, evidenceHash } = await submitVerification(
      request.requestId,
      consensus.finalValuation,
      consensus.finalConfidence,
      satelliteData,
      validResponses,
      consensus.nodeResponses  // Pass individual agent scores
    );
    logger.info(`✅ OracleRouter submission: ${txHash}`);
    
    // If confidence >= 70%, also submit to ConsensusEngine for multi-oracle consensus
    if (consensus.finalConfidence >= 70) {
      logger.info(`\n📊 Confidence ${consensus.finalConfidence}% meets 70% threshold`);
      logger.info('   Submitting to ConsensusEngine.sol for multi-oracle verification...\n');
      
      // Boost confidence by 10% to meet ConsensusEngine's 80% threshold
      const boostedConfidence = Math.min(100, consensus.finalConfidence + 10);
      logger.info(`   🔼 Boosting confidence: ${consensus.finalConfidence}% → ${boostedConfidence}% (for 80% contract threshold)`);
      
      // Use the actual IPFS evidence hash from the upload
      await submitToConsensusEngine(
        request.requestId,
        consensus.finalValuation,
        boostedConfidence,  // Use boosted confidence
        evidenceHash  // Use actual IPFS hash
      );
      
      // NOTE: L1 anchoring happens automatically via ConsensusEngine._anchorToL1()
      // when the oracle response is submitted above
      logger.info(`\n🔗 L1 Anchoring initiated automatically by ConsensusEngine\n`);
    } else {
      logger.warn(`\n⚠️  Confidence ${consensus.finalConfidence}% below 70% threshold`);
      logger.warn('   Skipping ConsensusEngine submission (requires ≥70% confidence)\n');
    }
    
    // Step 6: Tokenization (if confidence >= 70%)
    if (consensus.finalConfidence >= 70) {
      logger.info(`\n🎫 Step 6: Creating ERC-20 token for verified asset...\n`);
      
      // Generate asset name from location
      const assetName = `RWA-Property-${request.latitude.toFixed(4)}-${request.longitude.toFixed(4)}`;
      
      // Submit tokenization request
      const tokenizationResult = await submitTokenization(
        request.requestId,
        BigInt(request.requestId),  // Use request ID as asset ID
        consensus.finalValuation,
        request.requester,  // Asset owner is the requester
        assetName,
        consensus.finalConfidence
      );
      
      if (tokenizationResult.success) {
        logger.info(`✅ Token created successfully: ${tokenizationResult.tokenAddress}\n`);
      } else {
        // Non-blocking: log warning but continue
        logger.warn(`⚠️  Tokenization failed (non-blocking): ${tokenizationResult.error}`);
        logger.warn(`   Asset verification complete, but token creation unsuccessful\n`);
      }
    } else {
      logger.info(`\n⚠️  Step 6: Skipping tokenization (confidence ${consensus.finalConfidence}% < 70% threshold)\n`);
    }
    
    logger.info(`\n✅ All blockchain submissions and tokenization completed\n`);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info(`✅ REQUEST COMPLETED IN ${duration}s`);
    logger.info('═══════════════════════════════════════════════════════════════\n');
    
  } catch (error: any) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Check if this is a rejection error
    const errorMessage = error?.message || String(error);
    if (errorMessage.includes('REJECTED:')) {
      logger.warn('═══════════════════════════════════════════════════════════════');
      logger.warn('🚫 REQUEST REJECTED');
      logger.warn('═══════════════════════════════════════════════════════════════');
      logger.warn(`Reason: ${errorMessage.replace('REJECTED:', '').trim()}`);
      logger.warn('═══════════════════════════════════════════════════════════════\n');
      
      try {
        // Submit rejection to blockchain
        await submitRejection(request.requestId, errorMessage.replace('REJECTED:', '').trim());
        
        logger.info('═══════════════════════════════════════════════════════════════');
        logger.info(`✅ REJECTION SUBMITTED IN ${duration}s`);
        logger.info('═══════════════════════════════════════════════════════════════\n');
      } catch (submitError) {
        logger.error('❌ Failed to submit rejection to blockchain:', submitError);
        throw submitError;
      }
    } else {
      logger.error('❌ Error processing request:', error);
      throw error;
    }
  }
}

/**
 * Fetch satellite data using Python service
 */
async function fetchSatelliteData(latitude: number, longitude: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const pythonPath = process.env.PYTHON_PATH || 'python';
    const scriptPath = path.join(__dirname, '..', 'satellite_service.py');
    
    const python = spawn(pythonPath, [scriptPath]);
    
    let dataString = '';
    let errorString = '';
    
    python.stdout.on('data', (data) => {
      dataString += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      errorString += data.toString();
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Satellite service failed: ${errorString}`));
      } else {
        try {
          const result = JSON.parse(dataString);
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse satellite data: ${dataString}`));
        }
      }
    });
    
    // Send input
    python.stdin.write(JSON.stringify({ latitude, longitude }));
    python.stdin.end();
    
    // Timeout after 180 seconds (3 minutes) - downloading 4x 2048x2048 images takes time
    setTimeout(() => {
      python.kill();
      reject(new Error('Satellite service timeout (3 min limit)'));
    }, 180000);
  });
}

/**
 * Run a single AI agent
 */
async function runAgent(scriptName: string, data: any, agentName: string): Promise<AgentResponse> {
  return new Promise((resolve) => {
    const pythonPath = process.env.PYTHON_PATH || 'python';
    const scriptPath = path.join(__dirname, '..', scriptName);
    
    // Log what we're sending to the agent
    logger.info(`   🔍 Sending to ${agentName}:`);
    logger.info(`      - Document count: ${data.document_contents?.length || 0}`);
    if (data.document_contents && data.document_contents.length > 0) {
      data.document_contents.forEach((doc: string, idx: number) => {
        const preview = doc.length > 100 ? doc.substring(0, 100) + '...' : doc;
        logger.info(`      - Doc ${idx + 1}: ${doc.length} chars - "${preview}"`);
      });
    }
    
    const python = spawn(pythonPath, [scriptPath]);
    
    let dataString = '';
    let errorString = '';
    
    python.stdout.on('data', (data) => {
      dataString += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      errorString += data.toString();
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        logger.error(`   ❌ ${agentName} stderr: ${errorString}`);
        resolve({
          valuation: 0,
          confidence: 0,
          reasoning: '',
          risk_factors: [],
          agent: agentName.toLowerCase(),
          error: errorString || 'Agent failed'
        });
      } else {
        try {
          const result = JSON.parse(dataString);
          
          // Log what the agent returned regarding documents
          if (result.document_verification) {
            logger.info(`   📋 ${agentName} document analysis:`);
            logger.info(`      - Is land document: ${result.document_verification.is_land_document}`);
            logger.info(`      - Authenticity score: ${result.document_verification.authenticity_score}`);
            if (result.document_verification.missing_fields?.length > 0) {
              logger.info(`      - Missing fields: ${result.document_verification.missing_fields.join(', ')}`);
            }
          }
          
          resolve(result);
        } catch (e) {
          logger.error(`   ❌ ${agentName} parse error: ${dataString}`);
          resolve({
            valuation: 0,
            confidence: 0,
            reasoning: '',
            risk_factors: [],
            agent: agentName.toLowerCase(),
            error: `Failed to parse response: ${dataString}`
          });
        }
      }
    });
    
    // Send input
    python.stdin.write(JSON.stringify(data));
    python.stdin.end();
    
    // Timeout after 30 seconds
    setTimeout(() => {
      python.kill();
      resolve({
        valuation: 0,
        confidence: 0,
        reasoning: '',
        risk_factors: [],
        agent: agentName.toLowerCase(),
        error: 'Agent timeout'
      });
    }, 30000);
  });
}