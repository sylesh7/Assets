import * as dotenv from 'dotenv';
import { createPublicClient, http, defineChain } from 'viem';
import * as fs from 'fs';

dotenv.config();

const mantleSepolia = defineChain({
  id: 5003,
  name: 'Mantle Sepolia Testnet',
  nativeCurrency: { decimals: 18, name: 'MNT', symbol: 'MNT' },
  rpcUrls: { default: { http: ['https://rpc.sepolia.mantle.xyz'] } },
  testnet: true,
});

const publicClient = createPublicClient({
  chain: mantleSepolia,
  transport: http('https://rpc.sepolia.mantle.xyz'),
});

async function checkRWATokenFactoryState() {
  try {
    const RWA_TOKEN_FACTORY = '0x68283AAa8899A4aA299141ca6f04dF8e5802509f';

    console.log('📍 Checking RWATokenFactory state...\n');

    // Load ABI
    const abiPath = 'd:\\Projects\\prop99\\onchain\\artifacts\\contracts\\tokens\\RWATokenFactory.sol\\RWATokenFactory.json';
    const artifactContent = fs.readFileSync(abiPath, 'utf-8');
    const artifact = JSON.parse(artifactContent);
    const ABI = artifact.abi;

    // Read assetRegistry
    const assetRegistryFunc = ABI.find((item: any) => item.name === 'assetRegistry' && item.type === 'function');
    if (assetRegistryFunc) {
      const assetRegistry = await publicClient.readContract({
        address: RWA_TOKEN_FACTORY as `0x${string}`,
        abi: [assetRegistryFunc],
        functionName: 'assetRegistry',
      });
      console.log('assetRegistry:', assetRegistry);
    }

    // Read complianceModule
    const complianceFunc = ABI.find((item: any) => item.name === 'complianceModule' && item.type === 'function');
    if (complianceFunc) {
      const complianceModule = await publicClient.readContract({
        address: RWA_TOKEN_FACTORY as `0x${string}`,
        abi: [complianceFunc],
        functionName: 'complianceModule',
      });
      console.log('complianceModule:', complianceModule);
    }

    console.log('\n📋 Configured addresses from .env:');
    console.log('ASSET_REGISTRY_ADDRESS:', process.env.ASSET_REGISTRY_ADDRESS);
    console.log('COMPLIANCE_MODULE_ADDRESS:', process.env.COMPLIANCE_MODULE_ADDRESS);

    // Check deployment-addresses.json if it exists
    try {
      const deploymentAddresses = JSON.parse(
        fs.readFileSync('d:\\Projects\\prop99\\onchain\\deployment-addresses.json', 'utf-8')
      );
      console.log('\n📄 deployment-addresses.json:');
      console.log('AssetRegistry:', deploymentAddresses.AssetRegistry);
      console.log('ComplianceModule:', deploymentAddresses.ComplianceModule);
      console.log('RWATokenFactory:', deploymentAddresses.RWATokenFactory);
    } catch (e) {
      console.log('\n⚠️  deployment-addresses.json not found');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

checkRWATokenFactoryState();
