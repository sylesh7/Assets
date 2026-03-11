import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, http } from "viem";
import { mantle } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

// Network and contracts
const RPC_URL = "https://rpc.sepolia.mantle.xyz";
const CHAIN_ID = 5003;
const VERIFICATION_ANCHOR_ADDRESS = process.env.VERIFICATION_ANCHOR_ADDRESS || "";
const CONSENSUS_ENGINE_ADDRESS = process.env.CONSENSUS_ENGINE_ADDRESS || "";

// Accounts
const OWNER_PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY || "";
const ownerAccount = privateKeyToAccount(`0x${OWNER_PRIVATE_KEY}`);

// Contracts ABI
const VERIFICATION_ANCHOR_ABI = [
  {
    inputs: [
      { name: "_consensusEngine", type: "address" },
      { name: "_location", type: "tuple", components: [
        { name: "latitude", type: "int256" },
        { name: "longitude", type: "int256" }
      ]},
      { name: "_documentCID", type: "string" },
      { name: "_metadata", type: "string" }
    ],
    name: "requestVerification",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  }
];

async function main() {
  console.log("🚀 Testing new verification request with document fetch...\n");
  
  const publicClient = createPublicClient({
    chain: { id: CHAIN_ID, name: "Mantle Sepolia", rpcUrls: { default: { http: [RPC_URL] } } },
    transport: http(RPC_URL)
  });

  const walletClient = createWalletClient({
    chain: { id: CHAIN_ID, name: "Mantle Sepolia", rpcUrls: { default: { http: [RPC_URL] } } },
    transport: http(RPC_URL),
    account: ownerAccount
  });

  // Test with a known IPFS hash for a document
  // Using a simple test document structure
  const testDocumentCID = "bafyreibjxzn4vzsauxl5vug4dq4b3z4r65kztnqx3e7ljzgpxe2iox35a"; // Example IPFS hash
  
  const location = {
    latitude: 35_000_000n, // 35 degrees
    longitude: -120_000_000n // -120 degrees (California)
  };

  const metadata = JSON.stringify({
    document_type: "land_document",
    file_name: "test_document.json",
    original_file_cid: `ipfs://${testDocumentCID}`
  });

  try {
    console.log(`📋 Submitting verification request...`);
    console.log(`   Document CID: ${testDocumentCID}`);
    console.log(`   Location: ${Number(location.latitude) / 1_000_000}°, ${Number(location.longitude) / 1_000_000}°`);
    console.log(`   Metadata: ${metadata}\n`);

    const hash = await walletClient.writeContract({
      address: VERIFICATION_ANCHOR_ADDRESS as `0x${string}`,
      abi: VERIFICATION_ANCHOR_ABI,
      functionName: "requestVerification",
      args: [CONSENSUS_ENGINE_ADDRESS as `0x${string}`, location, testDocumentCID, metadata]
    });

    console.log(`✅ Transaction submitted: ${hash}`);
    console.log(`⏳ Waiting for transaction receipt...\n`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60000 });
    
    console.log(`✅ Transaction confirmed at block ${receipt.blockNumber}`);
    console.log(`✅ Gas used: ${receipt.gasUsed}`);
    console.log(`\n📌 Watch the oracle logs to see document fetching attempts!`);
    
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

main();
