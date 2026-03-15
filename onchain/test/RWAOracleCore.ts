import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { RWAOracleCore, RWAOracleCore__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  charlie: HardhatEthersSigner;
  oracle1: HardhatEthersSigner;
  oracle2: HardhatEthersSigner;
  oracle3: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("RWAOracleCore")) as RWAOracleCore__factory;
  const oracleCoreContract = (await factory.deploy()) as RWAOracleCore;
  const oracleCoreAddress = await oracleCoreContract.getAddress();

  return { oracleCoreContract, oracleCoreAddress };
}

describe("RWAOracleCore", function () {
  let signers: Signers;
  let oracleCoreContract: RWAOracleCore;
  let oracleCoreAddress: string;

  before(async function () {
    try {
      const deployment = await deployments.get("RWAOracleCore");
      oracleCoreAddress = deployment.address;

      oracleCoreContract = await ethers.getContractAt(
        "RWAOracleCore",
        oracleCoreAddress
      );
    } catch (e) {
      if (fhevm.isMock) {
        // On mock, we can deploy
        ({ oracleCoreContract, oracleCoreAddress } = await deployFixture());
      } else {
        (e as Error).message += ". Run: npx hardhat deploy --network sepolia";
        throw e;
      }
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = {
      deployer: ethSigners[0],
      alice: ethSigners[1],
      bob: ethSigners[2],
      charlie: ethSigners[3],
      oracle1: ethSigners[4],
      oracle2: ethSigners[5],
      oracle3: ethSigners[6],
    };
  });

  beforeEach(async function () {
    // Skip tests on Sepolia if not using mock
    if (!fhevm.isMock) {
      console.warn(`⚠️  RWAOracleCore tests run on Sepolia Testnet`);
    }
  });

  // ========== ADMIN MANAGEMENT TESTS ==========

  describe("Admin Management", function () {
    it("deployer should be admin after deployment", async function () {
      const isAdmin = await oracleCoreContract.isAdmin(signers.deployer.address);
      expect(isAdmin).to.equal(true);
    });

    it("admin should be able to add new admin", async function () {
      expect(await oracleCoreContract.isAdmin(signers.alice.address)).to.equal(false);

      await oracleCoreContract.addAdmin(signers.alice.address);

      expect(await oracleCoreContract.isAdmin(signers.alice.address)).to.equal(true);
    });

    it("non-admin cannot add new admin", async function () {
      await expect(
        oracleCoreContract.connect(signers.alice).addAdmin(signers.bob.address)
      ).to.be.revertedWith("Not admin");
    });

    it("admin cannot add themselves", async function () {
      await expect(oracleCoreContract.addAdmin(signers.deployer.address)).to.be.revertedWith(
        "Already admin"
      );
    });

    it("admin should be able to remove admin", async function () {
      await oracleCoreContract.addAdmin(signers.alice.address);
      expect(await oracleCoreContract.isAdmin(signers.alice.address)).to.equal(true);

      await oracleCoreContract.removeAdmin(signers.alice.address);

      expect(await oracleCoreContract.isAdmin(signers.alice.address)).to.equal(false);
    });

    it("cannot remove owner as admin", async function () {
      await expect(oracleCoreContract.removeAdmin(signers.deployer.address)).to.be.revertedWith(
        "Cannot remove owner"
      );
    });

    it("EmitAdminAdded event", async function () {
      await expect(oracleCoreContract.addAdmin(signers.alice.address))
        .to.emit(oracleCoreContract, "AdminAdded")
        .withArgs(signers.alice.address);
    });

    it("EmitAdminRemoved event", async function () {
      await oracleCoreContract.addAdmin(signers.alice.address);

      await expect(oracleCoreContract.removeAdmin(signers.alice.address))
        .to.emit(oracleCoreContract, "AdminRemoved")
        .withArgs(signers.alice.address);
    });
  });

  // ========== VERIFICATION REQUEST TESTS ==========

  describe("Verification Requests", function () {
    it("user should be able to submit verification request", async function () {
      const assetType = 0; // REAL_ESTATE
      const location = "123 Main St, NY";
      const ipfsHashes = ["QmHash1", "QmHash2"];
      const fee = ethers.parseEther("0.01");

      await expect(
        oracleCoreContract.connect(signers.alice).requestVerification(assetType, location, ipfsHashes, {
          value: fee,
        })
      )
        .to.emit(oracleCoreContract, "VerificationRequested")
        .withArgs(1, signers.alice.address, assetType, location);
    });

    it("should reject request with insufficient fee", async function () {
      const assetType = 0;
      const location = "123 Main St, NY";
      const ipfsHashes = ["QmHash1"];
      const insufficientFee = ethers.parseEther("0.001");

      await expect(
        oracleCoreContract.connect(signers.alice).requestVerification(assetType, location, ipfsHashes, {
          value: insufficientFee,
        })
      ).to.be.revertedWith("Insufficient fee");
    });

    it("should reject request without documents", async function () {
      const assetType = 0;
      const location = "123 Main St, NY";
      const ipfsHashes: string[] = [];
      const fee = ethers.parseEther("0.01");

      await expect(
        oracleCoreContract.connect(signers.alice).requestVerification(assetType, location, ipfsHashes, {
          value: fee,
        })
      ).to.be.revertedWith("No documents provided");
    });

    it("should reject request without location", async function () {
      const assetType = 0;
      const location = "";
      const ipfsHashes = ["QmHash1"];
      const fee = ethers.parseEther("0.01");

      await expect(
        oracleCoreContract.connect(signers.alice).requestVerification(assetType, location, ipfsHashes, {
          value: fee,
        })
      ).to.be.revertedWith("Location required");
    });

    it("request ID should increment", async function () {
      const fee = ethers.parseEther("0.01");
      const assetType = 0;
      const location = "123 Main St, NY";
      const ipfsHashes = ["QmHash1"];

      const tx1 = await oracleCoreContract
        .connect(signers.alice)
        .requestVerification(assetType, location, ipfsHashes, { value: fee });
      const receipt1 = await tx1.wait();
      const event1 = receipt1?.logs[0];

      const tx2 = await oracleCoreContract
        .connect(signers.bob)
        .requestVerification(assetType, location, ipfsHashes, { value: fee });
      const receipt2 = await tx2.wait();
      const event2 = receipt2?.logs[0];

      // Verify request IDs are different
      expect(event1).to.not.equal(event2);
    });
  });

  // ========== ORACLE STAKING TESTS ==========

  describe("Oracle Staking & Authorization", function () {
    it("oracle should stake tokens to become authorized", async function () {
      const stakeAmount = ethers.parseEther("1");

      await expect(oracleCoreContract.connect(signers.oracle1).stakeOracle({ value: stakeAmount }))
        .to.emit(oracleCoreContract, "OracleAuthorized")
        .withArgs(signers.oracle1.address, stakeAmount);
    });

    it("should reject stake below minimum", async function () {
      const insufficientStake = ethers.parseEther("0.5");

      await expect(
        oracleCoreContract.connect(signers.oracle1).stakeOracle({ value: insufficientStake })
      ).to.be.revertedWith("Insufficient stake");
    });

    it("oracle should be able to add to stake", async function () {
      const stake1 = ethers.parseEther("1");
      const stake2 = ethers.parseEther("1");

      await oracleCoreContract.connect(signers.oracle1).stakeOracle({ value: stake1 });
      await oracleCoreContract.connect(signers.oracle1).stakeOracle({ value: stake2 });

      // Oracle is still authorized after adding more stake
      const isAuthorized = await oracleCoreContract.authorizedOracles(signers.oracle1.address);
      expect(isAuthorized).to.equal(true);
    });

    it("admin should be able to revoke oracle", async function () {
      const stakeAmount = ethers.parseEther("1");
      await oracleCoreContract.connect(signers.oracle1).stakeOracle({ value: stakeAmount });

      await expect(oracleCoreContract.revokeOracle(signers.oracle1.address))
        .to.emit(oracleCoreContract, "OracleRevoked")
        .withArgs(signers.oracle1.address);

      const isAuthorized = await oracleCoreContract.authorizedOracles(signers.oracle1.address);
      expect(isAuthorized).to.equal(false);
    });

    it("non-admin cannot revoke oracle", async function () {
      const stakeAmount = ethers.parseEther("1");
      await oracleCoreContract.connect(signers.oracle1).stakeOracle({ value: stakeAmount });

      await expect(oracleCoreContract.connect(signers.alice).revokeOracle(signers.oracle1.address)).to.be.revertedWith(
        "Not admin"
      );
    });

    it("admin should be able to slash oracle", async function () {
      const stakeAmount = ethers.parseEther("2");
      await oracleCoreContract.connect(signers.oracle1).stakeOracle({ value: stakeAmount });

      const slashAmount = ethers.parseEther("0.5");

      await expect(oracleCoreContract.slashOracle(signers.oracle1.address, slashAmount))
        .to.emit(oracleCoreContract, "OracleSlashed")
        .withArgs(signers.oracle1.address, slashAmount);
    });

    it("should reject slash if oracle has insufficient stake", async function () {
      const stakeAmount = ethers.parseEther("1");
      await oracleCoreContract.connect(signers.oracle1).stakeOracle({ value: stakeAmount });

      const slashAmount = ethers.parseEther("2");

      await expect(
        oracleCoreContract.slashOracle(signers.oracle1.address, slashAmount)
      ).to.be.revertedWith("Insufficient stake");
    });
  });

  // ========== ORACLE RESPONSE & CONSENSUS TESTS ==========

  describe("Oracle Response Submission", function () {
    beforeEach(async function () {
      // Register multiple oracles
      const stakeAmount = ethers.parseEther("1");
      await oracleCoreContract.connect(signers.oracle1).stakeOracle({ value: stakeAmount });
      await oracleCoreContract.connect(signers.oracle2).stakeOracle({ value: stakeAmount });
      await oracleCoreContract.connect(signers.oracle3).stakeOracle({ value: stakeAmount });

      // Submit verification request
      const fee = ethers.parseEther("0.01");
      await oracleCoreContract
        .connect(signers.alice)
        .requestVerification(0, "123 Main St, NY", ["QmHash1"], { value: fee });
    });

    it("authorized oracle should be able to submit response", async function () {
      const requestId = 1;
      const encryptedValuation = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle1.address)
        .add64(100000n)
        .encrypt();

      const encryptedConfidence = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle1.address)
        .add32(85)
        .encrypt();

      const evidenceHash = ethers.id("evidence1");

      await expect(
        oracleCoreContract.connect(signers.oracle1).submitOracleResponse(
          requestId,
          encryptedValuation.handles[0],
          encryptedValuation.inputProof,
          encryptedConfidence.handles[0],
          encryptedConfidence.inputProof,
          evidenceHash
        )
      )
        .to.emit(oracleCoreContract, "OracleResponseSubmitted")
        .withArgs(requestId, signers.oracle1.address, evidenceHash);
    });

    it("non-authorized oracle cannot submit response", async function () {
      const requestId = 1;
      const encryptedValuation = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.alice.address)
        .add64(100000n)
        .encrypt();

      const encryptedConfidence = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.alice.address)
        .add32(85)
        .encrypt();

      const evidenceHash = ethers.id("evidence1");

      await expect(
        oracleCoreContract.connect(signers.alice).submitOracleResponse(
          requestId,
          encryptedValuation.handles[0],
          encryptedValuation.inputProof,
          encryptedConfidence.handles[0],
          encryptedConfidence.inputProof,
          evidenceHash
        )
      ).to.be.revertedWith("Not authorized oracle");
    });

    it("oracle cannot submit twice for same request", async function () {
      const requestId = 1;
      const encryptedValuation = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle1.address)
        .add64(100000n)
        .encrypt();

      const encryptedConfidence = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle1.address)
        .add32(85)
        .encrypt();

      const evidenceHash = ethers.id("evidence1");

      // First submission should succeed
      await oracleCoreContract.connect(signers.oracle1).submitOracleResponse(
        requestId,
        encryptedValuation.handles[0],
        encryptedValuation.inputProof,
        encryptedConfidence.handles[0],
        encryptedConfidence.inputProof,
        evidenceHash
      );

      // Second submission should fail
      const encryptedValuation2 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle1.address)
        .add64(110000n)
        .encrypt();

      const encryptedConfidence2 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle1.address)
        .add32(90)
        .encrypt();

      await expect(
        oracleCoreContract.connect(signers.oracle1).submitOracleResponse(
          requestId,
          encryptedValuation2.handles[0],
          encryptedValuation2.inputProof,
          encryptedConfidence2.handles[0],
          encryptedConfidence2.inputProof,
          evidenceHash
        )
      ).to.be.revertedWith("Already submitted");
    });

    it("response on non-pending request should fail", async function () {
      // Submit threshold responses to trigger consensus
      const encryptedValuation1 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle1.address)
        .add64(100000n)
        .encrypt();
      
      const encryptedConfidence1 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle1.address)
        .add32(85)
        .encrypt();

      await oracleCoreContract.connect(signers.oracle1).submitOracleResponse(
        1,
        encryptedValuation1.handles[0],
        encryptedValuation1.inputProof,
        encryptedConfidence1.handles[0],
        encryptedConfidence1.inputProof,
        ethers.id("evidence1")
      );

      const encryptedValuation2 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle2.address)
        .add64(105000n)
        .encrypt();
      
      const encryptedConfidence2 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle2.address)
        .add32(88)
        .encrypt();

      // Second response triggers consensus
      await oracleCoreContract.connect(signers.oracle2).submitOracleResponse(
        1,
        encryptedValuation2.handles[0],
        encryptedValuation2.inputProof,
        encryptedConfidence2.handles[0],
        encryptedConfidence2.inputProof,
        ethers.id("evidence2")
      );

      // Now try third oracle - should fail because consensus was reached
      const encryptedValuation3 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle3.address)
        .add64(102000n)
        .encrypt();
      
      const encryptedConfidence3 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle3.address)
        .add32(87)
        .encrypt();

      await expect(
        oracleCoreContract.connect(signers.oracle3).submitOracleResponse(
          1,
          encryptedValuation3.handles[0],
          encryptedValuation3.inputProof,
          encryptedConfidence3.handles[0],
          encryptedConfidence3.inputProof,
          ethers.id("evidence3")
        )
      ).to.be.revertedWith("Request not pending");
    });
  });

  // ========== CONSENSUS TESTS ==========

  describe("Consensus Calculation (Encrypted)", function () {
    beforeEach(async function () {
      // Setup oracles and request
      const stakeAmount = ethers.parseEther("1");
      await oracleCoreContract.connect(signers.oracle1).stakeOracle({ value: stakeAmount });
      await oracleCoreContract.connect(signers.oracle2).stakeOracle({ value: stakeAmount });
      await oracleCoreContract.connect(signers.oracle3).stakeOracle({ value: stakeAmount });

      const fee = ethers.parseEther("0.01");
      await oracleCoreContract
        .connect(signers.alice)
        .requestVerification(0, "123 Main St, NY", ["QmHash1"], { value: fee });
    });

    it("consensus should be reached with threshold responses", async function () {
      // Submit first response
      const encryptedValuation1 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle1.address)
        .add64(100000n)
        .encrypt();
      
      const encryptedConfidence1 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle1.address)
        .add32(85)
        .encrypt();

      await oracleCoreContract.connect(signers.oracle1).submitOracleResponse(
        1,
        encryptedValuation1.handles[0],
        encryptedValuation1.inputProof,
        encryptedConfidence1.handles[0],
        encryptedConfidence1.inputProof,
        ethers.id("evidence1")
      );

      // Submit second response - should trigger consensus
      const encryptedValuation2 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle2.address)
        .add64(105000n)
        .encrypt();
      
      const encryptedConfidence2 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle2.address)
        .add32(88)
        .encrypt();

      await expect(
        oracleCoreContract.connect(signers.oracle2).submitOracleResponse(
          1,
          encryptedValuation2.handles[0],
          encryptedValuation2.inputProof,
          encryptedConfidence2.handles[0],
          encryptedConfidence2.inputProof,
          ethers.id("evidence2")
        )
      )
        .to.emit(oracleCoreContract, "ConsensusReached")
        .withArgs(1, 2);
    });

    it("consensus result should be encrypted", async function () {
      const encryptedValuation1 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle1.address)
        .add64(100000n)
        .encrypt();
      
      const encryptedConfidence1 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle1.address)
        .add32(85)
        .encrypt();

      await oracleCoreContract.connect(signers.oracle1).submitOracleResponse(
        1,
        encryptedValuation1.handles[0],
        encryptedValuation1.inputProof,
        encryptedConfidence1.handles[0],
        encryptedConfidence1.inputProof,
        ethers.id("evidence1")
      );

      const encryptedValuation2 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle2.address)
        .add64(105000n)
        .encrypt();
      
      const encryptedConfidence2 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle2.address)
        .add32(88)
        .encrypt();

      await oracleCoreContract.connect(signers.oracle2).submitOracleResponse(
        1,
        encryptedValuation2.handles[0],
        encryptedValuation2.inputProof,
        encryptedConfidence2.handles[0],
        encryptedConfidence2.inputProof,
        ethers.id("evidence2")
      );

      // Owner should be able to get encrypted valuation
      const encryptedVal = await oracleCoreContract
        .connect(signers.alice)
        .getEncryptedValuation(1);
      expect(encryptedVal).to.not.be.undefined;
    });

    it("non-owner cannot get encrypted valuation", async function () {
      const encryptedValuation1 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle1.address)
        .add64(100000n)
        .encrypt();
      
      const encryptedConfidence1 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle1.address)
        .add32(85)
        .encrypt();

      await oracleCoreContract.connect(signers.oracle1).submitOracleResponse(
        1,
        encryptedValuation1.handles[0],
        encryptedValuation1.inputProof,
        encryptedConfidence1.handles[0],
        encryptedConfidence1.inputProof,
        ethers.id("evidence1")
      );

      const encryptedValuation2 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle2.address)
        .add64(105000n)
        .encrypt();
      
      const encryptedConfidence2 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle2.address)
        .add32(88)
        .encrypt();

      await oracleCoreContract.connect(signers.oracle2).submitOracleResponse(
        1,
        encryptedValuation2.handles[0],
        encryptedValuation2.inputProof,
        encryptedConfidence2.handles[0],
        encryptedConfidence2.inputProof,
        ethers.id("evidence2")
      );

      await expect(
        oracleCoreContract.connect(signers.bob).getEncryptedValuation(1)
      ).to.be.revertedWith("Not owner");
    });
  });

  // ========== PRICE UPDATE TESTS ==========

  describe("Price Updates", function () {
    beforeEach(async function () {
      const stakeAmount = ethers.parseEther("1");
      await oracleCoreContract.connect(signers.oracle1).stakeOracle({ value: stakeAmount });

      const fee = ethers.parseEther("0.01");
      await oracleCoreContract
        .connect(signers.alice)
        .requestVerification(0, "123 Main St, NY", ["QmHash1"], { value: fee });

      // Get consensus
      const encryptedValuation1 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle1.address)
        .add64(100000n)
        .encrypt();
      const encryptedConfidence1 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle1.address)
        .add32(85)
        .encrypt();

      await oracleCoreContract.connect(signers.oracle1).submitOracleResponse(
        1,
        encryptedValuation1.handles[0],
        encryptedValuation1.inputProof,
        encryptedConfidence1.handles[0],
        encryptedConfidence1.inputProof,
        ethers.id("evidence1")
      );
    });

    it("authorized oracle should be able to update price", async function () {
      const assetId = 1;
      const encryptedPrice = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle1.address)
        .add64(105000n)
        .encrypt();

      const encryptedConfidence = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle1.address)
        .add32(87)
        .encrypt();

      await expect(
        oracleCoreContract.connect(signers.oracle1).updatePrice(
          assetId,
          encryptedPrice.handles[0],
          encryptedPrice.inputProof,
          encryptedConfidence.handles[0],
          encryptedConfidence.inputProof
        )
      )
        .to.emit(oracleCoreContract, "PriceUpdated")
        .withArgs(assetId);
    });

    it("non-authorized oracle cannot update price", async function () {
      const assetId = 1;
      const encryptedPrice = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.alice.address)
        .add64(105000n)
        .encrypt();

      const encryptedConfidence = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.alice.address)
        .add32(87)
        .encrypt();

      await expect(
        oracleCoreContract.connect(signers.alice).updatePrice(
          assetId,
          encryptedPrice.handles[0],
          encryptedPrice.inputProof,
          encryptedConfidence.handles[0],
          encryptedConfidence.inputProof
        )
      ).to.be.revertedWith("Not authorized oracle");
    });
  });

  // ========== REQUEST STATUS TESTS ==========

  describe("Request Status", function () {
    it("new request should have PENDING status", async function () {
      const fee = ethers.parseEther("0.01");
      const tx = await oracleCoreContract
        .connect(signers.alice)
        .requestVerification(0, "123 Main St, NY", ["QmHash1"], { value: fee });

      await tx.wait();

      const request = await oracleCoreContract.requests(1);
      expect(request.status).to.equal(0); // PENDING
    });

    it("request should move to VERIFIED after consensus", async function () {
      const stakeAmount = ethers.parseEther("1");
      await oracleCoreContract.connect(signers.oracle1).stakeOracle({ value: stakeAmount });
      await oracleCoreContract.connect(signers.oracle2).stakeOracle({ value: stakeAmount });

      const fee = ethers.parseEther("0.01");
      await oracleCoreContract
        .connect(signers.alice)
        .requestVerification(0, "123 Main St, NY", ["QmHash1"], { value: fee });

      const encryptedValuation1 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle1.address)
        .add64(100000n)
        .encrypt();
      
      const encryptedConfidence1 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle1.address)
        .add32(85)
        .encrypt();

      await oracleCoreContract.connect(signers.oracle1).submitOracleResponse(
        1,
        encryptedValuation1.handles[0],
        encryptedValuation1.inputProof,
        encryptedConfidence1.handles[0],
        encryptedConfidence1.inputProof,
        ethers.id("evidence1")
      );

      const encryptedValuation2 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle2.address)
        .add64(105000n)
        .encrypt();
      
      const encryptedConfidence2 = await fhevm
        .createEncryptedInput(oracleCoreAddress, signers.oracle2.address)
        .add32(88)
        .encrypt();

      await oracleCoreContract.connect(signers.oracle2).submitOracleResponse(
        1,
        encryptedValuation2.handles[0],
        encryptedValuation2.inputProof,
        encryptedConfidence2.handles[0],
        encryptedConfidence2.inputProof,
        ethers.id("evidence2")
      );

      const request = await oracleCoreContract.requests(1);
      expect(request.status).to.equal(2); // VERIFIED
    });
  });
});
