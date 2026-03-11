"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Main entry point for AI Oracle Backend
 */
const listener_1 = require("./listener");
const logger_1 = require("./utils/logger");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Validate environment variables
const requiredEnvVars = [
    'ORACLE_ROUTER_ADDRESS',
    'CONSENSUS_ENGINE_ADDRESS',
    'ORACLE_PRIVATE_KEY',
    'GROQ_API_KEY',
    'OPENROUTER_API_KEY',
    'GOOGLE_EARTH_ENGINE_PROJECT_ID'
];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    logger_1.logger.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    logger_1.logger.error('Please check your .env file');
    process.exit(1);
}
// Start the oracle
async function main() {
    try {
        logger_1.logger.info('═══════════════════════════════════════════════════════════════');
        logger_1.logger.info('🤖 RWA ORACLE STARTING');
        logger_1.logger.info('═══════════════════════════════════════════════════════════════');
        logger_1.logger.info(`Oracle Address: ${process.env.ORACLE_ROUTER_ADDRESS}`);
        logger_1.logger.info(`Network: ${process.env.NODE_ENV === 'production' ? 'Mainnet' : 'Testnet'}`);
        logger_1.logger.info('═══════════════════════════════════════════════════════════════\n');
        await (0, listener_1.startListener)();
    }
    catch (error) {
        logger_1.logger.error('❌ Fatal error:', error);
        process.exit(1);
    }
}
main();
