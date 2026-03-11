/**
 * Script to authorize oracle address in ConsensusEngine contract
 * Run this once with the contract owner wallet
 */
const { createWalletClient, http, createPublicClient } = require('viem');
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
    public: {
      http: ['https://rpc.sepolia.mantle.xyz'],
    },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://explorer.sepolia.mantle.xyz' },
  },
  testnet: true,
});

const CONSENSUS_ENGINE_ADDRESS = process.env.CONSENSUS_ENGINE_ADDRESS;
const OWNER_PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY; // Contract owner key

// Oracle address to authorize (from ORACLE_PRIVATE_KEY)
const oracleAccount = privateKeyToAccount(process.env.ORACLE_PRIVATE_KEY);
const ORACLE_ADDRESS = oracleAccount.address;

// Owner account for authorization
const account = privateKeyToAccount(OWNER_PRIVATE_KEY);

console.log('═══════════════════════════════════════════════════════════════');
console.log('🔐 AUTHORIZING ORACLE ADDRESS ON CONSENSUS ENGINE');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`Contract:       ${CONSENSUS_ENGINE_ADDRESS}`);
console.log(`Oracle Address: ${ORACLE_ADDRESS}`);
console.log(`Owner Address:  ${account.address}`);
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

async function authorizeOracleOnConsensus() {
  try {
    // Check who the actual owner is
    console.log('🔍 Checking contract owner...');
    const actualOwner = await publicClient.readContract({
      address: CONSENSUS_ENGINE_ADDRESS,
      abi: CONSENSUS_ENGINE_ABI,
      functionName: 'owner'
    });
    console.log(`   Contract Owner: ${actualOwner}`);
    console.log(`   Your Wallet:    ${account.address}\n`);

    if (actualOwner.toLowerCase() !== account.address.toLowerCase()) {
      console.error('❌ ERROR: Your wallet is NOT the contract owner!');
      console.error(`\n   Contract owner: ${actualOwner}`);
      console.error(`   Your wallet:    ${account.address}\n`);
      console.error('💡 Solutions:');
      console.error('   1. Use the owner\'s private key in .env');
      console.error('   2. Have the owner call authorizeOracle() manually');
      console.error('   3. Check if you deployed with a different account\n');
      return;
    }

    // Check if already authorized
    console.log('🔍 Checking if oracle is already authorized on ConsensusEngine...');
    const isAuthorized = await publicClient.readContract({
      address: CONSENSUS_ENGINE_ADDRESS,
      abi: CONSENSUS_ENGINE_ABI,
      functionName: 'authorizedOracles',
      args: [ORACLE_ADDRESS]
    });

    if (isAuthorized) {
      console.log('✅ Oracle is already authorized on ConsensusEngine!');
      console.log(`   Address: ${ORACLE_ADDRESS}\n`);
      return;
    }

    console.log('📝 Oracle not authorized on ConsensusEngine. Authorizing...\n');

    // Authorize the oracle
    const hash = await walletClient.writeContract({
      address: CONSENSUS_ENGINE_ADDRESS,
      abi: CONSENSUS_ENGINE_ABI,
      functionName: 'authorizeOracle',
      args: [ORACLE_ADDRESS]
    });

    console.log(`📤 Transaction submitted: ${hash}`);
    console.log('⏳ Waiting for confirmation...\n');

    // Wait for transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log('✅ Oracle authorized on ConsensusEngine successfully!');
      console.log(`   Transaction: ${hash}`);
      console.log(`   Block: ${receipt.blockNumber}`);
      console.log(`   Oracle Address: ${ORACLE_ADDRESS}\n`);
      console.log('🎉 ConsensusEngine submissions will now work!');
    } else {
      console.log('❌ Transaction failed');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Make sure:');
    console.log('   1. The private key in .env is the contract owner');
    console.log('   2. You have enough MNT for gas fees');
    console.log('   3. The contract address is correct');
  }
}

authorizeOracleOnConsensus();
