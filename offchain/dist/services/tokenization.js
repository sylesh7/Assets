"use strict";
/**
 * Tokenization Service
 * Handles automatic ERC-20 token creation for verified assets
 * Works with RWATokenFactory to create and register tokens
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
const accounts_1 = require("viem/accounts");
const logger_1 = require("../utils/logger");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Define Mantle Sepolia Testnet
const mantleSepolia = (0, viem_1.defineChain)({
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
const RWATokenFactoryArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../onchain/artifacts/contracts/tokens/RWATokenFactory.sol/RWATokenFactory.json'), 'utf-8'));
const ComplianceModuleArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../onchain/artifacts/contracts/compliance/ComplianceModule.sol/ComplianceModule.json'), 'utf-8'));
// Contract addresses - from environment variables or fallback to deployment file
let RWA_TOKEN_FACTORY_ADDRESS = process.env.RWA_TOKEN_FACTORY_ADDRESS;
let COMPLIANCE_MODULE_ADDRESS = process.env.COMPLIANCE_MODULE_ADDRESS;
// Fallback to deployment addresses file if env vars not set
if (!RWA_TOKEN_FACTORY_ADDRESS || !COMPLIANCE_MODULE_ADDRESS) {
    try {
        const deploymentAddresses = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../onchain/deployment-addresses.json'), 'utf-8'));
        RWA_TOKEN_FACTORY_ADDRESS = RWA_TOKEN_FACTORY_ADDRESS || deploymentAddresses.RWATokenFactory;
        COMPLIANCE_MODULE_ADDRESS = COMPLIANCE_MODULE_ADDRESS || deploymentAddresses.ComplianceModule;
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
// Get owner account from environment (contract owner, not oracle)
const OWNER_PRIVATE_KEY = (process.env.OWNER_PRIVATE_KEY?.trim().startsWith('0x')
    ? process.env.OWNER_PRIVATE_KEY.trim()
    : `0x${process.env.OWNER_PRIVATE_KEY?.trim()}`);
const ownerAccount = (0, accounts_1.privateKeyToAccount)(OWNER_PRIVATE_KEY);
// Create clients - using Mantle Sepolia via environment variable or fallback
const RPC_URL = process.env.MANTLE_TESTNET_RPC_URL || 'https://rpc.sepolia.mantle.xyz';
const walletClient = (0, viem_1.createWalletClient)({
    account: ownerAccount,
    chain: mantleSepolia,
    transport: (0, viem_1.http)(RPC_URL),
});
const publicClient = (0, viem_1.createPublicClient)({
    chain: mantleSepolia,
    transport: (0, viem_1.http)(RPC_URL),
});
/**
 * Create ERC-20 token for verified asset
 */
async function createTokenForAsset(request) {
    try {
        logger_1.logger.info('\n🎫 ═══════════════════════════════════════════════════════');
        logger_1.logger.info('🎫 CREATING ERC-20 TOKEN FOR VERIFIED ASSET');
        logger_1.logger.info('🎫 ═══════════════════════════════════════════════════════\n');
        logger_1.logger.info(`   🏭 RWATokenFactory: ${RWA_TOKEN_FACTORY_ADDRESS}`);
        logger_1.logger.info(`   🔐 ComplianceModule: ${COMPLIANCE_MODULE_ADDRESS}`);
        logger_1.logger.info(`   💼 Wallet: ${ownerAccount.address}\n`);
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
        // Call createToken function
        logger_1.logger.info(`   📡 Calling RWATokenFactory.createToken()...\n`);
        const hash = await walletClient.writeContract({
            address: RWA_TOKEN_FACTORY_ADDRESS,
            abi: RWATokenFactoryArtifact.abi,
            functionName: 'createToken',
            args: [
                request.assetId,
                valuationInWei,
                request.owner,
                request.assetName,
            ],
        });
        logger_1.logger.info(`   ✅ Transaction submitted: ${hash}`);
        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status === 'success') {
            logger_1.logger.info(`   ✅ Transaction confirmed in block ${receipt.blockNumber}\n`);
            // Extract token address from logs
            let tokenAddress = null;
            for (const log of receipt.logs) {
                if (log.address.toLowerCase() === RWA_TOKEN_FACTORY_ADDRESS.toLowerCase()) {
                    // TokenCreated event topics: [event sig, assetId, tokenAddress, owner]
                    if (log.topics[0] === '0x224ef611f8efb91cc42a5abd59a28765ecf1c3bcb73d05f16616957dfc7199f3') {
                        // token address is the second indexed param (topics[2])
                        const topic = log.topics[2];
                        if (topic) {
                            tokenAddress = '0x' + topic.slice(-40);
                            break;
                        }
                    }
                }
            }
            if (tokenAddress) {
                logger_1.logger.info(`   🪙 Token Address: ${tokenAddress}`);
                logger_1.logger.info(`   ✅ ERC-20 token successfully created!\n`);
                logger_1.logger.info('🎫 ═══════════════════════════════════════════════════════');
                logger_1.logger.info('🎫 TOKENIZATION COMPLETE ✅');
                logger_1.logger.info('🎫 ═══════════════════════════════════════════════════════\n');
                return tokenAddress;
            }
            else {
                logger_1.logger.warn(`   ⚠️  Token address not found in logs`);
                logger_1.logger.info(`   📍 Transaction hash: ${hash}`);
                logger_1.logger.info(`   💡 Check blockchain explorer to verify token creation\n`);
                return hash; // Return tx hash as fallback
            }
        }
        else {
            logger_1.logger.error(`   ❌ Transaction failed: ${receipt.status}`);
            logger_1.logger.error(`   📍 Transaction hash: ${hash}\n`);
            return null;
        }
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
        const hash = await walletClient.writeContract({
            address: COMPLIANCE_MODULE_ADDRESS,
            abi: ComplianceModuleArtifact.abi,
            functionName: 'setKYCStatus',
            args: [ownerAddress, true, 0], // 0 = unrestricted jurisdiction
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
