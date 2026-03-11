#!/usr/bin/env node
/**
 * Test script to verify oracle authorization on both contracts
 */
const { createPublicClient, http, defineChain } = require('viem');
require('dotenv').config();

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
    public: {
      http: ['https://rpc.sepolia.mantle.xyz'],
    },
  },
  testnet: true,
});

const publicClient = createPublicClient({
  chain: mantleSepolia,
  transport: http('https://rpc.sepolia.mantle.xyz')
});

const ABI = [
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'authorizedOracles',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  }
];

const ORACLE_ADDRESS = '0xe01Add0c3640a8314132bAF491d101A38ffEF4f0';
const ORACLE_ROUTER_ADDRESS = process.env.ORACLE_ROUTER_ADDRESS;
const CONSENSUS_ENGINE_ADDRESS = process.env.CONSENSUS_ENGINE_ADDRESS;

async function checkAuthorization() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔍 ORACLE AUTHORIZATION CHECK');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log(`Oracle Address: ${ORACLE_ADDRESS}\n`);

  try {
    // Check OracleRouter
    console.log('Checking OracleRouter authorization...');
    const oracleRouterAuth = await publicClient.readContract({
      address: ORACLE_ROUTER_ADDRESS,
      abi: ABI,
      functionName: 'authorizedOracles',
      args: [ORACLE_ADDRESS]
    });

    console.log(`  Address:      ${ORACLE_ROUTER_ADDRESS}`);
    console.log(`  Status:       ${oracleRouterAuth ? '✅ AUTHORIZED' : '❌ NOT AUTHORIZED'}\n`);

    // Check ConsensusEngine
    console.log('Checking ConsensusEngine authorization...');
    const consensusAuth = await publicClient.readContract({
      address: CONSENSUS_ENGINE_ADDRESS,
      abi: ABI,
      functionName: 'authorizedOracles',
      args: [ORACLE_ADDRESS]
    });

    console.log(`  Address:      ${CONSENSUS_ENGINE_ADDRESS}`);
    console.log(`  Status:       ${consensusAuth ? '✅ AUTHORIZED' : '❌ NOT AUTHORIZED'}\n`);

    console.log('═══════════════════════════════════════════════════════════════');
    if (oracleRouterAuth && consensusAuth) {
      console.log('✅ Oracle is fully authorized on both contracts!');
      console.log('   Ready for production operation.');
    } else if (oracleRouterAuth) {
      console.log('⚠️  Oracle is only authorized on OracleRouter.');
      console.log('   Run: node authorize-consensus-engine.js');
    } else if (consensusAuth) {
      console.log('⚠️  Oracle is only authorized on ConsensusEngine.');
      console.log('   Run: node authorize-oracle.js');
    } else {
      console.log('❌ Oracle is not authorized on any contracts!');
      console.log('   Run: node authorize-oracle.js');
      console.log('   Then: node authorize-consensus-engine.js');
    }
    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkAuthorization();
