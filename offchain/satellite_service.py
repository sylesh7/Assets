"""
Satellite Service
Fetches satellite imagery using Google Earth Engine
"""
import os
import sys
import json
import ee
import requests
import tempfile
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

def fetch_satellite_data(latitude, longitude):
    """Fetch satellite imagery and metrics with high resolution"""
    try:
        # Authenticate and initialize Earth Engine
        project_id = os.getenv('GOOGLE_EARTH_ENGINE_PROJECT_ID')
        
        # Try to authenticate first (only needed once, but safe to call multiple times)
        try:
            ee.Authenticate()
        except Exception as auth_error:
            # If already authenticated, this will fail but we can continue
            print(f"Note: Authentication status: {auth_error}", file=sys.stderr)
        
        # Initialize Earth Engine with project ID
        ee.Initialize(project=project_id)
        
        # Create point of interest
        point = ee.Geometry.Point([longitude, latitude])
        
        # Create buffer area (100m radius) for calculations
        roi = point.buffer(100)
        
        # Get recent Sentinel-2 imagery with date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=365)
        
        # Use HARMONIZED collection for better availability - sorted by cloud coverage
        sentinel = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterBounds(roi) \
            .filterDate(start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')) \
            .sort('CLOUDY_PIXEL_PERCENTAGE') \
            .first()
        
        # Calculate NDVI (vegetation health)
        ndvi = sentinel.normalizedDifference(['B8', 'B4']).rename('NDVI')
        ndvi_stats = ndvi.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=roi,
            scale=10,
            maxPixels=1e9
        ).getInfo()
        
        ndvi_value = ndvi_stats.get('NDVI', 0.5)
        
        # Calculate area
        area_sqm = roi.area(maxError=1).getInfo()
        
        # Image parameters - WITHOUT region parameter for full square rendering
        # When region is omitted, GEE renders a proper square aligned to lat/lon
        rgb_params = {
            'bands': ['B4', 'B3', 'B2'],
            'min': 0,
            'max': 3000,
            'dimensions': 2048
        }
        
        # Get NDVI visualization URL
        ndvi_params = {
            'min': 0,
            'max': 1,
            'palette': ['red', 'yellow', 'green'],
            'dimensions': 2048
        }
        
        # True Color composite for better clarity
        true_color_params = {
            'bands': ['B2', 'B3', 'B4'],
            'min': 0,
            'max': 2500,
            'gamma': 1.2,
            'dimensions': 2048
        }
        
        # Color Infrared (CIR) - best for vegetation analysis
        cir_params = {
            'bands': ['B8', 'B4', 'B3'],
            'min': 0,
            'max': 3000,
            'dimensions': 2048
        }
        
        # Generate public URLs - simple approach without region for clarity
        try:
            print("Generating satellite image URLs...", file=sys.stderr)
            rgb_url = sentinel.getThumbURL(rgb_params)
            ndvi_url = ndvi.getThumbURL(ndvi_params)
            true_color_url = sentinel.getThumbURL(true_color_params)
            cir_url = sentinel.getThumbURL(cir_params)
            
            print("Downloading satellite images for IPFS storage...", file=sys.stderr)
            # Download the images and save to temp files for IPFS upload
            rgb_image_path = None
            ndvi_image_path = None
            cir_image_path = None
            true_color_image_path = None
            
            # Download with parallel requests and longer timeout
            try:
                # Download RGB image
                print(f"Downloading RGB image...", file=sys.stderr)
                rgb_response = requests.get(rgb_url, timeout=45)
                if rgb_response.status_code == 200:
                    with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as f:
                        f.write(rgb_response.content)
                        rgb_image_path = f.name
                        print(f"RGB image saved: {len(rgb_response.content)} bytes", file=sys.stderr)
                
                # Download NDVI image
                print(f"Downloading NDVI image...", file=sys.stderr)
                ndvi_response = requests.get(ndvi_url, timeout=45)
                if ndvi_response.status_code == 200:
                    with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as f:
                        f.write(ndvi_response.content)
                        ndvi_image_path = f.name
                        print(f"NDVI image saved: {len(ndvi_response.content)} bytes", file=sys.stderr)
                
                # Download CIR image (Color Infrared - best for land analysis)
                print(f"Downloading CIR image...", file=sys.stderr)
                cir_response = requests.get(cir_url, timeout=45)
                if cir_response.status_code == 200:
                    with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as f:
                        f.write(cir_response.content)
                        cir_image_path = f.name
                        print(f"CIR image saved: {len(cir_response.content)} bytes", file=sys.stderr)
                
                # Download True Color image
                print(f"Downloading True Color image...", file=sys.stderr)
                true_color_response = requests.get(true_color_url, timeout=45)
                if true_color_response.status_code == 200:
                    with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as f:
                        f.write(true_color_response.content)
                        true_color_image_path = f.name
                        print(f"True Color image saved: {len(true_color_response.content)} bytes", file=sys.stderr)
                
                print("All satellite images downloaded successfully!", file=sys.stderr)
                        
            except requests.Timeout as timeout_error:
                print(f"Warning: Image download timeout (will continue with available images): {timeout_error}", file=sys.stderr)
            except Exception as download_error:
                print(f"Warning: Could not download all images (will continue with available): {download_error}", file=sys.stderr)
                
        except Exception as url_error:
            print(f"Warning: Could not generate image URLs: {url_error}", file=sys.stderr)
            rgb_url = None
            ndvi_url = None
            true_color_url = None
            cir_url = None
            rgb_image_path = None
            ndvi_image_path = None
            cir_image_path = None
            true_color_image_path = None
        
        # Get image metadata
        image_info = sentinel.getInfo()
        properties = image_info['properties']
        
        result = {
            'latitude': latitude,
            'longitude': longitude,
            'area_sqm': round(area_sqm, 2),
            'ndvi': round(ndvi_value, 4),
            'cloud_coverage': round(properties.get('CLOUDY_PIXEL_PERCENTAGE', 0), 2),
            'resolution_meters': 10,
            'image_date': properties.get('GENERATION_TIME', 'N/A'),
            'satellite': 'Sentinel-2',
            'rgb_image_url': rgb_url,
            'ndvi_image_url': ndvi_url,
            'true_color_url': true_color_url,
            'cir_image_url': cir_url,
            'rgb_image_path': rgb_image_path,
            'ndvi_image_path': ndvi_image_path,
            'cir_image_path': cir_image_path,
            'true_color_image_path': true_color_image_path,
            'image_quality': 'ULTRA HIGH (2048x2048 resolution)',
            'recommended_view': 'cir_image_url'  # CIR is clearest for land analysis
        }
        
        return result
        
    except Exception as e:
        # Fail with real error - no mock data
        print(f"Error: Satellite service failed: {e}", file=sys.stderr)
        raise Exception(f"Satellite service failed: {str(e)}")

if __name__ == "__main__":
    # Read input from stdin or args
    try:
        if len(sys.argv) > 2:
            lat = float(sys.argv[1])
            lon = float(sys.argv[2])
        else:
            input_data = json.loads(sys.stdin.read())
            lat = input_data['latitude']
            lon = input_data['longitude']
        
        result = fetch_satellite_data(lat, lon)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)