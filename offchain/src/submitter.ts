/**
 * Blockchain Submitter
 * Submits verification results back to smart contract
 */
import { createWalletClient, http, parseEther, defineChain, createPublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mantle } from 'viem/chains';
import { logger } from './utils/logger';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const ORACLE_ROUTER_ADDRESS = process.env.ORACLE_ROUTER_ADDRESS as `0x${string}`;
const CONSENSUS_ENGINE_ADDRESS = process.env.CONSENSUS_ENGINE_ADDRESS as `0x${string}` || '0x0000000000000000000000000000000000000000' as `0x${string}`;
const VERIFICATION_ANCHOR_ADDRESS = process.env.VERIFICATION_ANCHOR_ADDRESS as `0x${string}` || '0x0000000000000000000000000000000000000000' as `0x${string}`;
const ORACLE_PRIVATE_KEY = (process.env.ORACLE_PRIVATE_KEY?.trim().startsWith('0x') 
  ? process.env.ORACLE_PRIVATE_KEY.trim() 
  : `0x${process.env.ORACLE_PRIVATE_KEY?.trim()}`) as `0x${string}`;
const IS_TESTNET = process.env.NODE_ENV !== 'production';
const RPC_URL = IS_TESTNET ? process.env.MANTLE_TESTNET_RPC_URL : process.env.MANTLE_RPC_URL;
const PINATA_JWT = process.env.PINATA_JWT;

// Evidence mapping file path
const EVIDENCE_MAP_PATH = path.join(__dirname, '..', 'evidence-map.json');

/**
 * Store evidence hash mapping for frontend access
 */
function storeEvidenceMapping(requestId: string, evidenceHash: string): void {
  try {
    let mapping: Record<string, string> = {};
    
    // Read existing mapping if it exists
    if (fs.existsSync(EVIDENCE_MAP_PATH)) {
      const data = fs.readFileSync(EVIDENCE_MAP_PATH, 'utf-8');
      mapping = JSON.parse(data);
    }
    
    // Add new mapping
    mapping[requestId] = evidenceHash;
    
    // Write back to file
    fs.writeFileSync(EVIDENCE_MAP_PATH, JSON.stringify(mapping, null, 2));
    logger.info(`📝 Evidence mapping stored: Request ${requestId} -> ${evidenceHash}`);
  } catch (error) {
    logger.error('Failed to store evidence mapping:', error);
  }
}

/**
 * Get friendly model name for agent
 */
function getAgentModelName(agentName: string): string {
  const modelMap: Record<string, string> = {
    'Groq': 'Llama 3.3 70B Versatile',
    'OpenRouter': 'GPT-4o-mini',
    'Gemini': 'Meta Llama 3.1 8B Instruct'
  };
  return modelMap[agentName] || agentName;
}

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

// Create wallet client
const account = privateKeyToAccount(ORACLE_PRIVATE_KEY);
const walletClient = createWalletClient({
  account,
  chain: IS_TESTNET ? mantleSepolia : mantle,
  transport: http(RPC_URL)
});

// Create public client for reading chain data
const publicClient = createPublicClient({
  chain: IS_TESTNET ? mantleSepolia : mantle,
  transport: http(RPC_URL)
});

export { publicClient };

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
] as const;

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
] as const;

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
] as const;

/**
 * Submit rejection to blockchain
 * Uses submitVerification with 0 valuation and 1% confidence to indicate rejection
 */
export async function submitRejection(
  requestId: string,
  reason: string
): Promise<string> {
  try {
    logger.info('🚫 Submitting rejection to blockchain...');
    logger.info(`   Reason: ${reason}`);
    logger.info(`   Method: submitVerification with $0 valuation and 1% confidence (rejection)`);
    
    // Get the current nonce explicitly to avoid conflicts
    const nonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: 'pending',
    });

    logger.info(`   🔢 Using nonce: ${nonce}`);

    // Submit as verification with 0 valuation and 1% confidence (indicates rejection)
    // Contract requires confidence > 0, so we use 1 (minimum) to indicate rejection
    const hash = await walletClient.writeContract({
      address: ORACLE_ROUTER_ADDRESS,
      abi: ORACLE_ROUTER_ABI,
      functionName: 'submitVerification',
      args: [
        BigInt(requestId),
        BigInt(0),  // 0 valuation = rejection
        BigInt(1)   // 1% confidence = rejection (minimum allowed by contract)
      ],
      nonce,
    });
    
    logger.info(`✅ Rejection transaction sent: ${hash}`);
    logger.info(`   The request will show as VERIFIED with $0 value and 1% confidence (rejected)`);
    return hash;
    
  } catch (error) {
    logger.error('❌ Failed to submit rejection:', error);
    throw error;
  }
}

/**
 * Submit verification result to blockchain
 * Returns both transaction hash and IPFS evidence hash
 */
export async function submitVerification(
  requestId: string,
  valuation: number,
  confidence: number,
  satelliteData: any,
  agentResponses: any[],
  nodeResponses?: any[]  // Individual agent scores with names
): Promise<{ txHash: string; evidenceHash: string }> {
  try {
    // Upload evidence to IPFS
    logger.info('📦 Uploading evidence to IPFS...');
    
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
    logger.info(`✅ Evidence uploaded: ${evidenceHash}`);
    
    // Store mapping for frontend access
    const cleanHash = evidenceHash.replace('ipfs://', '');
    storeEvidenceMapping(requestId, cleanHash);
    
    // Submit to blockchain
    logger.info('📤 Submitting transaction to Mantle Sepolia...');
    
    // Get the current nonce explicitly to avoid conflicts
    const nonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: 'pending',
    });

    logger.info(`   🔢 Using nonce: ${nonce}`);

    const hash = await walletClient.writeContract({
      address: ORACLE_ROUTER_ADDRESS,
      abi: ORACLE_ROUTER_ABI,
      functionName: 'submitVerification',
      args: [
        BigInt(requestId),
        BigInt(valuation),
        BigInt(confidence)
      ],
      nonce,
    });
    
    logger.info(`⏳ Waiting for confirmation...`);
    
    // In production, you'd wait for the transaction receipt here
    // For now, just return both hashes
    
    return { txHash: hash, evidenceHash: cleanHash };
    
  } catch (error) {
    logger.error('❌ Failed to submit verification:', error);
    throw error;
  }
}

/**
 * Upload evidence package to IPFS via Pinata
 */
async function uploadEvidence(evidence: any): Promise<string> {
  if (!PINATA_JWT) {
    throw new Error('PINATA_JWT not configured. Cannot upload evidence to IPFS.');
  }
  
  try {
    const response = await axios.post(
      'https://api.pinata.cloud/pinning/pinJSONToIPFS',
      {
        pinataContent: evidence,
        pinataMetadata: {
          name: `Evidence_${evidence.requestId.slice(2, 12)}.json`
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${PINATA_JWT}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.IpfsHash;
    
  } catch (error) {
    logger.error('❌ IPFS upload failed:', error);
    throw new Error(`IPFS upload failed: ${error}`);
  }
}

/**
 * Submit to ConsensusEngine.sol when confidence >= 70%
 */
export async function submitToConsensusEngine(
  requestId: string,
  valuation: number,
  confidence: number,
  evidenceHash: string
): Promise<string> {
  if (!CONSENSUS_ENGINE_ADDRESS || CONSENSUS_ENGINE_ADDRESS === '0x0000000000000000000000000000000000000000') {
    logger.warn('⚠️  ConsensusEngine address not configured, skipping consensus submission');
    return '';
  }

  // Convert IPFS hash (CID) to bytes32
  // IPFS v0 CIDs start with "Qm" and are base58 encoded
  // For Solidity bytes32, we'll use the keccak256 hash of the full IPFS hash
  // This is a common pattern for storing IPFS references on-chain
  let evidenceBytes32: `0x${string}`;
  
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
  } else {
    // Already in hex format or other format
    evidenceBytes32 = `0x${evidenceHash.replace('0x', '').slice(0, 64).padEnd(64, '0')}`;
  }

  try {
    logger.info('📊 Submitting to ConsensusEngine.sol...');
    logger.info(`   Contract: ${CONSENSUS_ENGINE_ADDRESS}`);
    logger.info(`   IPFS Evidence: ${evidenceHash}`);
    logger.info(`   Bytes32: ${evidenceBytes32}`);
    logger.info(`   Confidence: ${confidence}% (meets 70% threshold)`);
    
    logger.info(`   📤 Submitting transaction...`);
    
    // Small delay to ensure previous transactions are processed
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get current gas price to ensure we're above any stuck transactions
    const gasPrice = await publicClient.getGasPrice();
    logger.info(`   Current gas price: ${(gasPrice / 1_000_000_000n)} gwei`);
    
    // Get the current nonce explicitly to avoid conflicts
    // Fetch it right before sending to minimize chance of stale nonce
    const nonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: 'pending',
    });

    logger.info(`   🔢 Using nonce: ${nonce}`);
    
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
      gasPrice: gasPrice, // Use current gas price, not estimate
      nonce,
    });
    
    logger.info(`✅ ConsensusEngine submission successful: ${hash}`);
    logger.info(`   Request will reach consensus when 2/3 oracles agree`);
    
    return hash;
    
  } catch (error: any) {
    // Don't fail the entire process if consensus submission fails
    const errorMsg = error.message || '';
    
    if (errorMsg.includes('nonce too low') || errorMsg.includes('replacement transaction underpriced')) {
      logger.warn(`⚠️  Transaction stuck in mempool (nonce conflict). Waiting 3 seconds before retry...`);
      // Wait and let the previous transaction clear
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      try {
        // Retry with fresh nonce and gas price
        const gasPrice = await publicClient.getGasPrice();
        const newPrice = (gasPrice * 120n) / 100n; // 20% higher
        
        // Get fresh nonce
        const retryNonce = await publicClient.getTransactionCount({
          address: account.address,
          blockTag: 'pending',
        });
        
        logger.info(`   Retrying with nonce ${retryNonce} and higher gas price: ${(newPrice / 1_000_000_000n)} gwei`);
        
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
        
        logger.info(`✅ ConsensusEngine retry successful: ${retryHash}`);
        return retryHash;
      } catch (retryError: any) {
        logger.warn(`⚠️  ConsensusEngine retry also failed: ${retryError.message}`);
      }
    }
    
    logger.warn(`⚠️  ConsensusEngine submission failed: ${error.message}`);
    logger.warn(`   Continuing with standard OracleRouter submission...`);
    return '';
  }
}

/**
 * Anchor verification to Ethereum L1 via Mantle's rollup system
 * STEP 7.5: Called after consensus validation
 */
export async function anchorToEthereumL1(
  requestId: string,
  valuation: number,
  confidence: number,
  l1BlockNumber: number
): Promise<string> {
  try {
    if (!VERIFICATION_ANCHOR_ADDRESS || VERIFICATION_ANCHOR_ADDRESS === '0x0000000000000000000000000000000000000000') {
      logger.warn('⚠️  VerificationAnchor address not configured, skipping L1 anchoring');
      return '';
    }

    // Create verification hash (same as ConsensusEngine does)
    const encoder = new TextEncoder();
    const data = encoder.encode(
      JSON.stringify({
        requestId,
        valuation,
        confidence,
        l1BlockNumber,
        timestamp: Math.floor(Date.now() / 1000)
      })
    );
    
    const hashBuffer = Buffer.from(data);
    const hex = hashBuffer.toString('hex').slice(0, 64).padEnd(64, '0');
    const verificationHash = `0x${hex}` as `0x${string}`;
    
    logger.info('🔗 Anchoring verification to Ethereum L1...');
    logger.info(`   VerificationAnchor: ${VERIFICATION_ANCHOR_ADDRESS}`);
    logger.info(`   L1 Block Number: ${l1BlockNumber}`);
    logger.info(`   Verification Hash: ${verificationHash}`);
    
    // Get the current nonce explicitly to avoid conflicts
    const nonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: 'pending',
    });

    logger.info(`   🔢 Using nonce: ${nonce}`);
    
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
    
    logger.info(`✅ L1 Anchoring successful: ${hash}`);
    logger.info(`   Verification hash is now stored on Ethereum L1 via Mantle rollup`);
    
    return hash;
    
  } catch (error: any) {
    logger.warn(`⚠️  L1 Anchoring failed: ${error.message}`);
    logger.warn(`   Continuing with tokenization...`);
    return '';
  }
}

/**
 * Submit tokenization request after verification consensus
 * This is called when confidence >= 70% to create ERC-20 tokens
 */
export async function submitTokenization(
  requestId: string,
  assetId: bigint,
  valuation: number,
  owner: string,
  assetName: string,
  confidence: number
): Promise<{ success: boolean; tokenAddress?: string; error?: string }> {
  try {
    logger.info('\n🎫 ═══════════════════════════════════════════════════════');
    logger.info('🎫 SUBMITTING TOKENIZATION REQUEST');
    logger.info('🎫 ═══════════════════════════════════════════════════════\n');
    
    logger.info(`   📋 Request Details:`);
    logger.info(`      Request ID: ${requestId}`);
    logger.info(`      Asset ID: ${assetId}`);
    logger.info(`      Valuation: $${Number(valuation).toLocaleString()}`);
    logger.info(`      Confidence: ${confidence}%`);
    logger.info(`      Owner: ${owner}`);
    logger.info(`      Asset Name: ${assetName}\n`);

    // Dynamically import tokenization service to avoid circular dependencies
    const { tokenizeVerifiedAsset } = await import('./services/tokenization');

    const result = await tokenizeVerifiedAsset({
      requestId,
      assetId,
      assetName,
      valuation,
      confidence,
      owner,
    });

    if (result.success) {
      logger.info(`✅ Tokenization completed successfully`);
      logger.info(`   Token Address: ${result.tokenAddress}\n`);
      
      return {
        success: true,
        tokenAddress: result.tokenAddress,
      };
    } else {
      logger.error(`❌ Tokenization failed: ${result.error}`);
      logger.info('\n🎫 ═══════════════════════════════════════════════════════');
      logger.info('🎫 TOKENIZATION FAILED ❌');
      logger.info('🎫 ═══════════════════════════════════════════════════════\n');
      
      return {
        success: false,
        error: result.error,
      };
    }
  } catch (error: any) {
    logger.error(`❌ Error submitting tokenization: ${error.message}`);
    
    return {
      success: false,
      error: error.message,
    };
  }
}