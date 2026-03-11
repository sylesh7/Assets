import { NextRequest, NextResponse } from 'next/server'

/**
 * API Route: Generate satellite imagery on-demand
 * This allows displaying satellite images for any request with GPS coordinates
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const lat = searchParams.get('lat')
    const lng = searchParams.get('lng')

    if (!lat || !lng) {
      return NextResponse.json(
        { success: false, error: 'Missing latitude or longitude' },
        { status: 400 }
      )
    }

    // Call the backend satellite service
    // You'll need to expose this as an API endpoint or call Python directly
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
    
    const response = await fetch(`${backendUrl}/api/satellite?lat=${lat}&lng=${lng}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch satellite data')
    }

    const satelliteData = await response.json()

    return NextResponse.json({
      success: true,
      data: satelliteData
    })

  } catch (error) {
    console.error('Error fetching satellite imagery:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
