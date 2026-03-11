"""
Google Custom Search API - Property Price Oracle
Fetches real market prices from property listing sites
"""
import os
import re
import requests
from typing import Dict, Optional, List
from dotenv import load_dotenv

load_dotenv()

GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
GOOGLE_CSE_ID = os.getenv('GOOGLE_CSE_ID')

def extract_prices_from_text(text: str) -> List[float]:
    """Extract price values from text snippets"""
    prices = []
    text_lower = text.lower()
    
    # Patterns for different price formats with more flexibility
    patterns = [
        (r'\$\s*(\d{1,3}(?:,\d{3})+(?:\.\d{2})?)', 1),           # $1,234,567.89
        (r'(\d{1,3}(?:,\d{3})+)\s*(?:USD|usd|dollars?)', 1),     # 1,234,567 USD
        (r'₹\s*(\d{1,3}(?:,\d{3})+)', 1),                        # ₹12,34,567
        (r'(?:rs\.?|inr)\s*(\d{1,3}(?:,\d{3})+)', 1),           # Rs 12,34,567
        (r'(\d+\.?\d*)\s*(?:crore?s?)', 10000000),               # 1.5 Crore
        (r'(\d+\.?\d*)\s*(?:cr\.?)', 10000000),                  # 1.5 Cr
        (r'(\d+\.?\d*)\s*(?:lakh?s?|lac)', 100000),              # 50 Lakh
        (r'(\d{1,3}(?:,\d{3})+)\s*per\s*(?:sq|square)', 1),     # 5,000 per sq ft
        (r'£\s*(\d{1,3}(?:,\d{3})+)', 1),                        # £567,890
        (r'€\s*(\d{1,3}(?:,\d{3})+)', 1),                        # €890,123
    ]
    
    for pattern, multiplier in patterns:
        matches = re.findall(pattern, text_lower, re.IGNORECASE)
        for match in matches:
            try:
                # Remove commas and convert to float
                price = float(str(match).replace(',', ''))
                price = price * multiplier
                
                # Filter reasonable property prices (between $1k and $500M)
                if 1000 <= price <= 500000000:
                    prices.append(price)
            except:
                continue
    
    # Remove duplicates and outliers
    if len(prices) > 2:
        prices.sort()
        # Remove extreme outliers (keep middle 80%)
        trim = int(len(prices) * 0.1)
        if trim > 0:
            prices = prices[trim:-trim]
    
    return prices

def search_property_prices(location: str, latitude: float, longitude: float) -> Dict:
    """
    Search for property prices using Google Custom Search
    
    Args:
        location: Property address or description
        latitude: Property latitude
        longitude: Property longitude
    
    Returns:
        Dictionary with price data and metadata
    """
    if not GOOGLE_API_KEY or not GOOGLE_CSE_ID:
        return {
            'error': 'Google Custom Search API not configured',
            'prices': [],
            'average_price': 0,
            'confidence': 0
        }
    
    # Build more specific search queries
    queries = [
        f"property for sale price {location}",
        f"real estate price {latitude},{longitude}",
        f"land price near {location}",
        f"property valuation {location}"
    ]
    
    all_prices = []
    all_sources = []
    
    for query in queries[:2]:  # Try first 2 queries to save API calls
        try:
            # Call Google Custom Search API
            url = "https://www.googleapis.com/customsearch/v1"
            params = {
                'key': GOOGLE_API_KEY,
                'cx': GOOGLE_CSE_ID,
                'q': query,
                'num': 10  # Get 10 results
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            # Debug: Print what we're getting
            print(f"Query: {query}", file=sys.stderr)
            print(f"Results: {data.get('searchInformation', {}).get('totalResults', 0)}", file=sys.stderr)
            
            # Extract prices from search results
            if 'items' in data:
                for item in data['items']:
                    # Extract from title, snippet, and full text
                    title = item.get('title', '')
                    snippet = item.get('snippet', '')
                    link = item.get('link', '')
                    
                    # Combine all text
                    text = f"{title} {snippet}"
                    
                    # Also check pagemap for structured data
                    if 'pagemap' in item and 'metatags' in item['pagemap']:
                        for meta in item['pagemap']['metatags']:
                            text += " " + str(meta.get('og:description', ''))
                            text += " " + str(meta.get('description', ''))
                    
                    prices = extract_prices_from_text(text)
                    
                    if prices:
                        all_prices.extend(prices)
                        all_sources.append({
                            'title': title,
                            'link': link,
                            'prices': prices,
                            'snippet': snippet[:100]
                        })
                        print(f"✓ Found {len(prices)} price(s) in: {title[:50]}", file=sys.stderr)
            
            # If we found prices, don't need more queries
            if all_prices:
                break
                
        except Exception as e:
            print(f"Search query failed: {e}", file=sys.stderr)
            continue
    
    if not all_prices:
        # Return estimated price based on location patterns
        return {
            'error': 'No prices found - using estimated valuation',
            'prices': [],
            'average_price': 0,
            'confidence': 0,
            'query': queries[0],
            'note': 'Google Custom Search did not return extractable prices. Using satellite-only valuation.'
        }
    
    # Calculate statistics
    avg_price = sum(all_prices) / len(all_prices)
    median_price = sorted(all_prices)[len(all_prices) // 2]
    
    # Confidence based on number of results
    confidence = min(90, 50 + (len(all_prices) * 5))
    
    print(f"✓ Total prices found: {len(all_prices)}, Average: ${int(avg_price):,}", file=sys.stderr)
    
    return {
        'average_price': int(avg_price),
        'median_price': int(median_price),
        'min_price': int(min(all_prices)),
        'max_price': int(max(all_prices)),
        'price_count': len(all_prices),
        'confidence': confidence,
        'sources': all_sources[:5],  # Top 5 sources
        'query': queries[0]
    }

def get_market_valuation(location: str, latitude: float, longitude: float, area_sqm: float) -> Dict:
    """
    Get market valuation with price per sqm calculation
    
    Args:
        location: Property address
        latitude: Property latitude
        longitude: Property longitude
        area_sqm: Property area in square meters
    
    Returns:
        Valuation data with price analysis
    """
    price_data = search_property_prices(location, latitude, longitude)
    
    if price_data.get('error'):
        return price_data
    
    # Calculate estimated property value based on area
    avg_price = price_data.get('average_price', 0)
    
    # Estimate price per sqm if we have area
    if area_sqm > 0 and avg_price > 0:
        # Assume found prices are for similar-sized properties
        # This is a rough estimation
        estimated_price_per_sqm = avg_price / max(area_sqm, 100)
        property_valuation = int(estimated_price_per_sqm * area_sqm)
        
        price_data['estimated_valuation'] = property_valuation
        price_data['price_per_sqm'] = int(estimated_price_per_sqm)
    
    return price_data

if __name__ == "__main__":
    # Test with sample data
    import sys
    import json
    
    if len(sys.argv) > 1:
        # Parse command line args
        data = json.loads(sys.argv[1])
        location = data.get('location', '')
        lat = data.get('latitude', 0)
        lng = data.get('longitude', 0)
        area = data.get('area_sqm', 200)
    else:
        # Default test values
        location = "Chennai, India"
        lat = 13.0827
        lng = 80.2707
        area = 200
    
    result = get_market_valuation(location, lat, lng, area)
    print(json.dumps(result, indent=2))
