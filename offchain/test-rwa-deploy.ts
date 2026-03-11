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

// Load RWAToken ABI
const rwaTokenArtifactPath = 'd:\\Projects\\prop99\\onchain\\artifacts\\contracts\\tokens\\RWAToken.sol\\RWAToken.json';
const rwaTokenArtifact = JSON.parse(fs.readFileSync(rwaTokenArtifactPath, 'utf-8'));
const RWA_TOKEN_BYTECODE = rwaTokenArtifact.bytecode;
const RWA_TOKEN_ABI = rwaTokenArtifact.abi;

async function testDeployRWAToken() {
  try {
    console.log('🔐 Owner Account:', ownerAccount.address);
    console.log('📍 Asset Registry:', ASSET_REGISTRY);
    console.log('🌐 Chain:', mantleSepolia.name);
    console.log('\n✅ Testing RWAToken deployment with OWNER account...\n');

    const tokenName = 'RWA-Test Token 66';
    const tokenSymbol = 'RWAT66';
    const assetId = 66n;
    const valuation = 100000n;
    const owner = ownerAccount.address;

    console.log('📝 Token Parameters:');
    console.log('  - Name:', tokenName);
    console.log('  - Symbol:', tokenSymbol);
    console.log('  - Asset ID:', assetId.toString());
    console.log('  - Valuation:', valuation.toString());
    console.log('  - Owner:', owner);
    console.log('  - AssetRegistry:', ASSET_REGISTRY);

    // Find the constructor in the ABI
    const constructorAbi = RWA_TOKEN_ABI.find((item: any) => item.type === 'constructor');
    console.log('\n📦 Constructor parameters:');
    if (constructorAbi) {
      constructorAbi.inputs.forEach((input: any, idx: number) => {
        console.log(`  ${idx + 1}. ${input.name}: ${input.type}`);
      });
    }

    console.log('\n🚀 Deploying RWAToken...');

    const hash = await walletClient.deployContract({
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

    console.log('✓ Deployment hash:', hash);
    console.log('⏳ Waiting for confirmation...');

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success' && receipt.contractAddress) {
      console.log('\n✅ RWAToken deployed successfully!');
      console.log('📦 Contract Address:', receipt.contractAddress);
      console.log('⛽ Gas used:', receipt.gasUsed.toString());
    } else {
      console.log('\n❌ Deployment failed');
    }
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.cause) console.error('Cause:', error.cause);
  }
}

testDeployRWAToken();
