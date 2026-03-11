import { NextRequest } from "next/server";
import * as pdfParse from 'pdf-parse';

// This route expects form-data with keys:
// photos[] (files), documents[] (files), metadata (JSON string of fields)
// Uses Pinata JWT (set PINATA_JWT in env) to pin files and JSON metadata

const PINATA_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PINATA_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

async function pinFileToIPFS(file: File, jwt: string): Promise<string> {
  const fd = new FormData();
  // @ts-ignore: web File is acceptable
  fd.append("file", file as any, file.name);
  const res = await fetch(PINATA_FILE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: fd,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata file error: ${res.status} ${text}`);
  }
  const json = await res.json();
  return `ipfs://${json.IpfsHash}`;
}

async function pinJSONToIPFS(payload: any, jwt: string): Promise<string> {
  const res = await fetch(PINATA_JSON_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata JSON error: ${res.status} ${text}`);
  }
  const json = await res.json();
  return `ipfs://${json.IpfsHash}`;
}

/**
 * Extract text content from a document file (PDF, text, etc.)
 * Note: OCR is not available in API routes - will be handled by offchain service
 */
async function extractDocumentText(file: File): Promise<string> {
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Handle PDF files
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      console.log(`Processing PDF: ${file.name}`);
      
      try {
        const pdfData = await (pdfParse as any)(buffer);
        const pdfText = pdfData.text.trim();
        
        if (pdfText && pdfText.length > 0) {
          console.log(`Extracted ${pdfText.length} characters from PDF`);
          return pdfText;
        } else {
          console.log('PDF appears to be scanned - will be processed by OCR in offchain service');
          return `[SCANNED_PDF: ${file.name}] - Text extraction will be performed by OCR service`;
        }
      } catch (pdfError) {
        console.error('PDF parsing error:', pdfError);
        return `[PDF_ERROR: ${file.name}] - Could not parse PDF`;
      }
    }
    
    // Handle image files - note for OCR processing
    if (file.type.startsWith('image/')) {
      console.log(`Image document: ${file.name} - will be processed by OCR in offchain service`);
      return `[IMAGE_DOCUMENT: ${file.name}] - Text extraction will be performed by OCR service`;
    }
    
    // Handle text files
    if (file.type.startsWith('text/') || file.name.match(/\.(txt|json|md)$/i)) {
      return buffer.toString('utf-8');
    }
    
    // Handle JSON files
    if (file.type === 'application/json' || file.name.toLowerCase().endsWith('.json')) {
      return buffer.toString('utf-8');
    }
    
    // For other files, return placeholder
    return `[BINARY_FILE: ${file.name}] - Content type: ${file.type}`;
  } catch (error) {
    console.error('Error extracting document text:', error);
    return '';
  }
}

export async function POST(req: NextRequest) {
  try {
    const jwt = process.env.PINATA_JWT;
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Missing PINATA_JWT" }), { status: 500 });
    }

    const formData = await req.formData();

    const photos = formData.getAll("photos").filter(Boolean) as File[];
    const documents = formData.getAll("documents").filter(Boolean) as File[];
    const metadataStr = (formData.get("metadata") as string) || "{}";
    const base = JSON.parse(metadataStr || "{}");

    const photoCids: string[] = [];
    for (const f of photos) {
      const cid = await pinFileToIPFS(f, jwt);
      photoCids.push(cid);
    }

    // Process documents: Upload original file AND create JSON with metadata
    const docCids: string[] = [];
    for (const f of documents) {
      console.log(`Processing document: ${f.name} (${f.type})`);
      
      // 1. Upload the ORIGINAL file first
      const originalFileCid = await pinFileToIPFS(f, jwt);
      console.log(`Original file uploaded: ${originalFileCid}`);
      
      // 2. Extract text if possible
      const extractedText = await extractDocumentText(f);
      console.log(`Extracted ${extractedText.length} characters from ${f.name}`);
      
      // 3. Create JSON metadata with reference to original file
      const documentJSON = {
        document_type: "land_document",
        file_name: f.name,
        file_type: f.type,
        file_size: f.size,
        upload_timestamp: new Date().toISOString(),
        
        // Store BOTH the original file CID and extracted text
        original_file_cid: originalFileCid,
        extracted_text: extractedText,
        text_length: extractedText.length,
        
        // Template fields that AI should extract
        property_identification: {
          survey_number: null,
          plot_number: null,
          deed_number: null
        },
        
        owner_seller_information: {
          name: null,
          address: null,
          contact: null
        },
        
        buyer_purchaser_information: {
          name: null,
          address: null,
          contact: null
        },
        
        property_details: {
          location: null,
          full_address: null,
          total_area: null,
          area_unit: null,
          boundaries: null
        },
        
        legal_information: {
          deed_type: null,
          registration_number: null,
          registration_date: null,
          sub_registrar_office: null
        },
        
        financial_details: {
          sale_consideration: null,
          currency: null,
          payment_terms: null
        },
        
        additional_information: {
          encumbrances: null,
          restrictions: null,
          special_conditions: null
        }
      };
      
      // 4. Upload the JSON metadata
      const jsonCid = await pinJSONToIPFS(documentJSON, jwt);
      docCids.push(jsonCid);
      
      console.log(`Document JSON uploaded: ${jsonCid}`);
    }

    const metadata = {
      ...base,
      files: { photos: photoCids, documents: docCids },
      timestamps: { ...(base.timestamps || {}), createdAt: Math.floor(Date.now() / 1000) },
    };

    const metadataCid = await pinJSONToIPFS(metadata, jwt);

    return new Response(
      JSON.stringify({ metadataCid, photos: photoCids, documents: docCids, metadata }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Upload failed" }), { status: 500 });
  }
}
