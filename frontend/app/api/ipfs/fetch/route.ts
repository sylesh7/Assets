import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  let hash = searchParams.get('hash')

  if (!hash) {
    return NextResponse.json({ error: 'Hash required' }, { status: 400 })
  }

  // Strip ipfs:// prefix if present
  if (hash.startsWith('ipfs://')) {
    hash = hash.substring(7)
  }

  const gateways = [
    `https://cloudflare-ipfs.com/ipfs/${hash}`,
    `https://ipfs.io/ipfs/${hash}`,
    `https://gateway.pinata.cloud/ipfs/${hash}`,
  ]

  let lastError: Error | null = null

  for (const url of gateways) {
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        return NextResponse.json(data)
      }
    } catch (error) {
      lastError = error as Error
      continue
    }
  }

  console.error('All IPFS gateways failed:', lastError)
  return NextResponse.json(
    { error: 'Failed to fetch from all IPFS gateways' },
    { status: 500 }
  )
}

