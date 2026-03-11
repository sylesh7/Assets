"""
AI Agent 3 - OpenRouter Agent (Llama 3.1)
Property analysis using OpenRouter with Llama 3.1
"""
import os
import sys
import json
from datetime import datetime
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

# Configure OpenAI client for OpenRouter
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv('OPENROUTER_API_KEY')
)

def calculate_valuation(area_sqm: float, ndvi: float, cloud_coverage: float, document_count: int) -> dict:
    """
    Calculate property valuation based on satellite data and documents.
    
    Args:
        area_sqm: Property area in square meters
        ndvi: Normalized Difference Vegetation Index (0-1)
        cloud_coverage: Cloud coverage percentage
        document_count: Number of submitted documents
    
    Returns:
        Dictionary with valuation and analysis
    """
    # Base price per sqm based on vegetation health
    if ndvi > 0.65:
        base_price = 2700  # Excellent vegetation = premium land
    elif ndvi > 0.5:
        base_price = 2400  # Good vegetation
    elif ndvi > 0.3:
        base_price = 2000  # Moderate vegetation
    else:
        base_price = 1700  # Poor vegetation
    
    # Area factor (larger properties may have lower per-sqm value)
    area_factor = 1.0 if area_sqm < 500 else 0.93 if area_sqm < 1000 else 0.88
    
    # Document confidence factor
    doc_factor = min(1.0, 0.65 + (document_count * 0.175))
    
    # Calculate valuation
    valuation = int(area_sqm * base_price * area_factor * doc_factor)
    
    # Calculate confidence based on data quality
    confidence = 82
    if cloud_coverage > 15:
        confidence -= 8
    if document_count < 2:
        confidence -= 12
    if ndvi < 0.25:
        confidence -= 7
    
    return {
        "valuation": valuation,
        "confidence": max(55, min(95, confidence))
    }

def analyze_property(data):
    """Analyze property using OpenRouter with Llama 3.1"""
    try:
        api_key = os.getenv('OPENROUTER_API_KEY')
        
        if not api_key:
            raise ValueError("OPENROUTER_API_KEY not configured")
        
        # Extract data
        satellite_data = data.get('satellite_data', {})
        area_sqm = satellite_data.get('area_sqm', 200)
        ndvi = satellite_data.get('ndvi', 0.5)
        cloud_coverage = satellite_data.get('cloud_coverage', 5)
        document_count = data.get('document_count', 0)
        
        # Calculate valuation directly
        valuation_result = calculate_valuation(area_sqm, ndvi, cloud_coverage, document_count)
        
        # Get document contents for analysis
        document_contents = data.get('document_contents', [])
        has_documents = len(document_contents) > 0
        
        # Debug log to stderr
        print(f"[Agent3 DEBUG] Received {len(document_contents)} documents", file=sys.stderr)
        for i, content in enumerate(document_contents):
            print(f"[Agent3 DEBUG] Doc {i+1}: {len(content)} chars, preview: {content[:100]}", file=sys.stderr)
        
        document_text = ""
        if has_documents:
            document_text = "\n\nDOCUMENT CONTENT FOR VERIFICATION:\n"
            for i, content in enumerate(document_contents):
                # Analyze FULL document text, not just first 800 chars
                document_text += f"\nDocument {i+1} (FULL TEXT - {len(content)} characters):\n{content}\n"
        
        # Use OpenRouter API for reasoning with Llama 3.1
        try:
            response = client.chat.completions.create(
                model="meta-llama/llama-3.1-8b-instruct:free",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a certified land surveyor and real estate expert specializing in land document verification. You MUST analyze actual document content and verify it contains all mandatory fields required for land documents. REJECT documents that don't meet standards."
                    },
                    {
                        "role": "user",
                        "content": f"""STRICT Land Document Verification & Property Authentication:

SATELLITE MEASUREMENTS:
- Measured Area: {area_sqm} sqm
- Vegetation Index (NDVI): {ndvi}
- Image Quality (Cloud Coverage): {cloud_coverage}%

SUBMITTED DOCUMENTATION:
- Document Count: {document_count}
- Preliminary Valuation: ${valuation_result['valuation']:,}
- Data Confidence: {valuation_result['confidence']}%
{document_text}

⚠️ CRITICAL: STRICT DOCUMENT TYPE VERIFICATION ⚠️
This system ONLY accepts LAND/PROPERTY DOCUMENTS for tokenization.

STEP 1: DOCUMENT TYPE AUTHENTICATION
The submitted document MUST be a recognized land document:
✓ VALID: Sale Deed, Purchase Deed, Land Title, Property Deed, Transfer Deed, Conveyance Deed
✗ INVALID: Invoice, Receipt, Contract, Business Document, Any Non-Land Document

If document is NOT a land/property document → REJECT IMMEDIATELY with score 0

STEP 2: MANDATORY LAND DOCUMENT FIELD VERIFICATION
Analyze the ACTUAL document content above and verify ALL these fields are present:

CRITICAL FIELDS (ALL required):
1. Survey Number / Plot Number / Deed Number - Property unique identifier
2. Owner/Seller Name - Full legal name  
3. Owner/Seller Address - Complete address
4. Property Location - Full location or address
5. Total Area - Size with units clearly stated
6. Boundaries - Detailed boundary description
7. Deed Type - Type of legal document
8. Registration Details - Registration number or details

STEP 3: VALIDATION & REJECTION RULES
✗ NOT a land/property document → Score: 0, Reason: "Not a land document"
✗ Missing survey/plot/deed number → Score: 0-15, Reason: "No property identification"
✗ Missing owner name → Score: 0-15, Reason: "Owner information missing"
✗ Missing owner address → Score: 0-20, Reason: "Incomplete owner details"
✗ Missing property location → Score: 0-20, Reason: "Property location not specified"
✗ Missing total area → Score: 0-20, Reason: "Property size not documented"
✗ Missing boundaries → Score: 0-25, Reason: "Boundary description missing"
✗ Contains placeholders (TODO, TBD, N/A, etc.) → Score: 0, Reason: "Incomplete document"
✗ Area mismatch >20% from satellite ({area_sqm} sqm) → Flag: "Area discrepancy detected"
✗ Document appears forged or fraudulent → Score: 0-10, Reason: "Suspicious document"

AUTHENTICATION ANALYSIS REQUIRED:
1. Verify document type is valid land document (if not → REJECT)
2. List which mandatory fields ARE present from actual content
3. List which mandatory fields are MISSING
4. Compare documented area with satellite measurement
5. State authenticity verdict: AUTHENTIC or REJECTED with specific reason

Provide detailed professional analysis (3-4 sentences) with SPECIFIC findings, listing exactly which fields were found or missing from the document content above."""
                    }
                ]
            )
            
            reasoning = response.choices[0].message.content
        except Exception as e:
            reasoning = f"Analysis based on {area_sqm} sqm property with NDVI {ndvi} and {document_count} documents. Vegetation health and area indicate {'strong' if ndvi > 0.6 else 'moderate' if ndvi > 0.4 else 'fair'} land quality with documentation {'complete' if document_count >= 2 else 'limited'}."
        
        result = {
            "valuation": valuation_result["valuation"],
            "confidence": valuation_result["confidence"],
            "reasoning": reasoning,
            "risk_factors": [
                "High cloud coverage" if cloud_coverage > 15 else None,
                "Insufficient documentation" if document_count < 2 else None,
                "Poor vegetation health" if ndvi < 0.25 else None
            ],
            "agent": "llama"
        }
        
        # Filter out None values from risk_factors
        result["risk_factors"] = [r for r in result["risk_factors"] if r]
        
        return result
        
    except Exception as e:
        return {
            "error": str(e),
            "agent": "llama"
        }

if __name__ == "__main__":
    # Read input from stdin or args
    if len(sys.argv) > 1:
        input_data = json.loads(sys.argv[1])
    else:
        input_data = json.loads(sys.stdin.read())
    
    result = analyze_property(input_data)
    print(json.dumps(result))
