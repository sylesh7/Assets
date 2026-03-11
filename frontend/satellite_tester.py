import ee
import requests
from PIL import Image
from io import BytesIO
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# 1. Initialize and Authenticate
# Use your Google Cloud Project ID
ee.Authenticate()
project_id = os.getenv('GOOGLE_EARTH_ENGINE_PROJECT_ID')
ee.Initialize(project=project_id)

# 2. Define Property Location (Lat, Long) and Area of Interest (AOI)
lat, lon = 11.9403538,79.4873254  # Example coordinates (New Delhi)
point = ee.Geometry.Point([lon, lat])
roi = point.buffer(100).bounds()  # 100-meter buffer around the point

# 3. Fetch Latest Sentinel-2 Imagery (High-Res 10m Multispectral)
s2_collection = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                 .filterBounds(roi)
                 .filterDate('2025-01-01', '2026-01-01')
                 .sort('CLOUDY_PIXEL_PERCENTAGE')
                 .first())

# 4. Fetch Thermal Data (Landsat 8 - 30m Thermal Band 10)
landsat_thermal = (ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
                   .filterBounds(roi)
                   .filterDate('2025-01-01', '2026-01-01')
                   .sort('CLOUD_COVER')
                   .first()
                   .select('ST_B10'))  # Surface Temperature Band

# 5. Calculate Property Area & Vegetation Quality (NDVI)
# Area calculation
area = roi.area(maxError=1).getInfo() # Returns area in square meters

# NDVI calculation (Vegetation Health)
ndvi = s2_collection.normalizedDifference(['B8', 'B4']).rename('NDVI')
mean_ndvi = ndvi.reduceRegion(
    reducer=ee.Reducer.mean(),
    geometry=roi,
    scale=10
).get('NDVI').getInfo()

# 6. Get Image Metadata
image_info = s2_collection.getInfo()
cloud_coverage = image_info['properties'].get('CLOUDY_PIXEL_PERCENTAGE', 'N/A')
acquisition_date = image_info['properties'].get('GENERATION_TIME', 'N/A')

# 7. Export Image URLs (for visualization without geemap)
# RGB Visual
rgb_vis = {
    'bands': ['B4', 'B3', 'B2'],
    'min': 0,
    'max': 3000,
    'dimensions': 512
}
rgb_url = s2_collection.getThumbURL(rgb_vis)

# NDVI Visualization
ndvi_vis = {
    'min': 0,
    'max': 1,
    'palette': ['red', 'yellow', 'green'],
    'dimensions': 512
}
ndvi_url = ndvi.getThumbURL(ndvi_vis)

# 8. Output Results
print("="*60)
print(f"🛰️  SATELLITE IMAGERY ANALYSIS RESULTS")
print("="*60)
print(f"📍 Location: {lat}, {lon}")
print(f"📏 Calculated Area: {area:.2f} sqm ({area/10.764:.2f} sqft)")
print(f"🌱 Mean Vegetation Health (NDVI): {mean_ndvi:.4f}")
print(f"☁️  Cloud Coverage: {cloud_coverage}%")
print(f"📅 Image Acquisition: {acquisition_date}")
print(f"\n✅ Status: Satellite Data Retrieved Successfully")
print("="*60)
print(f"\n🖼️  Image URLs (open in browser):")
print(f"RGB Visual: {rgb_url}")
print(f"NDVI Map: {ndvi_url}")
print("="*60)

# 9. Optional: Download images locally
def download_image(url, filename):
    try:
        response = requests.get(url)
        img = Image.open(BytesIO(response.content))
        img.save(filename)
        print(f"✅ Saved: {filename}")
    except Exception as e:
        print(f"❌ Failed to download {filename}: {e}")

# Uncomment to download images
# download_image(rgb_url, 'satellite_rgb.png')
# download_image(ndvi_url, 'satellite_ndvi.png')
