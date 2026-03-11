import * as dotenv from 'dotenv';
import { createWalletClient, createPublicClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as fs from 'fs';

dotenv.config();

const mantleSepolia = defineChain({
  id: 5003,
  name: 'Mantle Sepolia Testnet',
  nativeCurrency: { decimals: 18, name: 'MNT', symbol: 'MNT' },
  rpcUrls: { default: { http: ['https://rpc.sepolia.mantle.xyz'] } },
  blockExplorers: { default: { name: 'Explorer', url: 'https://explorer.sepolia.mantle.xyz' } },
  testnet: true,
});

const RPC_URL = 'https://rpc.sepolia.mantle.xyz';
const RWA_TOKEN_FACTORY_ADDRESS = '0x68283AAa8899A4aA299141ca6f04dF8e5802509f';
const ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY;
const OWNER_PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY;

const oraclePrivateKey = ORACLE_PRIVATE_KEY.startsWith('0x') ? ORACLE_PRIVATE_KEY : `0x${ORACLE_PRIVATE_KEY}`;
const oracleAccount = privateKeyToAccount(oraclePrivateKey as `0x${string}`);

const ownerPrivateKey = OWNER_PRIVATE_KEY.startsWith('0x') ? OWNER_PRIVATE_KEY : `0x${OWNER_PRIVATE_KEY}`;
const ownerAccount = privateKeyToAccount(ownerPrivateKey as `0x${string}`);

const oracleWalletClient = createWalletClient({
  account: oracleAccount,
  chain: mantleSepolia,
  transport: http(RPC_URL),
});

const ownerWalletClient = createWalletClient({
  account: ownerAccount,
  chain: mantleSepolia,
  transport: http(RPC_URL),
});

const publicClient = createPublicClient({
  chain: mantleSepolia,
  transport: http(RPC_URL),
});

// Load ABIs
const factoryArtifactPath = 'd:\\Projects\\prop99\\onchain\\artifacts\\contracts\\tokens\\RWATokenFactory.sol\\RWATokenFactory.json';
const factoryArtifact = JSON.parse(fs.readFileSync(factoryArtifactPath, 'utf-8'));
const RWA_TOKEN_FACTORY_ABI = factoryArtifact.abi;

const tokenArtifactPath = 'd:\\Projects\\prop99\\onchain\\artifacts\\contracts\\tokens\\RWAToken.sol\\RWAToken.json';
const tokenArtifact = JSON.parse(fs.readFileSync(tokenArtifactPath, 'utf-8'));
const RWA_TOKEN_ABI = tokenArtifact.abi;

async function testTokenCreationAndMint() {
  try {
    console.log('🔐 Oracle Account (factory caller):', oracleAccount.address);
    console.log('🔑 Owner Account (minter):', ownerAccount.address);
    console.log('📍 RWA Token Factory:', RWA_TOKEN_FACTORY_ADDRESS);
    console.log('🌐 Chain:', mantleSepolia.name);
    console.log('🔗 RPC:', RPC_URL);

    // Test parameters
    const assetId = 55n;
    const valuation = 750000n;
    const owner = ownerAccount.address;
    const assetName = 'Test Asset 55';

    console.log('\n✅ Starting token creation flow...\n');

    console.log('📝 Step 1: Create Token');
    console.log('  - Caller: Oracle (' + oracleAccount.address + ')');
    console.log('  - Asset ID:', assetId.toString());
    console.log('  - Valuation:', valuation.toString());
    console.log('  - Token Owner: ' + owner);
    console.log('  - Asset Name:', assetName);

    console.log('\n🚀 Calling createToken...');

    const createHash = await oracleWalletClient.writeContract({
      address: RWA_TOKEN_FACTORY_ADDRESS as `0x${string}`,
      abi: RWA_TOKEN_FACTORY_ABI,
      functionName: 'createToken',
      args: [assetId, valuation, owner as `0x${string}`, assetName],
    });

    console.log('✓ Transaction hash:', createHash);
    console.log('⏳ Waiting for confirmation...');

    const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createHash });

    if (createReceipt.status === 'success') {
      console.log('\n✅ Token created successfully!');
      console.log('📦 Block number:', createReceipt.blockNumber.toString());
      console.log('⛽ Gas used:', createReceipt.gasUsed.toString());

      // Extract token address from logs
      let tokenAddress: string | null = null;

      for (const log of createReceipt.logs) {
        if (log.address.toLowerCase() === RWA_TOKEN_FACTORY_ADDRESS.toLowerCase()) {
          // TokenCreated event - extract token address from topics[2]
          if (log.topics[0] === '0x224ef611f8efb91cc42a5abd59a28765ecf1c3bcb73d05f16616957dfc7199f3') {
            const topic = log.topics[2];
            if (topic) {
              tokenAddress = '0x' + topic.slice(-40);
              break;
            }
          }
        }
      }

      if (tokenAddress) {
        console.log('🪙 Token Address:', tokenAddress);

        console.log('\n📝 Step 2: Mint Tokens');
        console.log('  - Caller: Owner (' + ownerAccount.address + ')');
        console.log('  - Token:', tokenAddress);
        console.log('  - To:', owner);
        console.log('  - Amount:', valuation.toString());

        console.log('\n🚀 Calling mint...');

        const mintHash = await ownerWalletClient.writeContract({
          address: tokenAddress as `0x${string}`,
          abi: RWA_TOKEN_ABI,
          functionName: 'mint',
          args: [owner as `0x${string}`, valuation],
        });

        console.log('✓ Transaction hash:', mintHash);
        console.log('⏳ Waiting for confirmation...');

        const mintReceipt = await publicClient.waitForTransactionReceipt({ hash: mintHash });

        if (mintReceipt.status === 'success') {
          console.log('\n✅ Tokens minted successfully!');
          console.log('📦 Block number:', mintReceipt.blockNumber.toString());
          console.log('⛽ Gas used:', mintReceipt.gasUsed.toString());

          console.log('\n═══════════════════════════════════════════════════════');
          console.log('✅ COMPLETE SUCCESS!');
          console.log('═══════════════════════════════════════════════════════');
          console.log('\n📊 Summary:');
          console.log('  ✓ Token created:', tokenAddress);
          console.log('  ✓ Tokens minted: ' + valuation.toString());
          console.log('  ✓ Owner: ' + owner);
          console.log('  ✓ Explorer: https://explorer.sepolia.mantle.xyz/tx/' + createHash);
        } else {
          console.log('\n❌ Mint failed');
        }
      } else {
        console.log('\n❌ Token address not found in logs');
      }
    } else {
      console.log('\n❌ Token creation failed');
    }
  } catch (error: any) {
    console.error('\n❌ Error:');
    console.error('Message:', error.message);
    if (error.cause) console.error('Cause:', error.cause);
    if (error.details) console.error('Details:', error.details);
  }
}

testTokenCreationAndMint();
