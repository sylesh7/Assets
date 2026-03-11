"""
AI Agent 1 - Groq (Llama 3.3 70B)
Fast inference for property valuation
"""
import os
import sys
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

def analyze_property(data):
    """Analyze property and return valuation"""
    try:
        client = Groq(api_key=os.getenv('GROQ_API_KEY'))
        
        # Get document contents
        document_contents = data.get('document_contents', [])
        has_documents = len(document_contents) > 0
        
        # Debug log to stderr
        print(f"[Agent1 DEBUG] Received {len(document_contents)} documents", file=sys.stderr)
        for i, content in enumerate(document_contents):
            print(f"[Agent1 DEBUG] Doc {i+1}: {len(content)} chars, preview: {content[:100]}", file=sys.stderr)
        
        document_analysis = ""
        if has_documents:
            document_analysis = f"\n\nDOCUMENT CONTENTS TO ANALYZE:\n"
            for i, content in enumerate(document_contents):
                # Analyze FULL document text, not just first 1000 chars
                document_analysis += f"\nDocument {i+1} (FULL TEXT - {len(content)} characters):\n{content}\n"
        
        prompt = f"""
Analyze this real estate property according to land document verification standards and provide a valuation in JSON format.

PROPERTY DATA:
Location: {data.get('latitude')}, {data.get('longitude')}
Satellite Area: {data.get('satellite_data', {}).get('area_sqm', 'N/A')} sqm
NDVI (vegetation): {data.get('satellite_data', {}).get('ndvi', 'N/A')}
Documents: {data.get('document_count', 0)} files
{document_analysis}

⚠️ CRITICAL: STRICT LAND DOCUMENT VERIFICATION SYSTEM ⚠️
You are analyzing documents for LAND/PROPERTY TOKENIZATION ONLY.

STEP 1: DOCUMENT TYPE CHECK
First, verify the document is a LAND DOCUMENT (Sale Deed, Purchase Deed, Land Title, Property Deed, Transfer Deed, Conveyance Deed).
If the document is ANY OTHER TYPE (invoice, contract, receipt, business document, etc.) → IMMEDIATELY REJECT with authenticity_score = 0

STEP 2: MANDATORY FIELDS CHECK (Only for land documents)
ALL these fields MUST be present and complete:
1. Property Identification: Survey number, plot number, or deed number
2. Owner/Seller Information: Full name and complete address
3. Property Location: Full address or detailed location
4. Total Area: Size with units (sqm, sqft, acres, etc.)
5. Boundaries: Detailed boundary description
6. Legal Description: Deed type and registration details

STEP 3: VALIDATION RULES
- If document is NOT a land/property deed → authenticity_score = 0, red_flags: ["NOT A LAND DOCUMENT"]
- If missing ANY mandatory field → authenticity_score = 0-30, list in missing_fields
- If contains placeholders (TODO, TBD, N/A) → authenticity_score = 0, red_flags: ["Contains placeholder data"]
- If document appears forged or fraudulent → authenticity_score = 0-20
- Compare documented area with satellite area ({data.get('satellite_data', {}).get('area_sqm', 'N/A')} sqm)
- If area mismatch > 20% → Add "Area mismatch >20% with satellite data" to red_flags

REJECTION CRITERIA (authenticity_score MUST be 0-40 if ANY apply):
❌ Document is NOT a land/property deed
❌ Missing survey/plot number
❌ Missing owner name or address
❌ Missing property location
❌ Missing total area
❌ Missing boundaries
❌ Contains placeholder or incomplete data
❌ Document appears forged or fraudulent

Provide comprehensive analysis. Return ONLY valid JSON:
{{
    "valuation": <number in USD, use 0 if rejecting>,
    "confidence": <number 0-100, use 0-30 if rejecting>,
    "reasoning": "<detailed explanation including SPECIFIC findings from document analysis>",
    "risk_factors": ["<risk1>", "<risk2>"],
    "document_verification": {{
        "is_land_document": <true/false>,
        "document_type_found": "<what type of document this appears to be>",
        "authenticity_score": <0-100, MUST be 0-30 if not land document or missing mandatory fields>,
        "missing_fields": ["<field1>", "<field2>"],
        "red_flags": ["<flag1>", "<flag2>"]
    }}
}}
"""
        
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert real estate appraiser. Analyze property data and provide accurate valuations."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.3,
            max_tokens=2000,
            response_format={"type": "json_object"}
        )
        
        result = json.loads(completion.choices[0].message.content)
        result['agent'] = 'groq'
        return result
        
    except Exception as e:
        return {
            "error": str(e),
            "agent": "groq"
        }

if __name__ == "__main__":
    # Read input from stdin or args
    if len(sys.argv) > 1:
        input_data = json.loads(sys.argv[1])
    else:
        input_data = json.loads(sys.stdin.read())
    
    result = analyze_property(input_data)
    print(json.dumps(result))
