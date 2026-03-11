import * as dotenv from 'dotenv';
import { createPublicClient, http, defineChain } from 'viem';
import * as fs from 'fs';

dotenv.config();

const mantleSepolia = defineChain({
  id: 5003,
  name: 'Mantle Sepolia Testnet',
  nativeCurrency: { decimals: 18, name: 'MNT', symbol: 'MNT' },
  rpcUrls: { default: { http: ['https://rpc.sepolia.mantle.xyz'] } },
  testnet: true,
});

const publicClient = createPublicClient({
  chain: mantleSepolia,
  transport: http('https://rpc.sepolia.mantle.xyz'),
});

async function checkFactoryOwner() {
  try {
    const RWA_TOKEN_FACTORY = '0x68283AAa8899A4aA299141ca6f04dF8e5802509f';

    console.log('Checking RWATokenFactory ownership...\n');

    // Load ABI
    const abiPath = 'd:\\Projects\\prop99\\onchain\\artifacts\\contracts\\tokens\\RWATokenFactory.sol\\RWATokenFactory.json';
    const artifactContent = fs.readFileSync(abiPath, 'utf-8');
    const artifact = JSON.parse(artifactContent);
    const ABI = artifact.abi;

    // Find and call owner()
    const ownerFunc = ABI.find((item: any) => item.name === 'owner' && item.type === 'function');

    if (ownerFunc) {
      const owner = await publicClient.readContract({
        address: RWA_TOKEN_FACTORY as `0x${string}`,
        abi: [ownerFunc],
        functionName: 'owner',
      });

      console.log('✓ RWATokenFactory owner:', owner);
      console.log('✓ ORACLE_PRIVATE_KEY address: 0xe01Add0c3640a8314132bAF491d101A38ffEF4f0');
      
      if (owner?.toLowerCase() === '0xe01add0c3640a8314132baf491d101a38ffef4f0') {
        console.log('✓ MATCH!');
      } else {
        console.log('✗ MISMATCH - Oracle is NOT the factory owner!');
      }
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

checkFactoryOwner();
