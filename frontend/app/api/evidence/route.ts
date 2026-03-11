import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get('requestId');
    
    if (!requestId) {
      return NextResponse.json({ error: 'Request ID required' }, { status: 400 });
    }

    // Read evidence mapping file from offchain directory
    const evidenceMapPath = path.join(process.cwd(), '..', 'offchain', 'evidence-map.json');
    
    if (!fs.existsSync(evidenceMapPath)) {
      return NextResponse.json({ 
        error: 'Evidence mapping not found',
        note: 'The offchain service has not yet processed any requests'
      }, { status: 404 });
    }

    const mappingData = fs.readFileSync(evidenceMapPath, 'utf-8');
    const mapping = JSON.parse(mappingData);
    
    const evidenceHash = mapping[requestId];
    
    if (!evidenceHash) {
      return NextResponse.json({ 
        error: 'No evidence found for this request',
        requestId 
      }, { status: 404 });
    }

    // Fetch evidence from IPFS
    const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${evidenceHash}`;
    const response = await fetch(ipfsUrl);
    
    if (!response.ok) {
      throw new Error('Failed to fetch from IPFS');
    }
    
    const evidence = await response.json();
    
    return NextResponse.json({ 
      success: true,
      evidence,
      ipfsHash: evidenceHash
    });
    
  } catch (error) {
    console.error('Evidence fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch evidence', details: String(error) },
      { status: 500 }
    );
  }
}
