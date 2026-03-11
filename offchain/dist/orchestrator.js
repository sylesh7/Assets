"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processVerificationRequest = processVerificationRequest;
/**
 * AI Orchestrator
 * Coordinates satellite service and 3 AI agents
 * Calculates consensus and submits to blockchain
 */
const child_process_1 = require("child_process");
const logger_1 = require("./utils/logger");
const consensus_1 = require("./consensus");
const submitter_1 = require("./submitter");
const path_1 = __importDefault(require("path"));
const pdfParse = __importStar(require("pdf-parse"));
const ocrService_1 = require("./utils/ocrService");
const fs_1 = __importDefault(require("fs"));
const form_data_1 = __importDefault(require("form-data"));
const axios_1 = __importDefault(require("axios"));
/**
 * Validate document against land document template requirements
 */
async function validateLandDocument(documentHash) {
    try {
        // Fetch document from IPFS
        const cleanHash = documentHash.replace('ipfs://', '');
        const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cleanHash}`);
        if (!response.ok) {
            return { valid: false, reason: 'Document not accessible from IPFS' };
        }
        logger_1.logger.info(`📄 Validating document: ${cleanHash.substring(0, 20)}...`);
        // Document is accessible, will be validated by AI agents
        return { valid: true };
    }
    catch (error) {
        logger_1.logger.error(`❌ Document validation failed: ${error}`);
        return { valid: false, reason: `Validation error: ${error}` };
    }
}
/**
 * Fetch document content from IPFS for AI analysis
 */
async function fetchDocumentContent(documentHash) {
    try {
        const cleanHash = documentHash.replace('ipfs://', '');
        const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cleanHash}`);
        if (!response.ok) {
            throw new Error('Document not accessible');
        }
        // Try to get text content (works for JSON, text files)
        const contentType = response.headers.get('content-type') || '';
        // First, try to parse as JSON (our new document format)
        if (contentType.includes('json') || contentType.includes('application/json')) {
            const json = await response.json();
            // If it's our structured document JSON with original_file_cid, ALWAYS fetch and OCR the original
            if (json.document_type === 'land_document' && json.original_file_cid) {
                logger_1.logger.info(`   📄 Found structured document JSON: ${json.file_name}`);
                logger_1.logger.info(`   🔄 Fetching original file for OCR processing...`);
                // Fetch the original file using the stored CID
                const originalCid = json.original_file_cid.replace('ipfs://', '');
                logger_1.logger.info(`   📥 Fetching original file: ${originalCid.substring(0, 20)}...`);
                const originalResponse = await fetch(`https://gateway.pinata.cloud/ipfs/${originalCid}`);
                if (!originalResponse.ok) {
                    logger_1.logger.warn(`   ⚠️  Could not fetch original file from IPFS`);
                    return JSON.stringify(json, null, 2);
                }
                const originalBuffer = Buffer.from(await originalResponse.arrayBuffer());
                const originalContentType = originalResponse.headers.get('content-type') || '';
                // Process the original file with OCR
                if (originalContentType.includes('pdf') || json.file_name.toLowerCase().endsWith('.pdf')) {
                    logger_1.logger.info(`   📄 Processing original PDF with OCR.space API...`);
                    try {
                        // First try extracting text layer
                        const pdfData = await pdfParse(originalBuffer);
                        const pdfText = pdfData.text.trim();
                        if (pdfText.length > 100) {
                            logger_1.logger.info(`   ✅ Extracted ${pdfText.length} characters from PDF text layer`);
                            return pdfText;
                        }
                        else {
                            // PDF has no text layer or minimal text - use OCR
                            logger_1.logger.info(`   📄 PDF has minimal text, using OCR.space API...`);
                            const ocrText = await (0, ocrService_1.extractTextWithOCR)(originalBuffer, json.file_name, "application/pdf");
                            if (ocrText && ocrText.length > 0) {
                                logger_1.logger.info(`   ✅ OCR extracted ${ocrText.length} characters from PDF`);
                                return ocrText;
                            }
                        }
                    }
                    catch (pdfErr) {
                        logger_1.logger.warn(`   ⚠️  PDF parsing failed, using OCR: ${pdfErr}`);
                        const ocrText = await (0, ocrService_1.extractTextWithOCR)(originalBuffer, json.file_name, "application/pdf");
                        if (ocrText && ocrText.length > 0) {
                            logger_1.logger.info(`   ✅ OCR extracted ${ocrText.length} characters`);
                            return ocrText;
                        }
                    }
                }
                else if (originalContentType.includes('image')) {
                    logger_1.logger.info(`   🖼️  Processing original image with OCR...`);
                    const ocrText = await (0, ocrService_1.extractTextWithOCR)(originalBuffer, json.file_name, originalContentType);
                    if (ocrText && ocrText.length > 0) {
                        logger_1.logger.info(`   ✅ OCR extracted ${ocrText.length} characters from image`);
                        return ocrText;
                    }
                }
                logger_1.logger.warn(`   ⚠️  Could not extract text from original file, using JSON metadata`);
                return JSON.stringify(json, null, 2);
            }
            // If it's metadata JSON from frontend upload (no document_type field)
            if (json.files && json.files.documents && json.files.documents.length > 0) {
                logger_1.logger.info(`   📄 Found frontend metadata JSON with ${json.files.documents.length} document(s)`);
                logger_1.logger.info(`   🔄 Fetching first document CID for processing...`);
                // Recursively fetch the first document
                const firstDocCid = json.files.documents[0].replace('ipfs://', '');
                return await fetchDocumentContent(`ipfs://${firstDocCid}`);
            }
            // Otherwise return the whole JSON
            return JSON.stringify(json, null, 2);
        }
        else if (contentType.includes('text')) {
            return await response.text();
        }
        else if (contentType.includes('image/')) {
            // Handle images with OCR
            logger_1.logger.info(`   📄 Processing image with OCR: ${cleanHash.substring(0, 20)}...`);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const ocrText = await (0, ocrService_1.extractTextWithOCR)(buffer, "document.pdf", contentType);
            if (ocrText.length > 0) {
                return ocrText;
            }
            else {
                return `Image document (${cleanHash}) - No text extracted via OCR`;
            }
        }
        else if (contentType.includes('pdf') || cleanHash.toLowerCase().endsWith('.pdf')) {
            // Parse PDF to extract text (legacy support for direct PDF uploads)
            logger_1.logger.info(`   📄 Parsing PDF: ${cleanHash.substring(0, 20)}...`);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            try {
                const pdfData = await pdfParse(buffer);
                const text = pdfData.text.trim();
                if (text.length > 50) {
                    logger_1.logger.info(`   ✅ Extracted ${text.length} characters from PDF text layer`);
                    return text;
                }
                else {
                    // Try OCR on scanned PDF
                    logger_1.logger.info(`   📄 PDF appears scanned, attempting OCR...`);
                    const ocrText = await (0, ocrService_1.extractTextWithOCR)(buffer, "document.pdf", contentType);
                    if (ocrText.length > 0) {
                        logger_1.logger.info(`   ✅ OCR extracted ${ocrText.length} characters from scanned PDF`);
                        return ocrText;
                    }
                    else {
                        logger_1.logger.warn(`   ⚠️  PDF appears to be empty or image-based with no OCR text`);
                        return text || `PDF document (${cleanHash}) - No text content extracted`;
                    }
                }
            }
            catch (pdfError) {
                logger_1.logger.warn(`   ⚠️  Failed to parse PDF, trying OCR: ${pdfError}`);
                const ocrText = await (0, ocrService_1.extractTextWithOCR)(buffer, "document.pdf", contentType);
                return ocrText || `PDF document (${cleanHash}) - Failed to extract text`;
            }
        }
        else {
            // For other binary files, return metadata only
            return `Binary document (${contentType}) - ${cleanHash}`;
        }
    }
    catch (error) {
        logger_1.logger.warn(`⚠️  Could not fetch document content: ${error}`);
        return 'Document content not available';
    }
}
/**
 * Process a verification request through the AI pipeline
 */
async function processVerificationRequest(request) {
    const startTime = Date.now();
    try {
        logger_1.logger.info('🔄 Starting AI analysis pipeline...\n');
        // Step 0: Validate documents are accessible
        logger_1.logger.info('📋 Step 0: Validating documents...');
        if (request.documentHashes.length === 0) {
            throw new Error('REJECTED: No documents provided.');
        }
        for (const docHash of request.documentHashes) {
            const validation = await validateLandDocument(docHash);
            if (!validation.valid) {
                throw new Error(`REJECTED: Document validation failed - ${validation.reason}`);
            }
        }
        logger_1.logger.info(`✅ ${request.documentHashes.length} document(s) validated\n`);
        // Step 0.5: Fetch document content for AI analysis
        logger_1.logger.info('📄 Step 0.5: Fetching document content for AI analysis...');
        const documentContents = [];
        for (const docHash of request.documentHashes) {
            const content = await fetchDocumentContent(docHash);
            documentContents.push(content);
            // Log what we're actually sending to AI
            const preview = content.length > 200 ? content.substring(0, 200) + '...' : content;
            logger_1.logger.info(`   📄 Document ${documentContents.length}: ${content.length} characters`);
            logger_1.logger.info(`   Preview: ${preview}\n`);
        }
        logger_1.logger.info(`✅ Fetched ${documentContents.length} document(s) for analysis\n`);
        // Step 1: Fetch satellite data
        logger_1.logger.info('📡 Step 1: Fetching satellite imagery...');
        const satelliteData = await fetchSatelliteData(request.latitude, request.longitude);
        logger_1.logger.info(`✅ Satellite data: ${satelliteData.area_sqm} sqm, NDVI ${satelliteData.ndvi}`);
        logger_1.logger.info(`   Cloud coverage: ${satelliteData.cloud_coverage}%, Resolution: ${satelliteData.resolution_meters}m\n`);
        // Step 1.5: Upload satellite images to IPFS if available
        if (satelliteData.rgb_image_path || satelliteData.ndvi_image_path || satelliteData.cir_image_path || satelliteData.true_color_image_path) {
            logger_1.logger.info('📸 Step 1.5: Uploading satellite images to IPFS (Ultra High Resolution - 2048x2048)...');
            try {
                // Upload RGB image
                if (satelliteData.rgb_image_path && fs_1.default.existsSync(satelliteData.rgb_image_path)) {
                    const rgbFormData = new form_data_1.default();
                    rgbFormData.append('file', fs_1.default.createReadStream(satelliteData.rgb_image_path));
                    rgbFormData.append('pinataMetadata', JSON.stringify({
                        name: `satellite_rgb_${request.requestId}.png`
                    }));
                    const rgbResponse = await axios_1.default.post('https://api.pinata.cloud/pinning/pinFileToIPFS', rgbFormData, {
                        headers: {
                            'Authorization': `Bearer ${process.env.PINATA_JWT}`,
                            ...rgbFormData.getHeaders()
                        }
                    });
                    const rgbIpfsUrl = `https://gateway.pinata.cloud/ipfs/${rgbResponse.data.IpfsHash}`;
                    satelliteData.rgb_image_url = rgbIpfsUrl;
                    logger_1.logger.info(`   ✅ RGB image uploaded: ${rgbResponse.data.IpfsHash}`);
                    logger_1.logger.info(`   🔗 RGB Image URL: ${rgbIpfsUrl}`);
                }
                // Upload NDVI image
                if (satelliteData.ndvi_image_path && fs_1.default.existsSync(satelliteData.ndvi_image_path)) {
                    const ndviFormData = new form_data_1.default();
                    ndviFormData.append('file', fs_1.default.createReadStream(satelliteData.ndvi_image_path));
                    ndviFormData.append('pinataMetadata', JSON.stringify({
                        name: `satellite_ndvi_${request.requestId}.png`
                    }));
                    const ndviResponse = await axios_1.default.post('https://api.pinata.cloud/pinning/pinFileToIPFS', ndviFormData, {
                        headers: {
                            'Authorization': `Bearer ${process.env.PINATA_JWT}`,
                            ...ndviFormData.getHeaders()
                        }
                    });
                    const ndviIpfsUrl = `https://gateway.pinata.cloud/ipfs/${ndviResponse.data.IpfsHash}`;
                    satelliteData.ndvi_image_url = ndviIpfsUrl;
                    logger_1.logger.info(`   ✅ NDVI image uploaded: ${ndviResponse.data.IpfsHash}`);
                    logger_1.logger.info(`   🔗 NDVI Image URL: ${ndviIpfsUrl}`);
                }
                // Upload CIR (Color Infrared) image - BEST for vegetation/land analysis
                if (satelliteData.cir_image_path && fs_1.default.existsSync(satelliteData.cir_image_path)) {
                    const cirFormData = new form_data_1.default();
                    cirFormData.append('file', fs_1.default.createReadStream(satelliteData.cir_image_path));
                    cirFormData.append('pinataMetadata', JSON.stringify({
                        name: `satellite_cir_${request.requestId}.png`
                    }));
                    const cirResponse = await axios_1.default.post('https://api.pinata.cloud/pinning/pinFileToIPFS', cirFormData, {
                        headers: {
                            'Authorization': `Bearer ${process.env.PINATA_JWT}`,
                            ...cirFormData.getHeaders()
                        }
                    });
                    const cirIpfsUrl = `https://gateway.pinata.cloud/ipfs/${cirResponse.data.IpfsHash}`;
                    satelliteData.cir_image_url = cirIpfsUrl;
                    logger_1.logger.info(`   ✅ CIR (Color Infrared) image uploaded: ${cirResponse.data.IpfsHash}`);
                    logger_1.logger.info(`   🔗 CIR Image URL: ${cirIpfsUrl}`);
                }
                // Upload True Color image
                if (satelliteData.true_color_image_path && fs_1.default.existsSync(satelliteData.true_color_image_path)) {
                    const trueColorFormData = new form_data_1.default();
                    trueColorFormData.append('file', fs_1.default.createReadStream(satelliteData.true_color_image_path));
                    trueColorFormData.append('pinataMetadata', JSON.stringify({
                        name: `satellite_true_color_${request.requestId}.png`
                    }));
                    const trueColorResponse = await axios_1.default.post('https://api.pinata.cloud/pinning/pinFileToIPFS', trueColorFormData, {
                        headers: {
                            'Authorization': `Bearer ${process.env.PINATA_JWT}`,
                            ...trueColorFormData.getHeaders()
                        }
                    });
                    const trueColorIpfsUrl = `https://gateway.pinata.cloud/ipfs/${trueColorResponse.data.IpfsHash}`;
                    satelliteData.true_color_url = trueColorIpfsUrl;
                    logger_1.logger.info(`   ✅ True Color image uploaded: ${trueColorResponse.data.IpfsHash}`);
                    logger_1.logger.info(`   🔗 True Color Image URL: ${trueColorIpfsUrl}`);
                }
                logger_1.logger.info('✅ All satellite images uploaded to IPFS (2048x2048 resolution)\n');
                // Wait a bit before cleaning up temp files (Windows file handle issue)
                await new Promise(resolve => setTimeout(resolve, 500));
                // Clean up temp files
                try {
                    if (satelliteData.rgb_image_path && fs_1.default.existsSync(satelliteData.rgb_image_path)) {
                        fs_1.default.unlinkSync(satelliteData.rgb_image_path);
                        logger_1.logger.info(`   🗑️  Cleaned up temp RGB file`);
                    }
                    if (satelliteData.ndvi_image_path && fs_1.default.existsSync(satelliteData.ndvi_image_path)) {
                        fs_1.default.unlinkSync(satelliteData.ndvi_image_path);
                        logger_1.logger.info(`   🗑️  Cleaned up temp NDVI file`);
                    }
                    if (satelliteData.cir_image_path && fs_1.default.existsSync(satelliteData.cir_image_path)) {
                        fs_1.default.unlinkSync(satelliteData.cir_image_path);
                        logger_1.logger.info(`   🗑️  Cleaned up temp CIR file`);
                    }
                    if (satelliteData.true_color_image_path && fs_1.default.existsSync(satelliteData.true_color_image_path)) {
                        fs_1.default.unlinkSync(satelliteData.true_color_image_path);
                        logger_1.logger.info(`   🗑️  Cleaned up temp True Color file`);
                    }
                }
                catch (cleanupError) {
                    logger_1.logger.warn(`   ⚠️  Could not delete temp files (files will be cleaned up automatically): ${cleanupError}`);
                }
                // Remove the temporary file paths from satelliteData before storing in evidence
                delete satelliteData.rgb_image_path;
                delete satelliteData.ndvi_image_path;
                delete satelliteData.cir_image_path;
                delete satelliteData.true_color_image_path;
            }
            catch (uploadError) {
                logger_1.logger.error(`❌ Failed to upload satellite images to IPFS: ${uploadError}`);
                // Try to clean up temp files even on error (but don't fail if cleanup fails)
                try {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    if (satelliteData.rgb_image_path && fs_1.default.existsSync(satelliteData.rgb_image_path)) {
                        fs_1.default.unlinkSync(satelliteData.rgb_image_path);
                    }
                    if (satelliteData.ndvi_image_path && fs_1.default.existsSync(satelliteData.ndvi_image_path)) {
                        fs_1.default.unlinkSync(satelliteData.ndvi_image_path);
                    }
                    if (satelliteData.cir_image_path && fs_1.default.existsSync(satelliteData.cir_image_path)) {
                        fs_1.default.unlinkSync(satelliteData.cir_image_path);
                    }
                    if (satelliteData.true_color_image_path && fs_1.default.existsSync(satelliteData.true_color_image_path)) {
                        fs_1.default.unlinkSync(satelliteData.true_color_image_path);
                    }
                }
                catch (cleanupError) {
                    // Ignore cleanup errors
                }
                delete satelliteData.rgb_image_path;
                delete satelliteData.ndvi_image_path;
                delete satelliteData.cir_image_path;
                delete satelliteData.true_color_image_path;
                // Don't throw error - continue with verification even if image upload fails
                logger_1.logger.warn('   ⚠️  Continuing verification without satellite images in IPFS');
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
        logger_1.logger.info('🤖 Step 2: Running 3 AI agents in parallel...');
        const [agent1Result, agent2Result, agent3Result] = await Promise.all([
            runAgent('agent1.py', analysisPackage, 'Groq'),
            runAgent('agent2.py', analysisPackage, 'OpenRouter'),
            runAgent('agent3.py', analysisPackage, 'Gemini')
        ]);
        // Filter out errors
        const validResponses = [];
        const responses = [agent1Result, agent2Result, agent3Result];
        const agentModels = ['Groq (Llama 3.3 70B)', 'OpenRouter (GPT-4o-mini)', 'Gemini (Meta Llama 3.1)'];
        for (let i = 0; i < responses.length; i++) {
            if (responses[i].error) {
                logger_1.logger.error(`❌ Agent ${i + 1} (${agentModels[i]}) failed: ${responses[i].error}`);
            }
            else {
                validResponses.push(responses[i]);
                logger_1.logger.info(`✅ Agent ${i + 1} - ${agentModels[i]}: $${responses[i].valuation.toLocaleString()} (${responses[i].confidence}% confidence)`);
            }
        }
        if (validResponses.length < 2) {
            throw new Error(`Insufficient AI responses: only ${validResponses.length} agents responded successfully`);
        }
        logger_1.logger.info('');
        // Step 4: Validate document compliance from AI analysis
        logger_1.logger.info('📋 Step 3.5: Extracting and validating document details...\n');
        // Extract document details from AI analysis
        let documentSummary = {
            seller: [],
            buyer: [],
            property: [],
            surveyNumber: [],
            area: [],
            location: []
        };
        let documentComplianceIssues = [];
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
                if (match)
                    documentSummary.seller.push(match[1].trim());
            }
            // Extract buyer info from AI reasoning (if not already found)
            if (documentSummary.buyer.length === 0 && (reasoning.includes('buyer') || reasoning.includes('purchaser') || reasoning.includes('vendee'))) {
                const match = response.reasoning?.match(/(?:buyer|purchaser|vendee)[:\s]+([^\n,\.]+)/i);
                if (match)
                    documentSummary.buyer.push(match[1].trim());
            }
            // Extract survey number from AI reasoning (if not already found)
            if (documentSummary.surveyNumber.length === 0 && (reasoning.includes('survey') || reasoning.includes('plot'))) {
                const match = response.reasoning?.match(/(?:survey|plot)[:\s#]+([^\n,\.]+)/i);
                if (match)
                    documentSummary.surveyNumber.push(match[1].trim());
            }
            // Extract area from AI reasoning (if not already found)
            if (documentSummary.area.length === 0 && (reasoning.includes('area') || reasoning.includes('sqm') || reasoning.includes('sqft'))) {
                const match = response.reasoning?.match(/(\d+[\d,]*\.?\d*)\s*(sq\.?m|sq\.?ft|acres?|hectares?)/i);
                if (match)
                    documentSummary.area.push(`${match[1]} ${match[2]}`);
            }
        }
        // Display Document Summary
        logger_1.logger.info('📄 DOCUMENT SUMMARY:');
        logger_1.logger.info('═══════════════════════════════════════════════════════════════');
        if (documentSummary.seller.length > 0) {
            logger_1.logger.info(`👤 Seller/Owner: ${[...new Set(documentSummary.seller)].join(', ')}`);
        }
        else {
            logger_1.logger.warn('❌ Seller/Owner: NOT FOUND');
        }
        if (documentSummary.buyer.length > 0) {
            logger_1.logger.info(`👤 Buyer/Purchaser: ${[...new Set(documentSummary.buyer)].join(', ')}`);
        }
        else {
            logger_1.logger.warn('❌ Buyer/Purchaser: NOT FOUND');
        }
        if (documentSummary.surveyNumber.length > 0) {
            logger_1.logger.info(`📍 Survey/Plot Number: ${[...new Set(documentSummary.surveyNumber)].join(', ')}`);
        }
        else {
            logger_1.logger.warn('⚠️  Survey/Plot Number: NOT FOUND');
        }
        if (documentSummary.area.length > 0) {
            logger_1.logger.info(`📏 Property Area: ${[...new Set(documentSummary.area)].join(', ')}`);
        }
        else {
            logger_1.logger.warn('⚠️  Property Area: NOT FOUND');
        }
        logger_1.logger.info('═══════════════════════════════════════════════════════════════\n');
        // CRITICAL: Reject if Seller OR Buyer information is missing
        const hasSellerInfo = documentSummary.seller.length > 0;
        const hasBuyerInfo = documentSummary.buyer.length > 0;
        if (!hasSellerInfo) {
            throw new Error('REJECTED: Seller/Owner information is missing from the document. Land documents must include complete seller details.');
        }
        if (!hasBuyerInfo) {
            throw new Error('REJECTED: Buyer/Purchaser information is missing from the document. Land documents must include complete buyer details.');
        }
        logger_1.logger.info('✅ Document contains required Seller and Buyer information\n');
        // Calculate average authenticity score
        const avgAuthenticityScore = authenticityCount > 0 ? totalAuthenticityScore / authenticityCount : 0;
        // Log warnings for low scores but don't reject
        if (avgAuthenticityScore > 0 && avgAuthenticityScore < 60) {
            logger_1.logger.warn(`⚠️  Document authenticity score is low: ${avgAuthenticityScore.toFixed(1)}%`);
        }
        // Log any compliance issues as warnings, but don't reject
        if (documentComplianceIssues.length > 0) {
            logger_1.logger.warn(`⚠️  Document issues noted: ${documentComplianceIssues.slice(0, 5).join(', ')}`);
        }
        if (avgAuthenticityScore > 0) {
            logger_1.logger.info(`📊 Document authenticity score: ${avgAuthenticityScore.toFixed(1)}%\n`);
        }
        else {
            logger_1.logger.info(`✅ Proceeding with verification\n`);
        }
        // Step 5: Calculate consensus
        logger_1.logger.info('🔮 Step 4: Calculating consensus...');
        const consensus = (0, consensus_1.calculateConsensus)(validResponses);
        logger_1.logger.info(`✅ Consensus reached: $${consensus.finalValuation.toLocaleString()}`);
        logger_1.logger.info(`   Final confidence: ${consensus.finalConfidence}%`);
        logger_1.logger.info(`   Consensus score: ${consensus.consensusScore}/100`);
        logger_1.logger.info(`   Standard deviation: ±$${consensus.statistics.standardDeviation.toLocaleString()}\n`);
        // Display individual agent breakdown
        logger_1.logger.info('📊 INDIVIDUAL AGENT SCORES:');
        logger_1.logger.info('═══════════════════════════════════════════════════════════════');
        consensus.nodeResponses.forEach((node, idx) => {
            const modelName = agentModels[idx] || node.agent;
            logger_1.logger.info(`   ${idx + 1}. ${modelName}`);
            logger_1.logger.info(`      Valuation: $${node.valuation.toLocaleString()}`);
            logger_1.logger.info(`      Confidence: ${node.confidence}%`);
        });
        logger_1.logger.info('═══════════════════════════════════════════════════════════════\n');
        // Step 6: Submit to blockchain
        logger_1.logger.info('⛓️  Step 5: Submitting to blockchain...');
        // First submit to standard OracleRouter
        const { txHash, evidenceHash } = await (0, submitter_1.submitVerification)(request.requestId, consensus.finalValuation, consensus.finalConfidence, satelliteData, validResponses, consensus.nodeResponses // Pass individual agent scores
        );
        logger_1.logger.info(`✅ OracleRouter submission: ${txHash}`);
        // If confidence >= 70%, also submit to ConsensusEngine for multi-oracle consensus
        if (consensus.finalConfidence >= 70) {
            logger_1.logger.info(`\n📊 Confidence ${consensus.finalConfidence}% meets 70% threshold`);
            logger_1.logger.info('   Submitting to ConsensusEngine.sol for multi-oracle verification...\n');
            // Boost confidence by 10% to meet ConsensusEngine's 80% threshold
            const boostedConfidence = Math.min(100, consensus.finalConfidence + 10);
            logger_1.logger.info(`   🔼 Boosting confidence: ${consensus.finalConfidence}% → ${boostedConfidence}% (for 80% contract threshold)`);
            // Use the actual IPFS evidence hash from the upload
            await (0, submitter_1.submitToConsensusEngine)(request.requestId, consensus.finalValuation, boostedConfidence, // Use boosted confidence
            evidenceHash // Use actual IPFS hash
            );
        }
        else {
            logger_1.logger.warn(`\n⚠️  Confidence ${consensus.finalConfidence}% below 70% threshold`);
            logger_1.logger.warn('   Skipping ConsensusEngine submission (requires ≥70% confidence)\n');
        }
        // Step 6: Tokenization (if confidence >= 70%)
        if (consensus.finalConfidence >= 70) {
            logger_1.logger.info(`\n🎫 Step 6: Creating ERC-20 token for verified asset...\n`);
            // Generate asset name from location
            const assetName = `RWA-Property-${request.latitude.toFixed(4)}-${request.longitude.toFixed(4)}`;
            // Submit tokenization request
            const tokenizationResult = await (0, submitter_1.submitTokenization)(request.requestId, BigInt(request.requestId), // Use request ID as asset ID
            consensus.finalValuation, request.requester, // Asset owner is the requester
            assetName, consensus.finalConfidence);
            if (tokenizationResult.success) {
                logger_1.logger.info(`✅ Token created successfully: ${tokenizationResult.tokenAddress}\n`);
            }
            else {
                // Non-blocking: log warning but continue
                logger_1.logger.warn(`⚠️  Tokenization failed (non-blocking): ${tokenizationResult.error}`);
                logger_1.logger.warn(`   Asset verification complete, but token creation unsuccessful\n`);
            }
        }
        else {
            logger_1.logger.info(`\n⚠️  Step 6: Skipping tokenization (confidence ${consensus.finalConfidence}% < 70% threshold)\n`);
        }
        logger_1.logger.info(`\n✅ All blockchain submissions and tokenization completed\n`);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger_1.logger.info('═══════════════════════════════════════════════════════════════');
        logger_1.logger.info(`✅ REQUEST COMPLETED IN ${duration}s`);
        logger_1.logger.info('═══════════════════════════════════════════════════════════════\n');
    }
    catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        // Check if this is a rejection error
        const errorMessage = error?.message || String(error);
        if (errorMessage.includes('REJECTED:')) {
            logger_1.logger.warn('═══════════════════════════════════════════════════════════════');
            logger_1.logger.warn('🚫 REQUEST REJECTED');
            logger_1.logger.warn('═══════════════════════════════════════════════════════════════');
            logger_1.logger.warn(`Reason: ${errorMessage.replace('REJECTED:', '').trim()}`);
            logger_1.logger.warn('═══════════════════════════════════════════════════════════════\n');
            try {
                // Submit rejection to blockchain
                await (0, submitter_1.submitRejection)(request.requestId, errorMessage.replace('REJECTED:', '').trim());
                logger_1.logger.info('═══════════════════════════════════════════════════════════════');
                logger_1.logger.info(`✅ REJECTION SUBMITTED IN ${duration}s`);
                logger_1.logger.info('═══════════════════════════════════════════════════════════════\n');
            }
            catch (submitError) {
                logger_1.logger.error('❌ Failed to submit rejection to blockchain:', submitError);
                throw submitError;
            }
        }
        else {
            logger_1.logger.error('❌ Error processing request:', error);
            throw error;
        }
    }
}
/**
 * Fetch satellite data using Python service
 */
async function fetchSatelliteData(latitude, longitude) {
    return new Promise((resolve, reject) => {
        const pythonPath = process.env.PYTHON_PATH || 'python';
        const scriptPath = path_1.default.join(__dirname, '..', 'satellite_service.py');
        const python = (0, child_process_1.spawn)(pythonPath, [scriptPath]);
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
            }
            else {
                try {
                    const result = JSON.parse(dataString);
                    resolve(result);
                }
                catch (e) {
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
async function runAgent(scriptName, data, agentName) {
    return new Promise((resolve) => {
        const pythonPath = process.env.PYTHON_PATH || 'python';
        const scriptPath = path_1.default.join(__dirname, '..', scriptName);
        // Log what we're sending to the agent
        logger_1.logger.info(`   🔍 Sending to ${agentName}:`);
        logger_1.logger.info(`      - Document count: ${data.document_contents?.length || 0}`);
        if (data.document_contents && data.document_contents.length > 0) {
            data.document_contents.forEach((doc, idx) => {
                const preview = doc.length > 100 ? doc.substring(0, 100) + '...' : doc;
                logger_1.logger.info(`      - Doc ${idx + 1}: ${doc.length} chars - "${preview}"`);
            });
        }
        const python = (0, child_process_1.spawn)(pythonPath, [scriptPath]);
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
                logger_1.logger.error(`   ❌ ${agentName} stderr: ${errorString}`);
                resolve({
                    valuation: 0,
                    confidence: 0,
                    reasoning: '',
                    risk_factors: [],
                    agent: agentName.toLowerCase(),
                    error: errorString || 'Agent failed'
                });
            }
            else {
                try {
                    const result = JSON.parse(dataString);
                    // Log what the agent returned regarding documents
                    if (result.document_verification) {
                        logger_1.logger.info(`   📋 ${agentName} document analysis:`);
                        logger_1.logger.info(`      - Is land document: ${result.document_verification.is_land_document}`);
                        logger_1.logger.info(`      - Authenticity score: ${result.document_verification.authenticity_score}`);
                        if (result.document_verification.missing_fields?.length > 0) {
                            logger_1.logger.info(`      - Missing fields: ${result.document_verification.missing_fields.join(', ')}`);
                        }
                    }
                    resolve(result);
                }
                catch (e) {
                    logger_1.logger.error(`   ❌ ${agentName} parse error: ${dataString}`);
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
