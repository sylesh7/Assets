"use strict";
/**
 * Tokenization Service
 * Handles automatic ERC-20 token creation for verified assets on Ethereum Sepolia
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTokenForAsset = createTokenForAsset;
exports.setOwnerCompliance = setOwnerCompliance;
exports.tokenizeVerifiedAsset = tokenizeVerifiedAsset;
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const accounts_1 = require("viem/accounts");
const logger_1 = require("../utils/logger");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Load contract artifacts
const RWATokenFactoryArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../onchain/artifacts/contracts/tokens/RWATokenFactory.sol/RWATokenFactory.json'), 'utf-8'));
const RWATokenArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../onchain/artifacts/contracts/tokens/RWAToken.sol/RWAToken.json'), 'utf-8'));
const ComplianceModuleArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../onchain/artifacts/contracts/compliance/ComplianceModule.sol/ComplianceModule.json'), 'utf-8'));
// Contract addresses - from environment variables or fallback to deployment file
let RWA_TOKEN_FACTORY_ADDRESS = process.env.RWA_TOKEN_FACTORY_ADDRESS;
let COMPLIANCE_MODULE_ADDRESS = process.env.COMPLIANCE_MODULE_ADDRESS;
let ASSET_REGISTRY_ADDRESS = process.env.ASSET_REGISTRY_ADDRESS;
// Fallback to deployment addresses file if env vars not set
if (!RWA_TOKEN_FACTORY_ADDRESS || !COMPLIANCE_MODULE_ADDRESS || !ASSET_REGISTRY_ADDRESS) {
    try {
        const deploymentAddresses = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../onchain/deployment-addresses.json'), 'utf-8'));
        RWA_TOKEN_FACTORY_ADDRESS = RWA_TOKEN_FACTORY_ADDRESS || deploymentAddresses.RWATokenFactory;
        COMPLIANCE_MODULE_ADDRESS = COMPLIANCE_MODULE_ADDRESS || deploymentAddresses.ComplianceModule;
        ASSET_REGISTRY_ADDRESS = ASSET_REGISTRY_ADDRESS || deploymentAddresses.AssetRegistry;
    }
    catch (e) {
        logger_1.logger.warn('Could not load deployment-addresses.json, relying on env variables');
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
const privateKeyEnv = process.env.ORACLE_PRIVATE_KEY;
if (!privateKeyEnv) {
    throw new Error('ORACLE_PRIVATE_KEY environment variable is not set');
}
const ORACLE_PRIVATE_KEY = (privateKeyEnv.trim().startsWith('0x')
    ? privateKeyEnv.trim()
    : `0x${privateKeyEnv.trim()}`);
const oracleAccount = (0, accounts_1.privateKeyToAccount)(ORACLE_PRIVATE_KEY);
// Get owner account from environment (for minting tokens)
const ownerPrivateKeyEnv = process.env.OWNER_PRIVATE_KEY;
if (!ownerPrivateKeyEnv) {
    throw new Error('OWNER_PRIVATE_KEY environment variable is not set');
}
const OWNER_PRIVATE_KEY = (ownerPrivateKeyEnv.trim().startsWith('0x')
    ? ownerPrivateKeyEnv.trim()
    : `0x${ownerPrivateKeyEnv.trim()}`);
const ownerAccount = (0, accounts_1.privateKeyToAccount)(OWNER_PRIVATE_KEY);
// Create clients - using Ethereum Sepolia
const RPC_URL = process.env.ETH_SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/';
const walletClient = (0, viem_1.createWalletClient)({
    account: oracleAccount,
    chain: chains_1.sepolia,
    transport: (0, viem_1.http)(RPC_URL),
});
// Separate wallet client for owner (for minting)
const ownerWalletClient = (0, viem_1.createWalletClient)({
    account: ownerAccount,
    chain: chains_1.sepolia,
    transport: (0, viem_1.http)(RPC_URL),
});
const publicClient = (0, viem_1.createPublicClient)({
    chain: chains_1.sepolia,
    transport: (0, viem_1.http)(RPC_URL),
});
/**
 * Mint tokens for a newly created RWA token
 */
async function mintTokens(tokenAddress, toAddress, amount) {
    try {
        logger_1.logger.info(`   💰 Minting tokens...`);
        logger_1.logger.info(`      Token: ${tokenAddress}`);
        logger_1.logger.info(`      To: ${toAddress}`);
        logger_1.logger.info(`      Amount: ${amount.toString()}`);
        // Get the current nonce explicitly to avoid conflicts
        const nonce = await publicClient.getTransactionCount({
            address: ownerAccount.address,
            blockTag: 'pending',
        });
        logger_1.logger.info(`      🔢 Using nonce: ${nonce}`);
        const hash = await ownerWalletClient.writeContract({
            address: tokenAddress,
            abi: RWATokenArtifact.abi,
            functionName: 'mint',
            args: [toAddress, amount],
            nonce,
        });
        logger_1.logger.info(`      Transaction: ${hash}`);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status === 'success') {
            logger_1.logger.info(`      ✅ Tokens minted successfully\n`);
            return true;
        }
        else {
            logger_1.logger.warn(`      ⚠️  Mint transaction failed\n`);
            return false;
        }
    }
    catch (error) {
        logger_1.logger.error(`      ❌ Minting failed: ${error.message}\n`);
        return false;
    }
}
/**
 * Deploy RWA token directly (bypasses factory to avoid mint authorization issues)
 */
async function deployRWAToken(request, valuationInWei) {
    try {
        logger_1.logger.info(`   📝 Deploying RWAToken directly...\n`);
        // Create token name and symbol
        const tokenName = `RWA-${request.assetName}`;
        const tokenSymbol = `RWA${request.assetId}`;
        logger_1.logger.info(`   📋 Token Details:`);
        logger_1.logger.info(`      Name: ${tokenName}`);
        logger_1.logger.info(`      Symbol: ${tokenSymbol}`);
        logger_1.logger.info(`      AssetId: ${request.assetId}`);
        logger_1.logger.info(`      Valuation: ${valuationInWei.toString()}\n`);
        // Convert assetId to BigInt (contract expects uint256)
        // If assetId is numeric, use it directly; otherwise use hash of string
        let assetIdBigInt;
        const assetIdStr = request.assetId.toString();
        if (/^\d+$/.test(assetIdStr)) {
            assetIdBigInt = BigInt(assetIdStr);
        }
        else {
            // Hash the string assetId to create a numeric ID
            // Using a simple hash: sum of character codes
            assetIdBigInt = BigInt(assetIdStr
                .split('')
                .reduce((sum, char) => sum + char.charCodeAt(0), 0));
        }
        // Get the current nonce explicitly to avoid conflicts
        const nonce = await publicClient.getTransactionCount({
            address: ownerAccount.address,
            blockTag: 'pending', // Use pending to include unconfirmed transactions
        });
        logger_1.logger.info(`   🔢 Using nonce: ${nonce}`);
        const hash = await ownerWalletClient.deployContract({
            abi: RWATokenArtifact.abi,
            bytecode: RWATokenArtifact.bytecode,
            args: [
                tokenName,
                tokenSymbol,
                assetIdBigInt,
                valuationInWei,
                ASSET_REGISTRY_ADDRESS,
                ownerAccount.address, // Use OWNER account, not request.owner
            ],
            nonce, // Explicitly set nonce
        });
        logger_1.logger.info(`   ✅ Deployment transaction: ${hash}`);
        logger_1.logger.info(`   ⏳ Waiting for confirmation...\n`);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status === 'success' && receipt.contractAddress) {
            logger_1.logger.info(`   ✅ Deployment confirmed in block ${receipt.blockNumber}`);
            logger_1.logger.info(`   ⛽ Gas used: ${receipt.gasUsed.toString()}\n`);
            return receipt.contractAddress;
        }
        else {
            logger_1.logger.error(`   ❌ Deployment failed`);
            return null;
        }
    }
    catch (error) {
        logger_1.logger.error(`   ❌ Deployment failed: ${error.message}\n`);
        return null;
    }
}
/**
 * Create ERC-20 token for verified asset
 */
async function createTokenForAsset(request) {
    try {
        logger_1.logger.info('\n🎫 ═══════════════════════════════════════════════════════');
        logger_1.logger.info('🎫 CREATING ERC-20 TOKEN FOR VERIFIED ASSET');
        logger_1.logger.info('🎫 ═══════════════════════════════════════════════════════\n');
        logger_1.logger.info(`   🏭 Deploying RWAToken directly (bypassing factory)`);
        logger_1.logger.info(`   🔐 ComplianceModule: ${COMPLIANCE_MODULE_ADDRESS}`);
        logger_1.logger.info(`   💼 Owner Wallet: ${ownerAccount.address}\n`);
        logger_1.logger.info(`   📋 Asset Details:`);
        logger_1.logger.info(`      Asset ID: ${request.assetId}`);
        logger_1.logger.info(`      Asset Name: ${request.assetName}`);
        logger_1.logger.info(`      Valuation: $${Number(request.valuation).toLocaleString()}`);
        logger_1.logger.info(`      Confidence: ${request.confidence}%`);
        logger_1.logger.info(`      Owner: ${request.owner}\n`);
        // Convert valuation to wei (multiply by 1e18)
        const valuationInWei = BigInt(Math.round(request.valuation)) * BigInt(1e18);
        logger_1.logger.info(`   🔢 Conversion:`);
        logger_1.logger.info(`      USD Amount: $${Number(request.valuation)}`);
        logger_1.logger.info(`      Wei Amount: ${valuationInWei}\n`);
        // Step 1: Deploy RWAToken directly
        logger_1.logger.info(`   📡 Step 1: Deploying RWAToken...\n`);
        const tokenAddress = await deployRWAToken(request, valuationInWei);
        if (!tokenAddress) {
            logger_1.logger.error(`   ❌ Failed to deploy token`);
            return null;
        }
        logger_1.logger.info(`   🪙 Token Address: ${tokenAddress}`);
        logger_1.logger.info(`   ✅ ERC-20 token successfully deployed!\n`);
        // Step 2: Mint tokens using owner account
        logger_1.logger.info(`   📝 Step 2: Minting tokens...\n`);
        const mintSuccess = await mintTokens(tokenAddress, request.owner, valuationInWei);
        if (!mintSuccess) {
            logger_1.logger.warn(`   ⚠️  Minting failed, but token is deployed at: ${tokenAddress}\n`);
        }
        logger_1.logger.info('🎫 ═══════════════════════════════════════════════════════');
        logger_1.logger.info('🎫 TOKENIZATION COMPLETE ✅');
        logger_1.logger.info('🎫 ═══════════════════════════════════════════════════════\n');
        return tokenAddress;
    }
    catch (error) {
        logger_1.logger.error(`\n❌ Tokenization failed: ${error.message}`);
        // Log more details for debugging
        if (error.cause) {
            logger_1.logger.error(`   Details: ${error.cause}`);
        }
        if (error.shortMessage) {
            logger_1.logger.error(`   Error: ${error.shortMessage}`);
        }
        logger_1.logger.info('\n🎫 ═══════════════════════════════════════════════════════');
        logger_1.logger.info('🎫 TOKENIZATION FAILED ❌');
        logger_1.logger.info('🎫 ═══════════════════════════════════════════════════════\n');
        return null;
    }
}
/**
 * Set compliance status for token owner
 */
async function setOwnerCompliance(ownerAddress) {
    try {
        logger_1.logger.info('   🔐 Setting KYC compliance status...');
        // Get the current nonce explicitly to avoid conflicts
        const nonce = await publicClient.getTransactionCount({
            address: oracleAccount.address,
            blockTag: 'pending',
        });
        logger_1.logger.info(`      🔢 Using nonce: ${nonce}`);
        const hash = await walletClient.writeContract({
            address: COMPLIANCE_MODULE_ADDRESS,
            abi: ComplianceModuleArtifact.abi,
            functionName: 'setKYCStatus',
            args: [ownerAddress, true, 0], // 0 = unrestricted jurisdiction
            nonce,
        });
        logger_1.logger.info(`      Transaction: ${hash}`);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status === 'success') {
            logger_1.logger.info(`      ✅ Compliance status set\n`);
            return true;
        }
        else {
            logger_1.logger.warn(`      ⚠️  Compliance transaction failed\n`);
            return false;
        }
    }
    catch (error) {
        logger_1.logger.warn(`      ⚠️  Could not set compliance: ${error.message}\n`);
        return false; // Non-critical, continue
    }
}
/**
 * Main tokenization workflow
 * Called after verification is successful and confidence >= 70%
 */
async function tokenizeVerifiedAsset(request) {
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
        logger_1.logger.info(`📊 Tokenization Summary:`);
        logger_1.logger.info(`   ✅ Token Created: ${tokenAddress}`);
        logger_1.logger.info(`   ✅ Asset ID: ${request.assetId}`);
        logger_1.logger.info(`   ✅ Owner: ${request.owner}`);
        logger_1.logger.info(`   ✅ Valuation: $${Number(request.valuation).toLocaleString()}\n`);
        return {
            success: true,
            tokenAddress,
        };
    }
    catch (error) {
        logger_1.logger.error(`Error in tokenization workflow: ${error.message}`);
        return {
            success: false,
            error: error.message,
        };
    }
}
exports.default = { createTokenForAsset, setOwnerCompliance, tokenizeVerifiedAsset };
