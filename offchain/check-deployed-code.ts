import * as dotenv from 'dotenv';
import { createPublicClient, http, defineChain } from 'viem';

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

async function checkOnchainCode() {
  try {
    const RWA_TOKEN = '0x646100b6dc13a06c8db6891bb70892c26e3a7692'; // The one we just deployed

    console.log('📦 Checking deployed RWAToken bytecode...\n');

    const code = await publicClient.getCode({
      address: RWA_TOKEN as `0x${string}`,
    });

    console.log('✓ Code size:', code.length, 'bytes');
    console.log('✓ Code hash:', code);

    // Check if we can call functions
    const owner = await publicClient.call({
      account: '0xe01Add0c3640a8314132bAF491d101A38ffEF4f0',
      to: RWA_TOKEN as `0x${string}`,
      data: '0x8da5cb5b', // owner() selector
    });

    if (owner.result) {
      const ownerAddress = '0x' + owner.result.slice(-40);
      console.log('✓ Contract Owner:', ownerAddress);
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

checkOnchainCode();
