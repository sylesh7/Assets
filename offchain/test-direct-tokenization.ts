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
const OWNER_PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY;
const ASSET_REGISTRY = process.env.ASSET_REGISTRY_ADDRESS;

const ownerPrivateKey = OWNER_PRIVATE_KEY.startsWith('0x') ? OWNER_PRIVATE_KEY : `0x${OWNER_PRIVATE_KEY}`;
const ownerAccount = privateKeyToAccount(ownerPrivateKey as `0x${string}`);

const walletClient = createWalletClient({
  account: ownerAccount,
  chain: mantleSepolia,
  transport: http(RPC_URL),
});

const publicClient = createPublicClient({
  chain: mantleSepolia,
  transport: http(RPC_URL),
});

// Load RWAToken ABI and bytecode
const rwaTokenArtifactPath = 'd:\\Projects\\prop99\\onchain\\artifacts\\contracts\\tokens\\RWAToken.sol\\RWAToken.json';
const rwaTokenArtifact = JSON.parse(fs.readFileSync(rwaTokenArtifactPath, 'utf-8'));
const RWA_TOKEN_BYTECODE = rwaTokenArtifact.bytecode;
const RWA_TOKEN_ABI = rwaTokenArtifact.abi;

async function testDirectTokenizationFlow() {
  try {
    console.log('🔐 Owner Account:', ownerAccount.address);
    console.log('📍 Asset Registry:', ASSET_REGISTRY);
    console.log('🌐 Chain:', mantleSepolia.name);

    // Test parameters
    const assetId = 44n;
    const valuation = 500000n;
    const owner = ownerAccount.address;
    const assetName = 'Direct Deploy Test 44';

    console.log('\n✅ Direct Token Deployment & Minting Flow\n');

    console.log('📝 Step 1: Deploy RWAToken');
    console.log('  - Asset ID:', assetId.toString());
    console.log('  - Valuation:', valuation.toString());
    console.log('  - Owner: ' + owner);
    console.log('  - Asset Name:', assetName);

    // Step 1: Create token name and symbol
    const tokenName = `RWA-${assetName}`;
    const tokenSymbol = `RWA${assetId}`;

    console.log('\n🚀 Step 1: Deploying RWAToken...');

    const deployHash = await walletClient.deployContract({
      abi: RWA_TOKEN_ABI,
      bytecode: RWA_TOKEN_BYTECODE as `0x${string}`,
      args: [
        tokenName,
        tokenSymbol,
        assetId,
        valuation,
        ASSET_REGISTRY as `0x${string}`,
        owner,
      ],
    });

    console.log('✓ Deployment hash:', deployHash);
    console.log('⏳ Waiting for confirmation...');

    const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });

    if (deployReceipt.status === 'success' && deployReceipt.contractAddress) {
      const tokenAddress = deployReceipt.contractAddress;
      console.log('\n✅ Token deployed successfully!');
      console.log('🪙 Token Address:', tokenAddress);
      console.log('📦 Block number:', deployReceipt.blockNumber.toString());
      console.log('⛽ Gas used:', deployReceipt.gasUsed.toString());

      console.log('\n📝 Step 2: Mint Tokens');
      console.log('  - Token:', tokenAddress);
      console.log('  - To:', owner);
      console.log('  - Amount:', valuation.toString());

      console.log('\n🚀 Step 2: Calling mint...');

      const mintHash = await walletClient.writeContract({
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
        console.log('  ✓ Token created & deployed:', tokenAddress);
        console.log('  ✓ Tokens minted: ' + valuation.toString());
        console.log('  ✓ Owner: ' + owner);
        console.log('  ✓ Explorer (deploy): https://explorer.sepolia.mantle.xyz/tx/' + deployHash);
        console.log('  ✓ Explorer (mint): https://explorer.sepolia.mantle.xyz/tx/' + mintHash);
      } else {
        console.log('\n❌ Mint failed');
      }
    } else {
      console.log('\n❌ Deployment failed');
    }
  } catch (error: any) {
    console.error('\n❌ Error:');
    console.error('Message:', error.message);
    if (error.cause) console.error('Cause:', error.cause);
  }
}

testDirectTokenizationFlow();
