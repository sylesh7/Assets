/**
 * Script to authorize oracle as owner in RWATokenFactory and ComplianceModule
 * This allows the oracle to create tokens and manage compliance
 * Run this after deploying the tokenization contracts
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

// Contract addresses
const RWA_TOKEN_FACTORY_ADDRESS = process.env.RWA_TOKEN_FACTORY_ADDRESS || '0x68283AAa8899A4aA299141ca6f04dF8e5802509f';
const COMPLIANCE_MODULE_ADDRESS = process.env.COMPLIANCE_MODULE_ADDRESS || '0x0bfB6f131A99D5aaA3071618FFBD5bb3ea87C619';
const OWNER_PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY;

// Oracle address to authorize (from ORACLE_PRIVATE_KEY)
const oracleAccount = privateKeyToAccount(process.env.ORACLE_PRIVATE_KEY);
const ORACLE_ADDRESS = oracleAccount.address;

// Owner account for authorization
const account = privateKeyToAccount(OWNER_PRIVATE_KEY);

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('🔐 AUTHORIZING ORACLE FOR TOKENIZATION CONTRACTS');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`\n📋 Contracts:`);
console.log(`   RWATokenFactory:  ${RWA_TOKEN_FACTORY_ADDRESS}`);
console.log(`   ComplianceModule: ${COMPLIANCE_MODULE_ADDRESS}`);
console.log(`\n🔑 Accounts:`);
console.log(`   Oracle Address:   ${ORACLE_ADDRESS}`);
console.log(`   Owner Address:    ${account.address}`);
console.log('═══════════════════════════════════════════════════════════════\n');

if (!OWNER_PRIVATE_KEY) {
  console.error('❌ ERROR: OWNER_PRIVATE_KEY not set in .env');
  console.error('   This should be the private key of the contract deployer/owner\n');
  process.exit(1);
}

const walletClient = createWalletClient({
  account,
  chain: mantleSepolia,
  transport: http('https://rpc.sepolia.mantle.xyz')
});

const publicClient = createPublicClient({
  chain: mantleSepolia,
  transport: http('https://rpc.sepolia.mantle.xyz')
});

// Load RWATokenFactory ABI
const RWATokenFactoryArtifact = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../onchain/artifacts/contracts/tokens/RWATokenFactory.sol/RWATokenFactory.json'),
    'utf-8'
  )
);

// Load ComplianceModule ABI
const ComplianceModuleArtifact = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../onchain/artifacts/contracts/compliance/ComplianceModule.sol/ComplianceModule.json'),
    'utf-8'
  )
);

// Basic ABI for owner checks
const OWNER_ABI = [
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'newOwner', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

async function authorizeOracleForTokenization() {
  try {
    console.log('🔍 Verifying contract owners...\n');

    // Check RWATokenFactory owner
    console.log(`📍 RWATokenFactory: ${RWA_TOKEN_FACTORY_ADDRESS}`);
    const tokenFactoryOwner = await publicClient.readContract({
      address: RWA_TOKEN_FACTORY_ADDRESS,
      abi: OWNER_ABI,
      functionName: 'owner'
    });
    console.log(`   Current owner: ${tokenFactoryOwner}`);

    // Check if oracle already owns it (already authorized)
    if (tokenFactoryOwner.toLowerCase() === ORACLE_ADDRESS.toLowerCase()) {
      console.log(`   ✅ Already owned by oracle (already authorized)\n`);
    } else if (tokenFactoryOwner.toLowerCase() !== account.address.toLowerCase()) {
      console.error(`   ❌ You are NOT the owner of RWATokenFactory!`);
      console.error(`      Your wallet:    ${account.address}`);
      console.error(`      Contract owner: ${tokenFactoryOwner}\n`);
      return false;
    } else {
      console.log(`   ✅ You are the owner\n`);
    }

    // Check ComplianceModule owner
    console.log(`📍 ComplianceModule: ${COMPLIANCE_MODULE_ADDRESS}`);
    const complianceOwner = await publicClient.readContract({
      address: COMPLIANCE_MODULE_ADDRESS,
      abi: OWNER_ABI,
      functionName: 'owner'
    });
    console.log(`   Current owner: ${complianceOwner}`);

    // Check if oracle already owns it (already authorized)
    if (complianceOwner.toLowerCase() === ORACLE_ADDRESS.toLowerCase()) {
      console.log(`   ✅ Already owned by oracle (already authorized)\n`);
    } else if (complianceOwner.toLowerCase() !== account.address.toLowerCase()) {
      console.error(`   ❌ You are NOT the owner of ComplianceModule!`);
      console.error(`      Your wallet:    ${account.address}`);
      console.error(`      Contract owner: ${complianceOwner}\n`);
      return false;
    } else {
      console.log(`   ✅ You are the owner\n`);
    }

    // Transfer ownership of RWATokenFactory to oracle
    if (tokenFactoryOwner.toLowerCase() !== ORACLE_ADDRESS.toLowerCase()) {
      console.log('📤 Transferring RWATokenFactory ownership to oracle...');
      const tokenFactoryHash = await walletClient.writeContract({
        address: RWA_TOKEN_FACTORY_ADDRESS,
        abi: RWATokenFactoryArtifact.abi,
        functionName: 'transferOwnership',
        args: [ORACLE_ADDRESS]
      });
      console.log(`   Transaction: ${tokenFactoryHash}`);
      console.log('   ⏳ Waiting for confirmation...\n');

      const tokenFactoryReceipt = await publicClient.waitForTransactionReceipt({ hash: tokenFactoryHash });

      if (tokenFactoryReceipt.status === 'success') {
        console.log(`   ✅ RWATokenFactory ownership transferred`);
        console.log(`      New owner: ${ORACLE_ADDRESS}\n`);
      } else {
        console.error(`   ❌ Transaction failed\n`);
        return false;
      }
    } else {
      console.log(`✅ RWATokenFactory ownership already with oracle\n`);
    }

    // Transfer ownership of ComplianceModule to oracle
    if (complianceOwner.toLowerCase() !== ORACLE_ADDRESS.toLowerCase()) {
      console.log('📤 Transferring ComplianceModule ownership to oracle...');
      const complianceHash = await walletClient.writeContract({
        address: COMPLIANCE_MODULE_ADDRESS,
        abi: ComplianceModuleArtifact.abi,
        functionName: 'transferOwnership',
        args: [ORACLE_ADDRESS]
      });
      console.log(`   Transaction: ${complianceHash}`);
      console.log('   ⏳ Waiting for confirmation...\n');

      const complianceReceipt = await publicClient.waitForTransactionReceipt({ hash: complianceHash });

      if (complianceReceipt.status === 'success') {
        console.log(`   ✅ ComplianceModule ownership transferred`);
        console.log(`      New owner: ${ORACLE_ADDRESS}\n`);
      } else {
        console.error(`   ❌ Transaction failed\n`);
        return false;
      }
    } else {
      console.log(`✅ ComplianceModule ownership already with oracle\n`);
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ ORACLE SUCCESSFULLY AUTHORIZED FOR TOKENIZATION');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`\n✨ Oracle wallet can now:`);
    console.log(`   • Create tokens via RWATokenFactory.createToken()`);
    console.log(`   • Manage compliance via ComplianceModule.setKYCStatus()`);
    console.log(`\n🚀 You can now start the oracle backend with: npm run dev\n`);
    return true;

  } catch (error) {
    console.error('\n❌ Authorization failed:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('   1. Verify OWNER_PRIVATE_KEY is set in .env (contract deployer)');
    console.log('   2. Verify ORACLE_PRIVATE_KEY is set in .env (oracle wallet)');
    console.log('   3. Verify contract addresses are correct');
    console.log('   4. Verify your wallet has enough MNT for gas fees\n');
    return false;
  }
}

authorizeOracleForTokenization().then(success => {
  if (!success) {
    process.exit(1);
  }
});
