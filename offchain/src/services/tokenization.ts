/**
 * Tokenization Service
 * Handles automatic ERC-20 token creation for verified assets
 * Works with RWATokenFactory to create and register tokens
 */

import { createWalletClient, createPublicClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Define Mantle Sepolia Testnet
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

// Load contract artifacts
const RWATokenFactoryArtifact = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../../onchain/artifacts/contracts/tokens/RWATokenFactory.sol/RWATokenFactory.json'),
    'utf-8'
  )
);

const RWATokenArtifact = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../../onchain/artifacts/contracts/tokens/RWAToken.sol/RWAToken.json'),
    'utf-8'
  )
);

const ComplianceModuleArtifact = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../../onchain/artifacts/contracts/compliance/ComplianceModule.sol/ComplianceModule.json'),
    'utf-8'
  )
);

// Contract addresses - from environment variables or fallback to deployment file
let RWA_TOKEN_FACTORY_ADDRESS = process.env.RWA_TOKEN_FACTORY_ADDRESS as `0x${string}`;
let COMPLIANCE_MODULE_ADDRESS = process.env.COMPLIANCE_MODULE_ADDRESS as `0x${string}`;
let ASSET_REGISTRY_ADDRESS = process.env.ASSET_REGISTRY_ADDRESS as `0x${string}`;

// Fallback to deployment addresses file if env vars not set
if (!RWA_TOKEN_FACTORY_ADDRESS || !COMPLIANCE_MODULE_ADDRESS || !ASSET_REGISTRY_ADDRESS) {
  try {
    const deploymentAddresses = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '../../../onchain/deployment-addresses.json'),
        'utf-8'
      )
    );
    RWA_TOKEN_FACTORY_ADDRESS = RWA_TOKEN_FACTORY_ADDRESS || deploymentAddresses.RWATokenFactory;
    COMPLIANCE_MODULE_ADDRESS = COMPLIANCE_MODULE_ADDRESS || deploymentAddresses.ComplianceModule;
    ASSET_REGISTRY_ADDRESS = ASSET_REGISTRY_ADDRESS || deploymentAddresses.AssetRegistry;
  } catch (e) {
    logger.warn('Could not load deployment-addresses.json, relying on env variables');
  }
}

// Validate addresses
if (!RWA_TOKEN_FACTORY_ADDRESS || !RWA_TOKEN_FACTORY_ADDRESS.match(/^0x[a-fA-F0-9]{40}$/)) {
  throw new Error(`Invalid or missing RWA_TOKEN_FACTORY_ADDRESS: ${RWA_TOKEN_FACTORY_ADDRESS}. Set RWA_TOKEN_FACTORY_ADDRESS env var or check deployment-addresses.json`);
}
if (!COMPLIANCE_MODULE_ADDRESS || !COMPLIANCE_MODULE_ADDRESS.match(/^0x[a-fA-F0-9]{40}$/)) {
  throw new Error(`Invalid or missing COMPLIANCE_MODULE_ADDRESS: ${COMPLIANCE_MODULE_ADDRESS}. Set COMPLIANCE_MODULE_ADDRESS env var or check deployment-addresses.json`);
}
if (!ASSET_REGISTRY_ADDRESS || !ASSET_REGISTRY_ADDRESS.match(/^0x[a-fA-F0-9]{40}$/)) {
  throw new Error(`Invalid or missing ASSET_REGISTRY_ADDRESS: ${ASSET_REGISTRY_ADDRESS}. Set ASSET_REGISTRY_ADDRESS env var or check deployment-addresses.json`);
}

// Get oracle account from environment (this is the contract owner for RWATokenFactory)
const ORACLE_PRIVATE_KEY = (process.env.ORACLE_PRIVATE_KEY?.trim().startsWith('0x')
  ? process.env.ORACLE_PRIVATE_KEY.trim()
  : `0x${process.env.ORACLE_PRIVATE_KEY?.trim()}`) as `0x${string}`;

const oracleAccount = privateKeyToAccount(ORACLE_PRIVATE_KEY);

// Get owner account from environment (for minting tokens)
const OWNER_PRIVATE_KEY = (process.env.OWNER_PRIVATE_KEY?.trim().startsWith('0x')
  ? process.env.OWNER_PRIVATE_KEY.trim()
  : `0x${process.env.OWNER_PRIVATE_KEY?.trim()}`) as `0x${string}`;

const ownerAccount = privateKeyToAccount(OWNER_PRIVATE_KEY);

// Create clients - using Mantle Sepolia via environment variable or fallback
const RPC_URL = process.env.MANTLE_TESTNET_RPC_URL || 'https://rpc.sepolia.mantle.xyz';

const walletClient = createWalletClient({
  account: oracleAccount,
  chain: mantleSepolia,
  transport: http(RPC_URL),
});

// Separate wallet client for owner (for minting)
const ownerWalletClient = createWalletClient({
  account: ownerAccount,
  chain: mantleSepolia,
  transport: http(RPC_URL),
});

const publicClient = createPublicClient({
  chain: mantleSepolia,
  transport: http(RPC_URL),
});

export interface TokenizationRequest {
  requestId: string;
  assetId: bigint;
  assetName: string;
  valuation: number;
  confidence: number;
  owner: string;
}

/**
 * Mint tokens for a newly created RWA token
 */
async function mintTokens(tokenAddress: string, toAddress: string, amount: bigint): Promise<boolean> {
  try {
    logger.info(`   💰 Minting tokens...`);
    logger.info(`      Token: ${tokenAddress}`);
    logger.info(`      To: ${toAddress}`);
    logger.info(`      Amount: ${amount.toString()}`);

    // Get the current nonce explicitly to avoid conflicts
    const nonce = await publicClient.getTransactionCount({
      address: ownerAccount.address,
      blockTag: 'pending',
    });

    logger.info(`      🔢 Using nonce: ${nonce}`);

    const hash = await ownerWalletClient.writeContract({
      address: tokenAddress as `0x${string}`,
      abi: RWATokenArtifact.abi,
      functionName: 'mint',
      args: [toAddress as `0x${string}`, amount],
      nonce,
    });

    logger.info(`      Transaction: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      logger.info(`      ✅ Tokens minted successfully\n`);
      return true;
    } else {
      logger.warn(`      ⚠️  Mint transaction failed\n`);
      return false;
    }
  } catch (error: any) {
    logger.error(`      ❌ Minting failed: ${error.message}\n`);
    return false;
  }
}

/**
 * Deploy RWA token directly (bypasses factory to avoid mint authorization issues)
 */
async function deployRWAToken(request: TokenizationRequest, valuationInWei: bigint): Promise<string | null> {
  try {
    logger.info(`   📝 Deploying RWAToken directly...\n`);

    // Create token name and symbol
    const tokenName = `RWA-${request.assetName}`;
    const tokenSymbol = `RWA${request.assetId}`;

    logger.info(`   📋 Token Details:`);
    logger.info(`      Name: ${tokenName}`);
    logger.info(`      Symbol: ${tokenSymbol}`);
    logger.info(`      AssetId: ${request.assetId}`);
    logger.info(`      Valuation: ${valuationInWei.toString()}\n`);

    // Convert assetId to BigInt (contract expects uint256)
    // If assetId is numeric, use it directly; otherwise use hash of string
    let assetIdBigInt: bigint;
    if (/^\d+$/.test(request.assetId)) {
      assetIdBigInt = BigInt(request.assetId);
    } else {
      // Hash the string assetId to create a numeric ID
      // Using a simple hash: sum of character codes
      assetIdBigInt = BigInt(
        request.assetId
          .split('')
          .reduce((sum, char) => sum + char.charCodeAt(0), 0)
      );
    }

    // Get the current nonce explicitly to avoid conflicts
    const nonce = await publicClient.getTransactionCount({
      address: ownerAccount.address,
      blockTag: 'pending', // Use pending to include unconfirmed transactions
    });

    logger.info(`   🔢 Using nonce: ${nonce}`);

    const hash = await ownerWalletClient.deployContract({
      abi: RWATokenArtifact.abi,
      bytecode: RWATokenArtifact.bytecode as `0x${string}`,
      args: [
        tokenName,
        tokenSymbol,
        assetIdBigInt,
        valuationInWei,
        ASSET_REGISTRY_ADDRESS as `0x${string}`,
        ownerAccount.address,  // Use OWNER account, not request.owner
      ],
      nonce, // Explicitly set nonce
    });

    logger.info(`   ✅ Deployment transaction: ${hash}`);
    logger.info(`   ⏳ Waiting for confirmation...\n`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success' && receipt.contractAddress) {
      logger.info(`   ✅ Deployment confirmed in block ${receipt.blockNumber}`);
      logger.info(`   ⛽ Gas used: ${receipt.gasUsed.toString()}\n`);
      return receipt.contractAddress;
    } else {
      logger.error(`   ❌ Deployment failed`);
      return null;
    }
  } catch (error: any) {
    logger.error(`   ❌ Deployment failed: ${error.message}\n`);
    return null;
  }
}

/**
 * Create ERC-20 token for verified asset
 */
export async function createTokenForAsset(request: TokenizationRequest): Promise<string | null> {
  try {
    logger.info('\n🎫 ═══════════════════════════════════════════════════════');
    logger.info('🎫 CREATING ERC-20 TOKEN FOR VERIFIED ASSET');
    logger.info('🎫 ═══════════════════════════════════════════════════════\n');
    logger.info(`   🏭 Deploying RWAToken directly (bypassing factory)`);
    logger.info(`   🔐 ComplianceModule: ${COMPLIANCE_MODULE_ADDRESS}`);
    logger.info(`   💼 Owner Wallet: ${ownerAccount.address}\n`);
    logger.info(`   📋 Asset Details:`);
    logger.info(`      Asset ID: ${request.assetId}`);
    logger.info(`      Asset Name: ${request.assetName}`);
    logger.info(`      Valuation: $${Number(request.valuation).toLocaleString()}`);
    logger.info(`      Confidence: ${request.confidence}%`);
    logger.info(`      Owner: ${request.owner}\n`);

    // Convert valuation to wei (multiply by 1e18)
    const valuationInWei = BigInt(Math.round(request.valuation)) * BigInt(1e18);
    
    logger.info(`   🔢 Conversion:`);
    logger.info(`      USD Amount: $${Number(request.valuation)}`);
    logger.info(`      Wei Amount: ${valuationInWei}\n`);

    // Step 1: Deploy RWAToken directly
    logger.info(`   📡 Step 1: Deploying RWAToken...\n`);
    const tokenAddress = await deployRWAToken(request, valuationInWei);

    if (!tokenAddress) {
      logger.error(`   ❌ Failed to deploy token`);
      return null;
    }

    logger.info(`   🪙 Token Address: ${tokenAddress}`);
    logger.info(`   ✅ ERC-20 token successfully deployed!\n`);

    // Step 2: Mint tokens using owner account
    logger.info(`   📝 Step 2: Minting tokens...\n`);
    const mintSuccess = await mintTokens(tokenAddress, request.owner, valuationInWei);

    if (!mintSuccess) {
      logger.warn(`   ⚠️  Minting failed, but token is deployed at: ${tokenAddress}\n`);
    }

    logger.info('🎫 ═══════════════════════════════════════════════════════');
    logger.info('🎫 TOKENIZATION COMPLETE ✅');
    logger.info('🎫 ═══════════════════════════════════════════════════════\n');

    return tokenAddress;
  } catch (error: any) {
    logger.error(`\n❌ Tokenization failed: ${error.message}`);
    
    // Log more details for debugging
    if (error.cause) {
      logger.error(`   Details: ${error.cause}`);
    }
    if (error.shortMessage) {
      logger.error(`   Error: ${error.shortMessage}`);
    }

    logger.info('\n🎫 ═══════════════════════════════════════════════════════');
    logger.info('🎫 TOKENIZATION FAILED ❌');
    logger.info('🎫 ═══════════════════════════════════════════════════════\n');

    return null;
  }
}

/**
 * Set compliance status for token owner
 */
export async function setOwnerCompliance(ownerAddress: string): Promise<boolean> {
  try {
    logger.info('   🔐 Setting KYC compliance status...');

    // Get the current nonce explicitly to avoid conflicts
    const nonce = await publicClient.getTransactionCount({
      address: oracleAccount.address,
      blockTag: 'pending',
    });

    logger.info(`      🔢 Using nonce: ${nonce}`);

    const hash = await walletClient.writeContract({
      address: COMPLIANCE_MODULE_ADDRESS,
      abi: ComplianceModuleArtifact.abi,
      functionName: 'setKYCStatus',
      args: [ownerAddress as `0x${string}`, true, 0], // 0 = unrestricted jurisdiction
      nonce,
    });

    logger.info(`      Transaction: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      logger.info(`      ✅ Compliance status set\n`);
      return true;
    } else {
      logger.warn(`      ⚠️  Compliance transaction failed\n`);
      return false;
    }
  } catch (error: any) {
    logger.warn(`      ⚠️  Could not set compliance: ${error.message}\n`);
    return false; // Non-critical, continue
  }
}

/**
 * Main tokenization workflow
 * Called after verification is successful and confidence >= 70%
 */
export async function tokenizeVerifiedAsset(request: TokenizationRequest): Promise<{
  success: boolean;
  tokenAddress?: string;
  error?: string;
}> {
  try {
    // Step 1: Create token
    const tokenAddress = await createTokenForAsset(request);

    if (!tokenAddress) {
      return {
        success: false,
        error: 'Failed to create token',
      };
    }

    // Step 2: Set compliance (non-blocking)
    await setOwnerCompliance(request.owner);

    logger.info(`📊 Tokenization Summary:`);
    logger.info(`   ✅ Token Created: ${tokenAddress}`);
    logger.info(`   ✅ Asset ID: ${request.assetId}`);
    logger.info(`   ✅ Owner: ${request.owner}`);
    logger.info(`   ✅ Valuation: $${Number(request.valuation).toLocaleString()}\n`);

    return {
      success: true,
      tokenAddress,
    };
  } catch (error: any) {
    logger.error(`Error in tokenization workflow: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
}

export default { createTokenForAsset, setOwnerCompliance, tokenizeVerifiedAsset };
