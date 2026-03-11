/**
 * Test ConsensusEngine Submission
 * Creates a verification request that will trigger oracle submission to ConsensusEngine
 */
import * as dotenv from 'dotenv';
import { createWalletClient, createPublicClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

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
const ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY;
const ORACLE_ROUTER_ADDRESS = process.env.ORACLE_ROUTER_ADDRESS;

if (!ORACLE_PRIVATE_KEY) {
  throw new Error('ORACLE_PRIVATE_KEY not set in .env');
}

if (!ORACLE_ROUTER_ADDRESS) {
  throw new Error('ORACLE_ROUTER_ADDRESS not set in .env');
}

const privateKey = ORACLE_PRIVATE_KEY.startsWith('0x') ? ORACLE_PRIVATE_KEY : `0x${ORACLE_PRIVATE_KEY}`;
const account = privateKeyToAccount(privateKey as `0x${string}`);

console.log('🧪 Test ConsensusEngine Submission\n');
console.log('📍 Account:', account.address);
console.log('📍 OracleRouter:', ORACLE_ROUTER_ADDRESS);
console.log('🌐 Chain:', mantleSepolia.name);
console.log('🔗 RPC:', RPC_URL);
console.log();

const walletClient = createWalletClient({
  account,
  chain: mantleSepolia,
  transport: http(RPC_URL),
});

const publicClient = createPublicClient({
  chain: mantleSepolia,
  transport: http(RPC_URL),
});

// OracleRouter ABI - relevant functions
const ORACLE_ROUTER_ABI = [
  {
    inputs: [
      { name: '_latitude', type: 'int256' },
      { name: '_longitude', type: 'int256' },
      { name: '_documentHashes', type: 'bytes32[]' }
    ],
    name: 'requestVerification',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const;

async function createTestRequest() {
  try {
    console.log('⏳ Creating verification request...\n');

    // Create a test verification request
    const latitude = 40123456; // Test latitude
    const longitude = -74123456; // Test longitude
    const documentHash = '0x516d526a6759506e7a653959503932334e665433584a34784877746563586442'; // Sample IPFS hash

    const hash = await walletClient.writeContract({
      address: ORACLE_ROUTER_ADDRESS as `0x${string}`,
      abi: ORACLE_ROUTER_ABI,
      functionName: 'requestVerification',
      args: [
        BigInt(latitude),
        BigInt(longitude),
        [documentHash as `0x${string}`]
      ]
    });

    console.log('✅ Request created successfully!');
    console.log(`📤 Transaction: ${hash}\n`);

    // Wait for transaction to be mined
    console.log('⏳ Waiting for transaction confirmation...\n');
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ Confirmed in block ${receipt.blockNumber}\n`);

    // Wait a moment for the oracle to process
    console.log('⏳ Waiting for oracle to process request (30 seconds)...\n');
    await new Promise(resolve => setTimeout(resolve, 30000));

    console.log('✅ Test complete!');
    console.log('📝 Check oracle logs for:');
    console.log('   - ✅ ConsensusEngine submission successful');
    console.log('   - ✅ Gas estimated correctly by viem');
    console.log('   - ✅ No "replacement transaction underpriced" errors');
    console.log('   - ✅ L1 Anchoring initiated automatically\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createTestRequest().then(() => process.exit(0));
