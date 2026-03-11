"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertDocumentToJSON = convertDocumentToJSON;
exports.extractTextWithOCR = extractTextWithOCR;
/**
 * OCR.space API Service
 * Converts PDF and image documents to structured JSON text
 */
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const logger_1 = require("./logger");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const OCR_API_URL = 'https://api.ocr.space/parse/image';
const OCR_API_KEY = process.env.OCR_SPACE_API_KEY;
/**
 * Convert PDF/Image to structured JSON using OCR.space API
 */
async function convertDocumentToJSON(fileBuffer, filename) {
    if (!OCR_API_KEY) {
        logger_1.logger.warn('OCR_SPACE_API_KEY not set, using fallback text extraction');
        return {
            rawText: '[OCR API KEY NOT CONFIGURED]',
            structuredData: {
                lines: [],
                sections: { header: [], body: [], footer: [] }
            },
            metadata: {
                pageCount: 0,
                processingTime: '0',
                textOrientation: 'Unknown'
            }
        };
    }
    try {
        logger_1.logger.info(`🔍 Converting document to JSON via OCR.space: ${filename}`);
        // Prepare form data
        const formData = new form_data_1.default();
        formData.append('file', fileBuffer, {
            filename: filename,
            contentType: filename.toLowerCase().endsWith('.pdf')
                ? 'application/pdf'
                : 'image/jpeg'
        });
        formData.append('language', 'eng');
        formData.append('apikey', OCR_API_KEY);
        formData.append('isOverlayRequired', 'true');
        formData.append('OCREngine', '2'); // Use OCR Engine 2 for better accuracy
        formData.append('isTable', 'true'); // Detect tables
        formData.append('scale', 'true'); // Auto-scale for better results
        // Send OCR request
        const response = await axios_1.default.post(OCR_API_URL, formData, {
            headers: {
                ...formData.getHeaders(),
            },
            timeout: 60000, // 60 second timeout
        });
        const ocrResult = response.data;
        // Check for errors
        if (ocrResult.IsErroredOnProcessing) {
            throw new Error(`OCR processing error: ${ocrResult.ErrorMessage || 'Unknown error'} - ${ocrResult.ErrorDetails || ''}`);
        }
        // Check exit code
        if (ocrResult.OCRExitCode !== 1) {
            logger_1.logger.warn(`OCR exit code: ${ocrResult.OCRExitCode} - ${ocrResult.ErrorMessage}`);
        }
        // Parse results
        const parsedResults = ocrResult.ParsedResults;
        if (!parsedResults || parsedResults.length === 0) {
            throw new Error('No parsed results returned from OCR');
        }
        // Process each page result
        const allText = [];
        const allLines = [];
        parsedResults.forEach((result, pageIndex) => {
            const exitCode = result.FileParseExitCode;
            switch (exitCode) {
                case 1: // Success
                    const parsedText = result.ParsedText;
                    allText.push(parsedText);
                    // Extract structured line and word data
                    if (result.TextOverlay && result.TextOverlay.Lines) {
                        result.TextOverlay.Lines.forEach((line) => {
                            allLines.push({
                                text: line.LineText,
                                words: line.Words.map((w) => w.WordText),
                            });
                        });
                    }
                    logger_1.logger.info(`✅ Page ${pageIndex + 1} parsed successfully (${parsedText.length} chars)`);
                    break;
                case 0:
                case -10:
                case -20:
                case -30:
                case -99:
                default:
                    logger_1.logger.error(`❌ Page ${pageIndex + 1} parsing error: ${result.ErrorMessage}`);
                    allText.push(`[Error parsing page ${pageIndex + 1}: ${result.ErrorMessage}]`);
                    break;
            }
        });
        // Combine all text
        const rawText = allText.join('\n\n');
        // Organize into sections (simple heuristic: first 20% = header, last 10% = footer)
        const totalLines = allLines.length;
        const headerEnd = Math.floor(totalLines * 0.2);
        const footerStart = Math.floor(totalLines * 0.9);
        const structuredData = {
            lines: allLines,
            sections: {
                header: allLines.slice(0, headerEnd).map((l) => l.text),
                body: allLines.slice(headerEnd, footerStart).map((l) => l.text),
                footer: allLines.slice(footerStart).map((l) => l.text),
            },
        };
        const documentStructure = {
            rawText,
            structuredData,
            metadata: {
                pageCount: parsedResults.length,
                processingTime: ocrResult.ProcessingTimeInMilliseconds,
                textOrientation: parsedResults[0]?.TextOrientation || 'Unknown',
            },
        };
        logger_1.logger.info(`✅ OCR complete: ${rawText.length} total characters extracted`);
        logger_1.logger.info(`   Pages: ${documentStructure.metadata.pageCount}`);
        logger_1.logger.info(`   Processing time: ${documentStructure.metadata.processingTime}ms`);
        return documentStructure;
    }
    catch (error) {
        logger_1.logger.error(`❌ OCR.space API error: ${error.message}`);
        // Return error structure instead of throwing
        return {
            rawText: `[OCR ERROR: ${error.message}]`,
            structuredData: {
                lines: [],
                sections: { header: [], body: [], footer: [] }
            },
            metadata: {
                pageCount: 0,
                processingTime: '0',
                textOrientation: 'Error'
            }
        };
    }
}
/**
 * Enhanced document fetching with OCR.space integration
 */
async function extractTextWithOCR(documentBuffer, filename, contentType) {
    try {
        // Check if it's a PDF or image that needs OCR
        const needsOCR = contentType === 'application/pdf' ||
            contentType.startsWith('image/') ||
            filename.toLowerCase().match(/\.(pdf|png|jpg|jpeg|tiff|bmp)$/);
        if (!needsOCR) {
            logger_1.logger.info(`Document ${filename} doesn't need OCR, returning as-is`);
            return documentBuffer.toString('utf-8');
        }
        // Use OCR.space API
        const documentStructure = await convertDocumentToJSON(documentBuffer, filename);
        if (documentStructure.rawText.startsWith('[OCR ERROR') ||
            documentStructure.rawText.startsWith('[OCR API KEY')) {
            logger_1.logger.warn(`OCR failed for ${filename}, using fallback`);
            return documentStructure.rawText;
        }
        // Return the full raw text for AI analysis
        logger_1.logger.info(`📄 Extracted ${documentStructure.rawText.length} characters from ${filename} via OCR`);
        return documentStructure.rawText;
    }
    catch (error) {
        logger_1.logger.error(`Error extracting text with OCR: ${error.message}`);
        return `[Error processing document: ${error.message}]`;
    }
}
