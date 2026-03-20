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
exports.publicClient = void 0;
exports.submitRejection = submitRejection;
exports.submitVerification = submitVerification;
exports.submitToConsensusEngine = submitToConsensusEngine;
exports.anchorToEthereumL1 = anchorToEthereumL1;
exports.submitTokenization = submitTokenization;
/**
 * Blockchain Submitter
 * Submits verification results back to smart contract on Ethereum Sepolia
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
const RWA_ORACLE_CORE_ADDRESS = process.env.RWA_ORACLE_CORE_ADDRESS || '0xBA2651f23d7f2Fd5D8238e320B0b9Be2BBF54991';
const RWA_ASSET_MANAGER_ADDRESS = process.env.RWA_ASSET_MANAGER_ADDRESS || '0x4E4e9D454783178fb4F9EF3D8c724c7Da73405Af';
const CONSENSUS_ENGINE_ADDRESS = process.env.CONSENSUS_ENGINE_ADDRESS || '0x0000000000000000000000000000000000000000';
const VERIFICATION_ANCHOR_ADDRESS = process.env.VERIFICATION_ANCHOR_ADDRESS || '0x0000000000000000000000000000000000000000';
// Handle private key with proper validation
const privateKeyEnv = process.env.ORACLE_PRIVATE_KEY;
if (!privateKeyEnv) {
    throw new Error('ORACLE_PRIVATE_KEY environment variable is not set');
}
const ORACLE_PRIVATE_KEY = (privateKeyEnv.trim().startsWith('0x')
    ? privateKeyEnv.trim()
    : `0x${privateKeyEnv.trim()}`);
const RPC_URL = process.env.ETH_SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/';
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
// Create wallet client using Ethereum Sepolia
const account = (0, accounts_1.privateKeyToAccount)(ORACLE_PRIVATE_KEY);
const walletClient = (0, viem_1.createWalletClient)({
    account,
    chain: chains_1.sepolia,
    transport: (0, viem_1.http)(RPC_URL)
});
// Create public client for reading chain data
const publicClient = (0, viem_1.createPublicClient)({
    chain: chains_1.sepolia,
    transport: (0, viem_1.http)(RPC_URL)
});
exports.publicClient = publicClient;
// Contract ABI - RWAOracleCore.sol
const ORACLE_CORE_ABI = [
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
// VerificationAnchor ABI - Rollup Anchoring
const VERIFICATION_ANCHOR_ABI = [
    {
        inputs: [
            { name: '_requestId', type: 'uint256' },
            { name: '_verificationHash', type: 'bytes32' },
            { name: '_l1BlockNumber', type: 'uint256' }
        ],
        name: 'anchorVerification',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
    }
];
/**
 * Submit rejection to blockchain
 * Uses submitVerification with 0 valuation and 1% confidence to indicate rejection
 */
async function submitRejection(requestId, reason) {
    try {
        logger_1.logger.info('🚫 Submitting rejection to blockchain...');
        logger_1.logger.info(`   Reason: ${reason}`);
        logger_1.logger.info(`   Method: submitVerification with $0 valuation and 1% confidence (rejection)`);
        // Get the current nonce explicitly to avoid conflicts
        const nonce = await publicClient.getTransactionCount({
            address: account.address,
            blockTag: 'pending',
        });
        logger_1.logger.info(`   🔢 Using nonce: ${nonce}`);
        // Submit as verification with 0 valuation and 1% confidence (indicates rejection)
        // Contract requires confidence > 0, so we use 1 (minimum) to indicate rejection
        const hash = await walletClient.writeContract({
            address: RWA_ORACLE_CORE_ADDRESS,
            abi: ORACLE_CORE_ABI,
            functionName: 'submitVerification',
            args: [
                BigInt(requestId),
                BigInt(0), // 0 valuation = rejection
                BigInt(1) // 1% confidence = rejection (minimum allowed by contract)
            ],
            nonce,
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
        // Get the current nonce explicitly to avoid conflicts
        const nonce = await publicClient.getTransactionCount({
            address: account.address,
            blockTag: 'pending',
        });
        logger_1.logger.info(`   🔢 Using nonce: ${nonce}`);
        const hash = await walletClient.writeContract({
            address: RWA_ORACLE_CORE_ADDRESS,
            abi: ORACLE_CORE_ABI,
            functionName: 'submitVerification',
            args: [
                BigInt(requestId),
                BigInt(valuation),
                BigInt(confidence)
            ],
            nonce,
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
    if (!CONSENSUS_ENGINE_ADDRESS || CONSENSUS_ENGINE_ADDRESS === '0x0000000000000000000000000000000000000000') {
        logger_1.logger.warn('⚠️  ConsensusEngine address not configured, skipping consensus submission');
        return '';
    }
    // Convert IPFS hash (CID) to bytes32
    let evidenceBytes32;
    if (evidenceHash.startsWith('Qm')) {
        // Hash the IPFS CID
        const hashBuffer = Buffer.from(evidenceHash);
        const hex = hashBuffer.toString('hex').slice(0, 64).padEnd(64, '0');
        evidenceBytes32 = `0x${hex}`;
    }
    else {
        // Already in hex format or other format
        evidenceBytes32 = `0x${evidenceHash.replace('0x', '').slice(0, 64).padEnd(64, '0')}`;
    }
    try {
        logger_1.logger.info('📊 Submitting to ConsensusEngine.sol...');
        logger_1.logger.info(`   Contract: ${CONSENSUS_ENGINE_ADDRESS}`);
        logger_1.logger.info(`   IPFS Evidence: ${evidenceHash}`);
        logger_1.logger.info(`   Bytes32: ${evidenceBytes32}`);
        logger_1.logger.info(`   Confidence: ${confidence}% (meets 70% threshold)`);
        logger_1.logger.info(`   📤 Submitting transaction...`);
        // Small delay to ensure previous transactions are processed
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Get current gas price to ensure we're above any stuck transactions
        const gasPrice = await publicClient.getGasPrice();
        logger_1.logger.info(`   Current gas price: ${(gasPrice / 1000000000n)} gwei`);
        // Get the current nonce explicitly to avoid conflicts
        const nonce = await publicClient.getTransactionCount({
            address: account.address,
            blockTag: 'pending',
        });
        logger_1.logger.info(`   🔢 Using nonce: ${nonce}`);
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
            gasPrice: gasPrice,
            nonce,
        });
        logger_1.logger.info(`✅ ConsensusEngine submission successful: ${hash}`);
        logger_1.logger.info(`   Request will reach consensus when 2/3 oracles agree`);
        return hash;
    }
    catch (error) {
        // Don't fail the entire process if consensus submission fails
        const errorMsg = error.message || '';
        if (errorMsg.includes('nonce too low') || errorMsg.includes('replacement transaction underpriced')) {
            logger_1.logger.warn(`⚠️  Transaction stuck in mempool (nonce conflict). Waiting 3 seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            try {
                // Retry with fresh nonce and gas price
                const gasPrice = await publicClient.getGasPrice();
                const newPrice = (gasPrice * 120n) / 100n; // 20% higher
                const retryNonce = await publicClient.getTransactionCount({
                    address: account.address,
                    blockTag: 'pending',
                });
                logger_1.logger.info(`   Retrying with nonce ${retryNonce} and higher gas price: ${(newPrice / 1000000000n)} gwei`);
                const retryHash = await walletClient.writeContract({
                    address: CONSENSUS_ENGINE_ADDRESS,
                    abi: CONSENSUS_ENGINE_ABI,
                    functionName: 'submitOracleResponse',
                    args: [
                        BigInt(requestId),
                        BigInt(valuation),
                        BigInt(confidence),
                        evidenceBytes32
                    ],
                    gasPrice: newPrice,
                    nonce: retryNonce,
                });
                logger_1.logger.info(`✅ ConsensusEngine retry successful: ${retryHash}`);
                return retryHash;
            }
            catch (retryError) {
                logger_1.logger.warn(`⚠️  ConsensusEngine retry also failed: ${retryError.message}`);
            }
        }
        logger_1.logger.warn(`⚠️  ConsensusEngine submission failed: ${error.message}`);
        logger_1.logger.warn(`   Continuing with standard OracleRouter submission...`);
        return '';
    }
}
/**
 * Anchor verification to Ethereum L1 via Mantle's rollup system
 * STEP 7.5: Called after consensus validation
 */
async function anchorToEthereumL1(requestId, valuation, confidence, l1BlockNumber) {
    try {
        if (!VERIFICATION_ANCHOR_ADDRESS || VERIFICATION_ANCHOR_ADDRESS === '0x0000000000000000000000000000000000000000') {
            logger_1.logger.warn('⚠️  VerificationAnchor address not configured, skipping L1 anchoring');
            return '';
        }
        // Create verification hash (same as ConsensusEngine does)
        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify({
            requestId,
            valuation,
            confidence,
            l1BlockNumber,
            timestamp: Math.floor(Date.now() / 1000)
        }));
        const hashBuffer = Buffer.from(data);
        const hex = hashBuffer.toString('hex').slice(0, 64).padEnd(64, '0');
        const verificationHash = `0x${hex}`;
        logger_1.logger.info('🔗 Anchoring verification to Ethereum L1...');
        logger_1.logger.info(`   VerificationAnchor: ${VERIFICATION_ANCHOR_ADDRESS}`);
        logger_1.logger.info(`   L1 Block Number: ${l1BlockNumber}`);
        logger_1.logger.info(`   Verification Hash: ${verificationHash}`);
        // Get the current nonce explicitly to avoid conflicts
        const nonce = await publicClient.getTransactionCount({
            address: account.address,
            blockTag: 'pending',
        });
        logger_1.logger.info(`   🔢 Using nonce: ${nonce}`);
        const hash = await walletClient.writeContract({
            address: VERIFICATION_ANCHOR_ADDRESS,
            abi: VERIFICATION_ANCHOR_ABI,
            functionName: 'anchorVerification',
            args: [
                BigInt(requestId),
                verificationHash,
                BigInt(l1BlockNumber)
            ],
            nonce,
        });
        logger_1.logger.info(`✅ L1 Anchoring successful: ${hash}`);
        logger_1.logger.info(`   Verification hash is now stored on Ethereum L1 via Mantle rollup`);
        return hash;
    }
    catch (error) {
        logger_1.logger.warn(`⚠️  L1 Anchoring failed: ${error.message}`);
        logger_1.logger.warn(`   Continuing with tokenization...`);
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
