import { createPublicClient, http } from "viem";
import * as dotenv from "dotenv";

dotenv.config();

const RPC_URL = "https://rpc.sepolia.mantle.xyz";
const CHAIN_ID = 5003;
const CONSENSUS_ENGINE_ADDRESS = process.env.CONSENSUS_ENGINE_ADDRESS || "";
const ORACLE_ADDRESS = "0xe01Add0c3640a8314132bAF491d101A38ffEF4f0";

const CONSENSUS_ENGINE_ABI = [
  {
    inputs: [{ internalType: "address", name: "_oracle", type: "address" }],
    name: "authorizedOracles",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "minConfidenceThreshold",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
];

async function main() {
  const publicClient = createPublicClient({
    chain: { id: CHAIN_ID, name: "Mantle Sepolia", rpcUrls: { default: { http: [RPC_URL] } } },
    transport: http(RPC_URL)
  });

  try {
    console.log("🔍 Checking ConsensusEngine authorization...\n");
    console.log(`ConsensusEngine: ${CONSENSUS_ENGINE_ADDRESS}`);
    console.log(`Oracle Address:  ${ORACLE_ADDRESS}\n`);

    const isAuthorized = await publicClient.readContract({
      address: CONSENSUS_ENGINE_ADDRESS as `0x${string}`,
      abi: CONSENSUS_ENGINE_ABI,
      functionName: "authorizedOracles",
      args: [ORACLE_ADDRESS as `0x${string}`]
    });

    const minConfidence = await publicClient.readContract({
      address: CONSENSUS_ENGINE_ADDRESS as `0x${string}`,
      abi: CONSENSUS_ENGINE_ABI,
      functionName: "minConfidenceThreshold"
    });

    console.log(`✅ Oracle Authorized: ${isAuthorized}`);
    console.log(`✅ Min Confidence Threshold: ${minConfidence}%`);
    
    if (!isAuthorized) {
      console.log("\n⚠️  Oracle is NOT authorized! Run authorize-new-contracts.js first.");
    } else {
      console.log("\n✅ Oracle is authorized and can submit responses.");
    }

  } catch (error) {
    console.error("❌ Error checking authorization:", error);
  }
}

main();
