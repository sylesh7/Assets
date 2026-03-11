/**
 * Script to authorize oracle address in ConsensusEngine & VerificationAnchor
 * This links the new L1 anchoring contracts with the oracle
 */
const { createWalletClient, http, createPublicClient } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { defineChain } = require('viem');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

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
    public: {
      http: ['https://rpc.sepolia.mantle.xyz'],
    },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://explorer.sepolia.mantle.xyz' },
  },
  testnet: true,
});

// Load deployment addresses
const deploymentAddressPath = path.join(__dirname, "..", "onchain", "deployment-addresses.json");
const deploymentAddresses = JSON.parse(fs.readFileSync(deploymentAddressPath, 'utf8'));

const CONSENSUS_ENGINE_ADDRESS = deploymentAddresses.ConsensusEngine;
const VERIFICATION_ANCHOR_ADDRESS = deploymentAddresses.VerificationAnchor;
const OWNER_PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY;

// Oracle address to authorize (derived from ORACLE_PRIVATE_KEY)
const oracleAccount = privateKeyToAccount(process.env.ORACLE_PRIVATE_KEY);
const ORACLE_ADDRESS = oracleAccount.address;

// Owner account for authorization
const account = privateKeyToAccount(OWNER_PRIVATE_KEY);

console.log('═══════════════════════════════════════════════════════════════');
console.log('🔐 AUTHORIZING ORACLE ON NEW CONTRACTS');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`ConsensusEngine:      ${CONSENSUS_ENGINE_ADDRESS}`);
console.log(`VerificationAnchor:   ${VERIFICATION_ANCHOR_ADDRESS}`);
console.log(`Oracle Address:       ${ORACLE_ADDRESS}`);
console.log(`Owner Address:        ${account.address}`);
console.log('═══════════════════════════════════════════════════════════════\n');

const walletClient = createWalletClient({
  account,
  chain: mantleSepolia,
  transport: http('https://rpc.sepolia.mantle.xyz')
});

const publicClient = createPublicClient({
  chain: mantleSepolia,
  transport: http('https://rpc.sepolia.mantle.xyz')
});

const CONSENSUS_ENGINE_ABI = [
  {
    inputs: [{ name: '_oracle', type: 'address' }],
    name: 'authorizeOracle',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'authorizedOracles',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  }
];

const VERIFICATION_ANCHOR_ABI = [
  {
    inputs: [{ name: '_consensusEngine', type: 'address' }],
    name: 'setConsensusEngine',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'consensusEngine',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  }
];

async function authorizeContracts() {
  try {
    // ============ 1. Authorize Oracle on ConsensusEngine ============
    console.log('⏳ 1/2 Authorizing oracle on ConsensusEngine...');
    
    // Check if already authorized
    const isAuthorized = await publicClient.readContract({
      address: CONSENSUS_ENGINE_ADDRESS,
      abi: CONSENSUS_ENGINE_ABI,
      functionName: 'authorizedOracles',
      args: [ORACLE_ADDRESS]
    });

    if (isAuthorized) {
      console.log('   ✅ Oracle already authorized on ConsensusEngine\n');
    } else {
      console.log('   ⏳ Submitting authorization transaction...');
      const hash = await walletClient.writeContract({
        address: CONSENSUS_ENGINE_ADDRESS,
        abi: CONSENSUS_ENGINE_ABI,
        functionName: 'authorizeOracle',
        args: [ORACLE_ADDRESS],
      });

      console.log(`   📤 Transaction: ${hash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`   ✅ Oracle authorized on ConsensusEngine (Block: ${receipt.blockNumber})\n`);
    }

    // ============ 2. Verify VerificationAnchor linkage ============
    console.log('⏳ 2/2 Verifying VerificationAnchor linkage...');
    
    const linkedEngine = await publicClient.readContract({
      address: VERIFICATION_ANCHOR_ADDRESS,
      abi: VERIFICATION_ANCHOR_ABI,
      functionName: 'consensusEngine'
    });

    if (linkedEngine.toLowerCase() === CONSENSUS_ENGINE_ADDRESS.toLowerCase()) {
      console.log('   ✅ VerificationAnchor already linked to ConsensusEngine\n');
    } else {
      console.log('   ⚠️  Linking VerificationAnchor to ConsensusEngine...');
      const hash = await walletClient.writeContract({
        address: VERIFICATION_ANCHOR_ADDRESS,
        abi: VERIFICATION_ANCHOR_ABI,
        functionName: 'setConsensusEngine',
        args: [CONSENSUS_ENGINE_ADDRESS],
      });

      console.log(`   📤 Transaction: ${hash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`   ✅ VerificationAnchor linked (Block: ${receipt.blockNumber})\n`);
    }

    // ============ Summary ============
    console.log('════════════════════════════════════════════════════════');
    console.log('✅ AUTHORIZATION COMPLETE');
    console.log('════════════════════════════════════════════════════════');
    console.log('\n📝 Authorized Setup:');
    console.log(`   Oracle:               ${ORACLE_ADDRESS}`);
    console.log(`   ConsensusEngine:      ${CONSENSUS_ENGINE_ADDRESS}`);
    console.log(`   VerificationAnchor:   ${VERIFICATION_ANCHOR_ADDRESS}`);
    console.log('\n✅ The oracle can now:');
    console.log('   • Submit oracle responses to ConsensusEngine');
    console.log('   • Trigger verification anchoring to L1');
    console.log('   • Access all L2-to-L1 bridging features\n');

  } catch (error) {
    console.error('\n❌ Authorization failed!');
    console.error('Error:', error.message);
    process.exit(1);
  }
}

authorizeContracts().then(() => process.exit(0));
