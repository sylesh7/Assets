/**
 * Check if oracle is authorized in ConsensusEngine contract
 */
const { createPublicClient, http } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { defineChain } = require('viem');
require('dotenv').config();

// Mantle Sepolia chain
const mantleSepolia = defineChain({
  id: 5003,
  name: 'Mantle Sepolia Testnet',
  network: 'mantle-sepolia',
  nativeCurrency: {
    decimals: 18,
    name: 'MNT',
    symbol: 'MNT',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.sepolia.mantle.xyz'],
    },
  },
  testnet: true,
});

const CONSENSUS_ENGINE_ADDRESS = process.env.CONSENSUS_ENGINE_ADDRESS;
const oracleAccount = privateKeyToAccount(process.env.OWNER_PRIVATE_KEY);

const publicClient = createPublicClient({
  chain: mantleSepolia,
  transport: http('https://rpc.sepolia.mantle.xyz')
});

const CONSENSUS_ENGINE_ABI = [
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'authorizedOracles',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'minConfidenceThreshold',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'consensusThreshold',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
];

async function checkAuthorization() {
  try {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔍 CHECKING CONSENSUSENGINE AUTHORIZATION');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`ConsensusEngine: ${CONSENSUS_ENGINE_ADDRESS}`);
    console.log(`Oracle Address:  ${oracleAccount.address}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Check authorization
    const isAuthorized = await publicClient.readContract({
      address: CONSENSUS_ENGINE_ADDRESS,
      abi: CONSENSUS_ENGINE_ABI,
      functionName: 'authorizedOracles',
      args: [oracleAccount.address]
    });

    // Check thresholds
    const minConfidence = await publicClient.readContract({
      address: CONSENSUS_ENGINE_ADDRESS,
      abi: CONSENSUS_ENGINE_ABI,
      functionName: 'minConfidenceThreshold'
    });

    const consensusThreshold = await publicClient.readContract({
      address: CONSENSUS_ENGINE_ADDRESS,
      abi: CONSENSUS_ENGINE_ABI,
      functionName: 'consensusThreshold'
    });

    console.log('📊 Contract Configuration:');
    console.log(`   Min Confidence:      ${minConfidence}%`);
    console.log(`   Consensus Threshold: ${consensusThreshold} oracles\n`);

    if (isAuthorized) {
      console.log('✅ Oracle is AUTHORIZED in ConsensusEngine');
      console.log('   You can submit oracle responses\n');
    } else {
      console.log('❌ Oracle is NOT AUTHORIZED in ConsensusEngine');
      console.log('\n💡 To authorize this oracle:');
      console.log('   1. Make sure OWNER_PRIVATE_KEY is set in .env');
      console.log('   2. Run: node authorize-consensus-engine.js\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkAuthorization();
