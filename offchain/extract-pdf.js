const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');
require('dotenv').config();

const OCR_API_KEY = process.env.OCR_SPACE_API_KEY;
const OCR_API_URL = 'https://api.ocr.space/parse/image';

async function extractPDFWithOCR() {
  try {
    console.log('\n🔍 Converting PDF to JSON using OCR.space API...\n');
    
    const fileBuffer = fs.readFileSync('c:\\Users\\Sugan\\Downloads\\Filled_Land_Sale_Deed (1).pdf');
    
    // Prepare form data for OCR.space API
    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: 'Filled_Land_Sale_Deed.pdf',
      contentType: 'application/pdf'
    });
    formData.append('language', 'eng');
    formData.append('apikey', OCR_API_KEY);
    formData.append('isOverlayRequired', 'true');
    formData.append('OCREngine', '2'); // Better accuracy
    formData.append('isTable', 'true'); // Detect tables
    formData.append('scale', 'true'); // Auto-scale
    
    // Send OCR request
    console.log('📤 Uploading to OCR.space API...');
    const response = await axios.post(OCR_API_URL, formData, {
      headers: formData.getHeaders(),
      timeout: 60000
    });
    
    if (response.data.OCRExitCode !== 1 && response.data.OCRExitCode !== 2) {
      throw new Error(`OCR failed: ${response.data.ErrorMessage || 'Unknown error'}`);
    }
    
    // OCRExitCode 2 = Partial success (page limit reached, but some pages processed)
    if (response.data.OCRExitCode === 2) {
      console.log('⚠️  Warning: Only first 3 pages processed (free tier limit)\n');
    }
    
    // Extract text from all pages
    const parsedResults = response.data.ParsedResults;
    let fullText = '';
    
    console.log(`✅ OCR processing complete - ${parsedResults.length} page(s) processed\n`);
    
    parsedResults.forEach((result, index) => {
      fullText += result.ParsedText + '\n';
      console.log(`📄 Page ${index + 1}: ${result.ParsedText.length} characters extracted`);
    });
    
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║           SALE DEED DOCUMENT - EXTRACTED CONTENT               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log(fullText);
    
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                   BUYER & SELLER SUMMARY                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    // Look for seller/vendor (multiple patterns)
    const sellerPatterns = [
      /(?:seller|vendor|grantor|owner|transferor)[\s:]*([^\n]{10,100})/i,
      /(?:name of seller|seller's name|vendor name)[\s:]*([^\n]{10,100})/i,
      /(?:party of the first part)[\s:]*([^\n]{10,100})/i
    ];
    
    let sellerFound = false;
    for (const pattern of sellerPatterns) {
      const match = fullText.match(pattern);
      if (match && match[1].trim().length > 5) {
        console.log('👤 SELLER/VENDOR:', match[1].trim());
        sellerFound = true;
        break;
      }
    }
    if (!sellerFound) {
      console.log('👤 SELLER/VENDOR: ❌ NOT FOUND');
    }
    
    // Look for buyer/purchaser (multiple patterns)
    const buyerPatterns = [
      /(?:buyer|purchaser|vendee|grantee|transferee)[\s:]*([^\n]{10,100})/i,
      /(?:name of buyer|buyer's name|purchaser name)[\s:]*([^\n]{10,100})/i,
      /(?:party of the second part)[\s:]*([^\n]{10,100})/i
    ];
    
    let buyerFound = false;
    for (const pattern of buyerPatterns) {
      const match = fullText.match(pattern);
      if (match && match[1].trim().length > 5) {
        console.log('👤 BUYER/PURCHASER:', match[1].trim());
        buyerFound = true;
        break;
      }
    }
    if (!buyerFound) {
      console.log('👤 BUYER/PURCHASER: ❌ NOT FOUND');
    }
    
    // Look for property details
    const surveyMatch = fullText.match(/(?:survey|plot|deed)[\s\w]*(?:number|no\.?|#)[\s:]*([^\n]{3,50})/i);
    if (surveyMatch) {
      console.log('📍 SURVEY/PLOT NUMBER:', surveyMatch[1].trim());
    } else {
      console.log('📍 SURVEY/PLOT NUMBER: Not found');
    }
    
    const areaMatch = fullText.match(/(?:area|extent|measurement)[\s:]*([0-9,]+\.?\d*)\s*(sq\.?\s*(?:m|ft|meters?|feet|yards?|acres?))/i);
    if (areaMatch) {
      console.log('📏 PROPERTY AREA:', areaMatch[1], areaMatch[2]);
    } else {
      console.log('📏 PROPERTY AREA: Not found');
    }
    
    const considerationMatch = fullText.match(/(?:consideration|sale price|amount|value)[\s:]*(?:Rs\.?|USD|INR|\$)?[\s]*([0-9,]+\.?\d*)/i);
    if (considerationMatch) {
      console.log('💰 CONSIDERATION AMOUNT:', considerationMatch[1]);
    }
    
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                     STRUCTURED JSON OUTPUT                     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    // Create structured JSON
    const structuredData = {
      document_type: 'Sale Deed',
      extraction_method: 'OCR.space API',
      extracted_text: fullText,
      metadata: {
        pages: parsedResults.length,
        total_characters: fullText.length,
        processing_time: response.data.ProcessingTimeInMilliseconds + 'ms'
      },
      parties: {
        seller: sellerFound ? fullText.match(sellerPatterns.find(p => fullText.match(p)))[1].trim() : 'NOT FOUND',
        buyer: buyerFound ? fullText.match(buyerPatterns.find(p => fullText.match(p)))[1].trim() : 'NOT FOUND'
      },
      property_details: {
        survey_number: surveyMatch ? surveyMatch[1].trim() : 'NOT FOUND',
        area: areaMatch ? `${areaMatch[1]} ${areaMatch[2]}` : 'NOT FOUND',
        consideration: considerationMatch ? considerationMatch[1] : 'NOT FOUND'
      }
    };
    
    console.log(JSON.stringify(structuredData, null, 2));
    
    console.log('\n╚════════════════════════════════════════════════════════════════╝\n');
    
    // Save JSON to file
    fs.writeFileSync('sale-deed-extracted.json', JSON.stringify(structuredData, null, 2));
    console.log('💾 Structured JSON saved to: sale-deed-extracted.json\n');
    
  } catch (error) {
    console.error('❌ Error processing PDF:', error.message);
    if (error.response) {
      console.error('API Response:', error.response.data);
    }
  }
}

extractPDFWithOCR();
