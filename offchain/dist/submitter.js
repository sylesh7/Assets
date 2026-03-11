"use strict";
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
exports.submitRejection = submitRejection;
exports.submitVerification = submitVerification;
exports.submitToConsensusEngine = submitToConsensusEngine;
exports.submitTokenization = submitTokenization;
/**
 * Blockchain Submitter
 * Submits verification results back to smart contract
 */
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const chains_1 = require("viem/chains");
const logger_1 = require("./utils/logger");
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
const ORACLE_ROUTER_ADDRESS = process.env.ORACLE_ROUTER_ADDRESS;
const ORACLE_PRIVATE_KEY = (process.env.ORACLE_PRIVATE_KEY?.trim().startsWith('0x')
    ? process.env.ORACLE_PRIVATE_KEY.trim()
    : `0x${process.env.ORACLE_PRIVATE_KEY?.trim()}`);
const IS_TESTNET = process.env.NODE_ENV !== 'production';
const RPC_URL = IS_TESTNET ? process.env.MANTLE_TESTNET_RPC_URL : process.env.MANTLE_RPC_URL;
const PINATA_JWT = process.env.PINATA_JWT;
// Evidence mapping file path
const EVIDENCE_MAP_PATH = path_1.default.join(__dirname, '..', 'evidence-map.json');
/**
 * Store evidence hash mapping for frontend access
 */
function storeEvidenceMapping(requestId, evidenceHash) {
    try {
        let mapping = {};
        // Read existing mapping if it exists
        if (fs_1.default.existsSync(EVIDENCE_MAP_PATH)) {
            const data = fs_1.default.readFileSync(EVIDENCE_MAP_PATH, 'utf-8');
            mapping = JSON.parse(data);
        }
        // Add new mapping
        mapping[requestId] = evidenceHash;
        // Write back to file
        fs_1.default.writeFileSync(EVIDENCE_MAP_PATH, JSON.stringify(mapping, null, 2));
        logger_1.logger.info(`📝 Evidence mapping stored: Request ${requestId} -> ${evidenceHash}`);
    }
    catch (error) {
        logger_1.logger.error('Failed to store evidence mapping:', error);
    }
}
/**
 * Get friendly model name for agent
 */
function getAgentModelName(agentName) {
    const modelMap = {
        'Groq': 'Llama 3.3 70B Versatile',
        'OpenRouter': 'GPT-4o-mini',
        'Gemini': 'Meta Llama 3.1 8B Instruct'
    };
    return modelMap[agentName] || agentName;
}
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
// Create wallet client
const account = (0, accounts_1.privateKeyToAccount)(ORACLE_PRIVATE_KEY);
const walletClient = (0, viem_1.createWalletClient)({
    account,
    chain: IS_TESTNET ? mantleSepolia : chains_1.mantle,
    transport: (0, viem_1.http)(RPC_URL)
});
// Create public client for reading chain data
const publicClient = (0, viem_1.createPublicClient)({
    chain: IS_TESTNET ? mantleSepolia : chains_1.mantle,
    transport: (0, viem_1.http)(RPC_URL)
});
// Contract ABI - OracleRouter.sol
const ORACLE_ROUTER_ABI = [
    {
        inputs: [
            { name: '_requestId', type: 'uint256' },
            { name: '_valuation', type: 'uint256' },
            { name: '_confidence', type: 'uint256' }
        ],
        name: 'submitVerification',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
    }
];
// ConsensusEngine ABI
const CONSENSUS_ENGINE_ABI = [
    {
        inputs: [
            { name: '_requestId', type: 'uint256' },
            { name: '_valuation', type: 'uint256' },
            { name: '_confidence', type: 'uint256' },
            { name: '_evidenceHash', type: 'bytes32' }
        ],
        name: 'submitOracleResponse',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
    }
];
const CONSENSUS_ENGINE_ADDRESS = process.env.CONSENSUS_ENGINE_ADDRESS || '0x0000000000000000000000000000000000000000';
/**
 * Submit rejection to blockchain
 * Uses submitVerification with 0 valuation and 1% confidence to indicate rejection
 */
async function submitRejection(requestId, reason) {
    try {
        logger_1.logger.info('🚫 Submitting rejection to blockchain...');
        logger_1.logger.info(`   Reason: ${reason}`);
        logger_1.logger.info(`   Method: submitVerification with $0 valuation and 1% confidence (rejection)`);
        // Submit as verification with 0 valuation and 1% confidence (indicates rejection)
        // Contract requires confidence > 0, so we use 1 (minimum) to indicate rejection
        const hash = await walletClient.writeContract({
            address: ORACLE_ROUTER_ADDRESS,
            abi: ORACLE_ROUTER_ABI,
            functionName: 'submitVerification',
            args: [
                BigInt(requestId),
                BigInt(0), // 0 valuation = rejection
                BigInt(1) // 1% confidence = rejection (minimum allowed by contract)
            ]
        });
        logger_1.logger.info(`✅ Rejection transaction sent: ${hash}`);
        logger_1.logger.info(`   The request will show as VERIFIED with $0 value and 1% confidence (rejected)`);
        return hash;
    }
    catch (error) {
        logger_1.logger.error('❌ Failed to submit rejection:', error);
        throw error;
    }
}
/**
 * Submit verification result to blockchain
 * Returns both transaction hash and IPFS evidence hash
 */
async function submitVerification(requestId, valuation, confidence, satelliteData, agentResponses, nodeResponses // Individual agent scores with names
) {
    try {
        // Upload evidence to IPFS
        logger_1.logger.info('📦 Uploading evidence to IPFS...');
        // Create detailed analysis breakdown with individual agent scores
        const analysisBreakdown = {
            requestId,
            finalValuation: valuation,
            finalConfidence: confidence,
            timestamp: new Date().toISOString(),
            satelliteData,
            agentAnalysis: {
                agents: nodeResponses || agentResponses.map(r => ({
                    name: r.agent,
                    model: getAgentModelName(r.agent),
                    valuation: r.valuation,
                    confidence: r.confidence,
                    reasoning: r.reasoning,
                    risk_factors: r.risk_factors || []
                })),
                consensusMethod: 'weighted_average',
                fullResponses: agentResponses
            }
        };
        const evidenceHash = await uploadEvidence(analysisBreakdown);
        logger_1.logger.info(`✅ Evidence uploaded: ${evidenceHash}`);
        // Store mapping for frontend access
        const cleanHash = evidenceHash.replace('ipfs://', '');
        storeEvidenceMapping(requestId, cleanHash);
        // Submit to blockchain
        logger_1.logger.info('📤 Submitting transaction to Mantle Sepolia...');
        const hash = await walletClient.writeContract({
            address: ORACLE_ROUTER_ADDRESS,
            abi: ORACLE_ROUTER_ABI,
            functionName: 'submitVerification',
            args: [
                BigInt(requestId),
                BigInt(valuation),
                BigInt(confidence)
            ]
            // Let viem estimate gas automatically
        });
        logger_1.logger.info(`⏳ Waiting for confirmation...`);
        // In production, you'd wait for the transaction receipt here
        // For now, just return both hashes
        return { txHash: hash, evidenceHash: cleanHash };
    }
    catch (error) {
        logger_1.logger.error('❌ Failed to submit verification:', error);
        throw error;
    }
}
/**
 * Upload evidence package to IPFS via Pinata
 */
async function uploadEvidence(evidence) {
    if (!PINATA_JWT) {
        throw new Error('PINATA_JWT not configured. Cannot upload evidence to IPFS.');
    }
    try {
        const response = await axios_1.default.post('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
            pinataContent: evidence,
            pinataMetadata: {
                name: `Evidence_${evidence.requestId.slice(2, 12)}.json`
            }
        }, {
            headers: {
                'Authorization': `Bearer ${PINATA_JWT}`,
                'Content-Type': 'application/json'
            }
        });
        return response.data.IpfsHash;
    }
    catch (error) {
        logger_1.logger.error('❌ IPFS upload failed:', error);
        throw new Error(`IPFS upload failed: ${error}`);
    }
}
/**
 * Submit to ConsensusEngine.sol when confidence >= 70%
 */
async function submitToConsensusEngine(requestId, valuation, confidence, evidenceHash) {
    try {
        if (!CONSENSUS_ENGINE_ADDRESS || CONSENSUS_ENGINE_ADDRESS === '0x0000000000000000000000000000000000000000') {
            logger_1.logger.warn('⚠️  ConsensusEngine address not configured, skipping consensus submission');
            return '';
        }
        // Convert IPFS hash (CID) to bytes32
        // IPFS v0 CIDs start with "Qm" and are base58 encoded
        // For Solidity bytes32, we'll use the keccak256 hash of the full IPFS hash
        // This is a common pattern for storing IPFS references on-chain
        let evidenceBytes32;
        if (evidenceHash.startsWith('Qm')) {
            // Remove "Qm" prefix and hash the remaining string
            // Alternatively, we can just hash the full CID
            const encoder = new TextEncoder();
            const data = encoder.encode(evidenceHash);
            // Simple approach: Take first 32 bytes of the hash string as hex
            // More robust: Use keccak256 hash of the CID
            const hashBuffer = Buffer.from(evidenceHash);
            const hex = hashBuffer.toString('hex').slice(0, 64).padEnd(64, '0');
            evidenceBytes32 = `0x${hex}`;
        }
        else {
            // Already in hex format or other format
            evidenceBytes32 = `0x${evidenceHash.replace('0x', '').slice(0, 64).padEnd(64, '0')}`;
        }
        logger_1.logger.info('📊 Submitting to ConsensusEngine.sol...');
        logger_1.logger.info(`   Contract: ${CONSENSUS_ENGINE_ADDRESS}`);
        logger_1.logger.info(`   IPFS Evidence: ${evidenceHash}`);
        logger_1.logger.info(`   Bytes32: ${evidenceBytes32}`);
        logger_1.logger.info(`   Confidence: ${confidence}% (meets 70% threshold)`);
        // Get current gas prices from the network
        const feeData = await publicClient.estimateFeesPerGas();
        // Add 50% buffer to ensure transaction goes through even with pending transactions
        const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas
            ? (feeData.maxPriorityFeePerGas * 150n) / 100n
            : undefined;
        const maxFeePerGas = feeData.maxFeePerGas
            ? (feeData.maxFeePerGas * 150n) / 100n
            : undefined;
        logger_1.logger.info(`   Gas: maxFee=${maxFeePerGas ? (Number(maxFeePerGas) / 1e9).toFixed(4) : 'auto'} gwei, maxPriorityFee=${maxPriorityFeePerGas ? (Number(maxPriorityFeePerGas) / 1e9).toFixed(4) : 'auto'} gwei (50% buffer)`);
        const hash = await walletClient.writeContract({
            address: CONSENSUS_ENGINE_ADDRESS,
            abi: CONSENSUS_ENGINE_ABI,
            functionName: 'submitOracleResponse',
            args: [
                BigInt(requestId),
                BigInt(valuation),
                BigInt(confidence),
                evidenceBytes32
            ],
            maxFeePerGas,
            maxPriorityFeePerGas
        });
        logger_1.logger.info(`✅ ConsensusEngine submission successful: ${hash}`);
        logger_1.logger.info(`   Request will reach consensus when 2/3 oracles agree`);
        return hash;
    }
    catch (error) {
        // Don't fail the entire process if consensus submission fails
        logger_1.logger.warn(`⚠️  ConsensusEngine submission failed: ${error.message}`);
        logger_1.logger.warn(`   Continuing with standard OracleRouter submission...`);
        return '';
    }
}
/**
 * Submit tokenization request after verification consensus
 * This is called when confidence >= 70% to create ERC-20 tokens
 */
async function submitTokenization(requestId, assetId, valuation, owner, assetName, confidence) {
    try {
        logger_1.logger.info('\n🎫 ═══════════════════════════════════════════════════════');
        logger_1.logger.info('🎫 SUBMITTING TOKENIZATION REQUEST');
        logger_1.logger.info('🎫 ═══════════════════════════════════════════════════════\n');
        logger_1.logger.info(`   📋 Request Details:`);
        logger_1.logger.info(`      Request ID: ${requestId}`);
        logger_1.logger.info(`      Asset ID: ${assetId}`);
        logger_1.logger.info(`      Valuation: $${Number(valuation).toLocaleString()}`);
        logger_1.logger.info(`      Confidence: ${confidence}%`);
        logger_1.logger.info(`      Owner: ${owner}`);
        logger_1.logger.info(`      Asset Name: ${assetName}\n`);
        // Dynamically import tokenization service to avoid circular dependencies
        const { tokenizeVerifiedAsset } = await Promise.resolve().then(() => __importStar(require('./services/tokenization')));
        const result = await tokenizeVerifiedAsset({
            requestId,
            assetId,
            assetName,
            valuation,
            confidence,
            owner,
        });
        if (result.success) {
            logger_1.logger.info(`✅ Tokenization completed successfully`);
            logger_1.logger.info(`   Token Address: ${result.tokenAddress}\n`);
            return {
                success: true,
                tokenAddress: result.tokenAddress,
            };
        }
        else {
            logger_1.logger.error(`❌ Tokenization failed: ${result.error}`);
            logger_1.logger.info('\n🎫 ═══════════════════════════════════════════════════════');
            logger_1.logger.info('🎫 TOKENIZATION FAILED ❌');
            logger_1.logger.info('🎫 ═══════════════════════════════════════════════════════\n');
            return {
                success: false,
                error: result.error,
            };
        }
    }
    catch (error) {
        logger_1.logger.error(`❌ Error submitting tokenization: ${error.message}`);
        return {
            success: false,
            error: error.message,
        };
    }
}
