import { task } from "hardhat/config";
import { RWAAssetManager } from "../types/contracts";

task("test-sepolia-transactions", "Makes real transactions on Sepolia to demonstrate contract")
  .setAction(async (taskArgs, hre) => {
    if (hre.network.name !== "sepolia") {
      console.error("❌ This task only works on Sepolia network!");
      console.log("Run with: npx hardhat test-sepolia-transactions --network sepolia");
      return;
    }

    const [deployer, alice, bob] = await hre.ethers.getSigners();
    console.log(`\n📡 Connected to Sepolia`);
    console.log(`   Deployer: ${deployer.address}`);
    console.log(`   Alice:    ${alice.address}`);
    console.log(`   Bob:      ${bob.address}`);

    // Load deployed contracts
    const fs = require("fs");
    const deploymentDir = "./deployments/sepolia";
    const assetManagerJson = JSON.parse(
      fs.readFileSync(`${deploymentDir}/RWAAssetManager.json`, "utf8")
    );

    const assetManagerAddress = assetManagerJson.address;

    console.log(`\n✅ RWAAssetManager: ${assetManagerAddress}`);

    // Get contract instance with proper typing
    const assetManager = await hre.ethers.getContractAt(
      "RWAAssetManager",
      assetManagerAddress
    ) as RWAAssetManager;

    console.log("\n🚀 Making real Sepolia transactions...\n");

    // Transaction 1: Add Admin
    console.log("1️⃣  Adding admin...");
    try {
      const addAdminTx = await assetManager.addAdmin(alice.address);
      console.log(`   ⏳ Tx: ${addAdminTx.hash}`);
      const receipt = await addAdminTx.wait();
      console.log(`   ✅ Admin added! Block: ${receipt?.blockNumber}`);
      console.log(`   🔗 https://sepolia.etherscan.io/tx/${addAdminTx.hash}\n`);
    } catch (err: any) {
      if (err.reason?.includes("Already admin")) {
        console.log(`   ℹ️  Already admin\n`);
      } else {
        console.log(`   ❌ Error: ${err.reason || err.message}\n`);
      }
    }

    // Transaction 2: Approve new admin (call from alice)
    console.log("2️⃣  Adding another admin (Bob)...");
    try {
      const addBobTx = await assetManager.connect(alice).addAdmin(bob.address);
      console.log(`   ⏳ Tx: ${addBobTx.hash}`);
      const receipt = await addBobTx.wait();
      console.log(`   ✅ Bob added as admin! Block: ${receipt?.blockNumber}`);
      console.log(`   🔗 https://sepolia.etherscan.io/tx/${addBobTx.hash}\n`);
    } catch (err: any) {
      if (err.reason?.includes("Already admin")) {
        console.log(`   ℹ️  Already admin\n`);
      } else {
        console.log(`   ❌ Error: ${err.reason || err.message}\n`);
      }
    }

    // Transaction 3: Set KYC for Alice
    console.log("3️⃣  Setting KYC verification for Alice...");
    try {
      const kycTx = await assetManager.setKYCStatus(alice.address, true, 0);
      console.log(`   ⏳ Tx: ${kycTx.hash}`);
      const receipt = await kycTx.wait();
      console.log(`   ✅ KYC verified! Block: ${receipt?.blockNumber}`);
      console.log(`   🔗 https://sepolia.etherscan.io/tx/${kycTx.hash}\n`);
    } catch (err: any) {
      console.log(`   ❌ Error: ${err.reason || err.message}\n`);
    }

    // Transaction 4: Set KYC for Bob
    console.log("4️⃣  Setting KYC verification for Bob...");
    try {
      const kycTx = await assetManager.setKYCStatus(bob.address, true, 0);
      console.log(`   ⏳ Tx: ${kycTx.hash}`);
      const receipt = await kycTx.wait();
      console.log(`   ✅ KYC verified! Block: ${receipt?.blockNumber}`);
      console.log(`   🔗 https://sepolia.etherscan.io/tx/${kycTx.hash}\n`);
    } catch (err: any) {
      console.log(`   ❌ Error: ${err.reason || err.message}\n`);
    }

    // Transaction 5: Set accredited investor
    console.log("5️⃣  Setting accredited investor status...");
    try {
      const accredTx = await assetManager.setAccreditedInvestor(alice.address, true);
      console.log(`   ⏳ Tx: ${accredTx.hash}`);
      const receipt = await accredTx.wait();
      console.log(`   ✅ Accredited investor set! Block: ${receipt?.blockNumber}`);
      console.log(`   🔗 https://sepolia.etherscan.io/tx/${accredTx.hash}\n`);
    } catch (err: any) {
      console.log(`   ❌ Error: ${err.reason || err.message}\n`);
    }

    // Summary
    console.log("════════════════════════════════════════════════════════════");
    console.log(`\n📊 VIEW ALL TRANSACTIONS ON ETHERSCAN:`);
    console.log(`   https://sepolia.etherscan.io/address/${assetManagerAddress}`);
    console.log(`\n💡 Transactions may take 15-30 seconds to appear on Etherscan`);
    console.log(`\n✨ Check the Transactions tab to see all contract interactions!\n`);
    console.log("════════════════════════════════════════════════════════════\n");
  });

export {};
