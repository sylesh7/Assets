"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startListener = startListener;
/**
 * Oracle Listener
 * Monitors Ethereum Sepolia blockchain for verification events
 */
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const logger_1 = require("./utils/logger");
const orchestrator_1 = require("./orchestrator");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const oracleCoreAddressEnv = process.env.RWA_ORACLE_CORE_ADDRESS;
if (!oracleCoreAddressEnv) {
    throw new Error('RWA_ORACLE_CORE_ADDRESS environment variable is not set. Set it to: 0xBA2651f23d7f2Fd5D8238e320B0b9Be2BBF54991');
}
const ORACLE_CORE_ADDRESS = oracleCoreAddressEnv;
const IS_TESTNET = process.env.NODE_ENV !== 'production';
const RPC_URL = process.env.ETH_SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/';
// Use Ethereum Sepolia
const publicClient = (0, viem_1.createPublicClient)({
    chain: chains_1.sepolia,
    transport: (0, viem_1.http)(RPC_URL)
});
// Event ABI - matches RWAOracleCore.sol
const VERIFICATION_REQUESTED_EVENT = (0, viem_1.parseAbiItem)('event VerificationRequested(uint256 indexed requestId, address indexed owner, uint8 assetType, string location, uint256 timestamp)');
// Contract ABI for reading request status
const ORACLE_CORE_ABI = [
    {
        inputs: [{ name: '_requestId', type: 'uint256' }],
        name: 'getRequest',
        outputs: [
            {
                components: [
                    { name: 'requestId', type: 'uint256' },
                    { name: 'owner', type: 'address' },
                    { name: 'assetType', type: 'uint8' },
                    { name: 'location', type: 'string' },
                    { name: 'ipfsHashes', type: 'string[]' },
                    { name: 'status', type: 'uint8' }, // 0=PENDING, 1=PROCESSING, 2=VERIFIED, 3=REJECTED
                    { name: 'timestamp', type: 'uint256' },
                    { name: 'valuation', type: 'uint256' },
                    { name: 'confidence', type: 'uint256' }
                ],
                type: 'tuple'
            }
        ],
        stateMutability: 'view',
        type: 'function'
    }
];
/**
 * Start listening for verification requests
 */
async function startListener() {
    logger_1.logger.info('🚀 Starting Oracle Listener...');
    logger_1.logger.info(`📡 Network: Ethereum Sepolia Testnet`);
    logger_1.logger.info(`🔗 RPC URL: ${RPC_URL}`);
    logger_1.logger.info(`📍 Oracle Core: ${ORACLE_CORE_ADDRESS}`);
    try {
        // Get current block number
        const currentBlock = await publicClient.getBlockNumber();
        logger_1.logger.info(`📦 Current block: ${currentBlock}`);
        // Process pending historical events - scan in chunks due to RPC limits
        logger_1.logger.info('🔍 Scanning for pending requests from recent blocks...');
        const CHUNK_SIZE = 10000n;
        const SCAN_DEPTH = 50000n; // Scan last 50k blocks (adjust as needed)
        const fromBlock = currentBlock > SCAN_DEPTH ? currentBlock - SCAN_DEPTH : 0n;
        logger_1.logger.info(`   Scanning from block ${fromBlock} to ${currentBlock} in ${CHUNK_SIZE} block chunks...`);
        let allLogs = [];
        let currentChunkStart = fromBlock;
        while (currentChunkStart < currentBlock) {
            const currentChunkEnd = currentChunkStart + CHUNK_SIZE > currentBlock
                ? currentBlock
                : currentChunkStart + CHUNK_SIZE;
            try {
                const chunkLogs = await publicClient.getLogs({
                    address: ORACLE_CORE_ADDRESS,
                    event: VERIFICATION_REQUESTED_EVENT,
                    fromBlock: currentChunkStart,
                    toBlock: currentChunkEnd
                });
                allLogs = allLogs.concat(chunkLogs);
                if (chunkLogs.length > 0) {
                    logger_1.logger.info(`   ✓ Blocks ${currentChunkStart}-${currentChunkEnd}: Found ${chunkLogs.length} event(s)`);
                }
                currentChunkStart = currentChunkEnd + 1n;
            }
            catch (error) {
                logger_1.logger.warn(`   ⚠️  Failed to scan blocks ${currentChunkStart}-${currentChunkEnd}: ${error.message}`);
                currentChunkStart = currentChunkEnd + 1n;
            }
        }
        logger_1.logger.info(`   Total events found: ${allLogs.length}`);
        if (allLogs.length > 0) {
            logger_1.logger.info(`📜 Filtering pending requests from ${allLogs.length} event(s)...`);
            // Filter out already verified requests
            const pendingLogs = [];
            for (const log of allLogs) {
                const { args } = log;
                const requestId = args.requestId;
                try {
                    // Check request status from contract
                    const request = await publicClient.readContract({
                        address: ORACLE_CORE_ADDRESS,
                        abi: ORACLE_CORE_ABI,
                        functionName: 'getRequest',
                        args: [requestId]
                    });
                    // Status: 0=PENDING, 1=PROCESSING, 2=VERIFIED, 3=REJECTED
                    if (request.status === 0) {
                        pendingLogs.push(log);
                        logger_1.logger.info(`   ✓ Request #${requestId}: PENDING - will process`);
                    }
                    else {
                        const statusNames = ['PENDING', 'PROCESSING', 'VERIFIED', 'REJECTED'];
                        logger_1.logger.info(`   ⊘ Request #${requestId}: ${statusNames[request.status]} - skipping`);
                    }
                }
                catch (error) {
                    logger_1.logger.warn(`   ⚠️  Failed to check status for Request #${requestId}: ${error.message}`);
                    // If we can't check status, process it to be safe
                    pendingLogs.push(log);
                }
            }
            logger_1.logger.info(`\n📋 Found ${pendingLogs.length} pending request(s) to process\n`);
            for (const log of pendingLogs) {
                await handleVerificationRequest(log);
            }
        }
        else {
            logger_1.logger.info('⚠️  No VerificationRequested events found.');
            logger_1.logger.info(`   Contract: ${ORACLE_CORE_ADDRESS}`);
            logger_1.logger.info(`   Scanned: Blocks ${fromBlock} to ${currentBlock}`);
            logger_1.logger.info(`   Event Signature: VerificationRequested(uint256,address,uint8,string,string[],uint256)`);
            logger_1.logger.info(`   Please verify:`);
            logger_1.logger.info(`   1. Contract address is correct`);
            logger_1.logger.info(`   2. Requests were submitted to this contract`);
            logger_1.logger.info(`   3. You're on the correct network (Mantle Sepolia)\n`);
        }
        // Watch for new events
        const unwatch = publicClient.watchEvent({
            address: ORACLE_CORE_ADDRESS,
            event: VERIFICATION_REQUESTED_EVENT,
            onLogs: async (logs) => {
                for (const log of logs) {
                    // Check if request is still pending before processing
                    const { args } = log;
                    const requestId = args.requestId;
                    try {
                        const request = await publicClient.readContract({
                            address: ORACLE_CORE_ADDRESS,
                            abi: ORACLE_CORE_ABI,
                            functionName: 'getRequest',
                            args: [requestId]
                        });
                        // Only process if status is PENDING (0)
                        if (request.status === 0) {
                            await handleVerificationRequest(log);
                        }
                        else {
                            const statusNames = ['PENDING', 'PROCESSING', 'VERIFIED', 'REJECTED'];
                            logger_1.logger.info(`⊘ Skipping Request #${requestId}: Already ${statusNames[request.status]}`);
                        }
                    }
                    catch (error) {
                        logger_1.logger.warn(`⚠️  Failed to check status for Request #${requestId}, processing anyway: ${error.message}`);
                        await handleVerificationRequest(log);
                    }
                }
            }
        });
        logger_1.logger.info('👂 Now listening for new VerificationRequested events...');
        logger_1.logger.info('Press Ctrl+C to stop\n');
        // Keep process alive
        process.on('SIGINT', () => {
            logger_1.logger.info('\n🛑 Stopping oracle listener...');
            unwatch();
            process.exit(0);
        });
    }
    catch (error) {
        logger_1.logger.error('❌ Failed to start listener:', error);
        throw error;
    }
}
/**
 * Handle a VerificationRequested event
 */
async function handleVerificationRequest(log) {
    try {
        const { args } = log;
        // Fetch full request data from contract (includes ipfsHashes)
        const requestId = args.requestId;
        let requestData;
        try {
            requestData = await publicClient.readContract({
                address: ORACLE_CORE_ADDRESS,
                abi: ORACLE_CORE_ABI,
                functionName: 'getRequest',
                args: [requestId]
            });
        }
        catch (error) {
            logger_1.logger.warn(`⚠️  Could not fetch request data from contract: ${error}`);
            requestData = { ipfsHashes: [] };
        }
        const ipfsHashes = requestData.ipfsHashes || [];
        // Parse location string to extract latitude and longitude
        // Expected format: "address | lat,lng" or "lat,lng"
        const location = args.location.trim();
        let latitude = 0;
        let longitude = 0;
        // Check if location contains pipe separator (address | coordinates)
        if (location.includes('|')) {
            const parts = location.split('|');
            const coords = parts[parts.length - 1].trim().split(',');
            latitude = parseFloat(coords[0]) || 0;
            longitude = parseFloat(coords[1]) || 0;
        }
        else {
            // Simple "lat,lng" format
            const coords = location.split(',').map((s) => s.trim());
            latitude = parseFloat(coords[0]) || 0;
            longitude = parseFloat(coords[1]) || 0;
        }
        logger_1.logger.info('═══════════════════════════════════════════════════════════════');
        logger_1.logger.info('🚨 NEW VERIFICATION REQUEST DETECTED');
        logger_1.logger.info('═══════════════════════════════════════════════════════════════');
        logger_1.logger.info(`📝 Request ID: ${args.requestId}`);
        logger_1.logger.info(`👤 Owner: ${args.owner}`);
        logger_1.logger.info(`🏠 Asset Type: ${args.assetType}`);
        logger_1.logger.info(`📍 Location: ${args.location}`);
        logger_1.logger.info(`   Parsed Coordinates: ${latitude}, ${longitude}`);
        logger_1.logger.info(`📄 Documents: ${ipfsHashes.length} files`);
        logger_1.logger.info(`⏰ Timestamp: ${new Date(Number(args.timestamp) * 1000).toISOString()}`);
        logger_1.logger.info(`📦 Block: ${log.blockNumber}`);
        logger_1.logger.info('═══════════════════════════════════════════════════════════════\n');
        // Skip Request #16 (already processed/rejected)
        if (args.requestId.toString() === '16') {
            logger_1.logger.warn('⏭️  Skipping Request #16 (already processed)\n');
            return;
        }
        // Process the request
        await (0, orchestrator_1.processVerificationRequest)({
            requestId: args.requestId.toString(),
            requester: args.owner,
            assetType: args.assetType,
            latitude,
            longitude,
            documentHashes: ipfsHashes,
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash
        });
    }
    catch (error) {
        logger_1.logger.error('❌ Error handling verification request:', error);
    }
}
