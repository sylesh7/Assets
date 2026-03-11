/**
 * Test tokenization with the ASSET_REGISTRY_ADDRESS fix
 */

import dotenv from 'dotenv';
dotenv.config();

async function main() {
  console.log('🧪 Testing tokenization with ASSET_REGISTRY_ADDRESS fix...\n');

  // Import the tokenization service
  const { createTokenForAsset } = await import('./src/services/tokenization');

  // Test data
  const testRequest = {
    assetId: 'TEST_ASSET_001',
    assetName: 'Test RWA Property',
    owner: '0x588F6b3169F60176c1143f8BaB47bCf3DeEbECdc', // OWNER account
    valuation: 100000, // $100,000
    confidence: 85, // 85% confidence
  };

  try {
    console.log('📋 Test Request:');
    console.log(`   Asset ID: ${testRequest.assetId}`);
    console.log(`   Asset Name: ${testRequest.assetName}`);
    console.log(`   Owner: ${testRequest.owner}`);
    console.log(`   Valuation: $${testRequest.valuation}`);
    console.log(`   Confidence: ${testRequest.confidence}%\n`);

    console.log('Environment variables check:');
    console.log(`   ASSET_REGISTRY_ADDRESS: ${process.env.ASSET_REGISTRY_ADDRESS}`);
    console.log(`   RWA_TOKEN_FACTORY_ADDRESS: ${process.env.RWA_TOKEN_FACTORY_ADDRESS}`);
    console.log(`   COMPLIANCE_MODULE_ADDRESS: ${process.env.COMPLIANCE_MODULE_ADDRESS}`);
    console.log(`   OWNER_PRIVATE_KEY: ${process.env.OWNER_PRIVATE_KEY ? 'SET ✅' : 'NOT SET ❌'}\n`);

    console.log('🚀 Starting tokenization...\n');
    const result = await createTokenForAsset(testRequest as any);

    if (result) {
      console.log('\n✅ Tokenization successful!');
      console.log(`   Token Address: ${result}`);
    } else {
      console.log('\n❌ Tokenization failed (returned null)');
    }
  } catch (error: any) {
    console.error('\n❌ Error during tokenization:', error.message);
    console.error('\nFull error:');
    console.error(error);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
