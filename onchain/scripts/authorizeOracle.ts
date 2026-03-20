import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  // Get private key from hardhat config or environment
  const privateKey = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";
  const rpcUrl = process.env.ETH_SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_INFURA_KEY";
  
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  
  // Newly deployed contract
  const ORACLE_CORE_ADDRESS = "0x857a860c41698B4A112038a9255f1429ef19F9cd";
  const ORACLE_ACCOUNT = wallet.address;
  
  console.log("Authorizing oracle account...");
  console.log("Oracle Core:", ORACLE_CORE_ADDRESS);
  console.log("Oracle Account:", ORACLE_ACCOUNT);
  
  // Minimal ABI for stakeOracle
  const ABI = [
    "function authorizedOracles(address) view returns (bool)",
    "function oracleStake(address) view returns (uint256)",
    "function stakeOracle() payable"
  ];
  
  const oracleCore = new ethers.Contract(ORACLE_CORE_ADDRESS, ABI, wallet);
  
  // Check if already authorized
  const isAuthorized = await oracleCore.authorizedOracles(ORACLE_ACCOUNT);
  const stake = await oracleCore.oracleStake(ORACLE_ACCOUNT);
  
  console.log(`Current status: Authorized=${isAuthorized}, Stake=${ethers.formatEther(stake)} ETH`);
  
  if (!isAuthorized || stake < ethers.parseEther("0.05")) {
    // Stake directly from deployer account (same as oracle)
    console.log("\nCalling stakeOracle() with 0.05 ETH...");
    const stakeTx = await oracleCore.stakeOracle({
      value: ethers.parseEther("0.05"),
    });
    await stakeTx.wait();
    console.log("✅ Oracle staked 0.05 ETH and is now authorized!");
  } else {
    console.log("✅ Oracle is already authorized with sufficient stake");
  }
  
  // Verify
  const finalStatus = await oracleCore.authorizedOracles(ORACLE_ACCOUNT);
  const finalStake = await oracleCore.oracleStake(ORACLE_ACCOUNT);
  console.log(`\nFinal status: Authorized=${finalStatus}, Stake=${ethers.formatEther(finalStake)} ETH`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
