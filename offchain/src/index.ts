/**
 * Main entry point for AI Oracle Backend
 */
import { startListener } from './listener';
import { logger } from './utils/logger';
import dotenv from 'dotenv';

dotenv.config();

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
  logger.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  logger.error('Please check your .env file');
  process.exit(1);
}

// Start the oracle
async function main() {
  try {
    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('🤖 RWA ORACLE STARTING');
    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info(`Oracle Address: ${process.env.ORACLE_ROUTER_ADDRESS}`);
    logger.info(`Network: ${process.env.NODE_ENV === 'production' ? 'Mainnet' : 'Testnet'}`);
    logger.info('═══════════════════════════════════════════════════════════════\n');
    
    await startListener();
    
  } catch (error) {
    logger.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
