import * as dotenv from 'dotenv';
import { createWalletClient, createPublicClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const mantleSepolia = defineChain({
  id: 5003,
  name: 'Mantle Sepolia Testnet',
  nativeCurrency: { decimals: 18, name: 'MNT', symbol: 'MNT' },
  rpcUrls: { default: { http: ['https://rpc.sepolia.mantle.xyz'] } },
  blockExplorers: { default: { name: 'Explorer', url: 'https://explorer.sepolia.mantle.xyz' } },
  testnet: true,
});

const RPC_URL = process.env.MANTLE_TESTNET_RPC_URL || 'https://rpc.sepolia.mantle.xyz';
const OWNER_PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY;
const RWA_TOKEN_FACTORY_ADDRESS = process.env.RWA_TOKEN_FACTORY_ADDRESS;

if (!OWNER_PRIVATE_KEY) {
  throw new Error('OWNER_PRIVATE_KEY not set in .env');
}

if (!RWA_TOKEN_FACTORY_ADDRESS) {
  throw new Error('RWA_TOKEN_FACTORY_ADDRESS not set in .env');
}

const privateKey = OWNER_PRIVATE_KEY.startsWith('0x') ? OWNER_PRIVATE_KEY : `0x${OWNER_PRIVATE_KEY}`;
const oracleAccount = privateKeyToAccount(privateKey as `0x${string}`);

console.log('🔐 Owner Account:', oracleAccount.address);
console.log('📍 RWA Token Factory:', RWA_TOKEN_FACTORY_ADDRESS);
console.log('🌐 Chain:', mantleSepolia.name);
console.log('🔗 RPC:', RPC_URL);

const walletClient = createWalletClient({
  account: oracleAccount,
  chain: mantleSepolia,
  transport: http(RPC_URL),
});

const publicClient = createPublicClient({
  chain: mantleSepolia,
  transport: http(RPC_URL),
});

// Load the ABI
const abiPath = 'd:\\Projects\\prop99\\onchain\\artifacts\\contracts\\tokens\\RWATokenFactory.sol\\RWATokenFactory.json';
console.log('Loading ABI from:', abiPath);
const artifactContent = fs.readFileSync(abiPath, 'utf-8');
const artifact = JSON.parse(artifactContent);
const RWA_TOKEN_FACTORY_ABI = artifact.abi;

async function testTokenCreation() {
  try {
    console.log('\n✅ Starting token creation test...\n');

    // Test parameters
    const assetId = 99n;
    const valuation = 1000000n; // 1 million in wei
    const owner = oracleAccount.address;
    const assetName = 'Test Property Token';

    console.log('📝 Test Parameters:');
    console.log('  - Asset ID:', assetId.toString());
    console.log('  - Valuation:', valuation.toString());
    console.log('  - Owner:', owner);
    console.log('  - Asset Name:', assetName);

    console.log('\n🚀 Sending createToken transaction...');

    const hash = await walletClient.writeContract({
      address: RWA_TOKEN_FACTORY_ADDRESS as `0x${string}`,
      abi: RWA_TOKEN_FACTORY_ABI,
      functionName: 'createToken',
      args: [assetId, valuation, owner, assetName],
    });

    console.log('✓ Transaction hash:', hash);
    console.log('⏳ Waiting for confirmation...');

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log('\n✅ Token creation successful!');
      console.log('📦 Block number:', receipt.blockNumber.toString());
      console.log('⛽ Gas used:', receipt.gasUsed.toString());

      // Try to find the token address from logs
      console.log('\n📋 Transaction receipt logs:');
      console.log(JSON.stringify(receipt.logs, null, 2));
    } else {
      console.log('\n❌ Transaction failed');
      console.log('📦 Block number:', receipt.blockNumber.toString());
    }
  } catch (error: any) {
    console.error('\n❌ Error during token creation:');
    console.error('Error:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
    if (error.details) {
      console.error('Details:', error.details);
    }
  }
}

testTokenCreation();
