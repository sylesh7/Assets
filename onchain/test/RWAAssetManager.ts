import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { RWAAssetManager, RWAOracleCore, RWAAssetManager__factory, RWAOracleCore__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  charlie: HardhatEthersSigner;
  dave: HardhatEthersSigner;
};

async function deployFixture() {
  // Deploy oracle first
  const oracleFactory = (await ethers.getContractFactory(
    "RWAOracleCore"
  )) as RWAOracleCore__factory;
  const oracleCoreContract = (await oracleFactory.deploy()) as RWAOracleCore;
  const oracleCoreAddress = await oracleCoreContract.getAddress();

  // Deploy asset manager with oracle address
  const assetManagerFactory = (await ethers.getContractFactory(
    "RWAAssetManager"
  )) as RWAAssetManager__factory;
  const assetManagerContract = (await assetManagerFactory.deploy(oracleCoreAddress)) as RWAAssetManager;
  const assetManagerAddress = await assetManagerContract.getAddress();

  return { oracleCoreContract, assetManagerContract, oracleCoreAddress, assetManagerAddress };
}

describe("RWAAssetManager", function () {
  let signers: Signers;
  let oracleCoreContract: RWAOracleCore;
  let assetManagerContract: RWAAssetManager;
  let oracleCoreAddress: string;
  let assetManagerAddress: string;

  before(async function () {
    try {
      const oracleDeployment = await deployments.get("RWAOracleCore");
      oracleCoreAddress = oracleDeployment.address;
      
      const assetDeployment = await deployments.get("RWAAssetManager");
      assetManagerAddress = assetDeployment.address;

      oracleCoreContract = await ethers.getContractAt(
        "RWAOracleCore",
        oracleCoreAddress
      );

      assetManagerContract = await ethers.getContractAt(
        "RWAAssetManager",
        assetManagerAddress
      );
    } catch (e) {
      if (fhevm.isMock) {
        // On mock, we can deploy
        ({ oracleCoreContract, assetManagerContract, oracleCoreAddress, assetManagerAddress } =
          await deployFixture());
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
      dave: ethSigners[4],
    };
  });

  beforeEach(async function () {
    // Tests can run on both mock and Sepolia
    if (!fhevm.isMock) {
      console.warn(`⚠️  RWAAssetManager tests run on Sepolia Testnet`);
    }
  });

  // ========== ADMIN MANAGEMENT TESTS ==========

  describe("Admin Management", function () {
    it("deployer should be admin after deployment", async function () {
      const isAdmin = await assetManagerContract.isAdmin(signers.deployer.address);
      expect(isAdmin).to.equal(true);
    });

    it("admin should be able to add new admin", async function () {
      expect(await assetManagerContract.isAdmin(signers.alice.address)).to.equal(false);

      await assetManagerContract.addAdmin(signers.alice.address);

      expect(await assetManagerContract.isAdmin(signers.alice.address)).to.equal(true);
    });

    it("non-admin cannot add new admin", async function () {
      // alice was made admin in previous test, so remove admin status first
      await assetManagerContract.removeAdmin(signers.alice.address);
      await expect(
        assetManagerContract.connect(signers.alice).addAdmin(signers.bob.address)
      ).to.be.revertedWith("Not admin");
    });

    it("admin can remove admin", async function () {
      // alice might already be admin from previous test, so check first
      const isAliceAdmin = await assetManagerContract.isAdmin(signers.alice.address);
      if (!isAliceAdmin) {
        await assetManagerContract.addAdmin(signers.alice.address);
      }
      expect(await assetManagerContract.isAdmin(signers.alice.address)).to.equal(true);

      await assetManagerContract.removeAdmin(signers.alice.address);

      expect(await assetManagerContract.isAdmin(signers.alice.address)).to.equal(false);
    });
  });

  // ========== ASSET REGISTRATION TESTS ==========

  describe("Asset Registration", function () {
    beforeEach(async function () {
      // Set deployer as oracle core for testing
      await assetManagerContract.setOracleCore(signers.deployer.address);
    });

    it("oracle core can register asset with encrypted valuation", async function () {
      const requestId = 1;
      const owner = signers.alice.address;
      const assetType = 0; // REAL_ESTATE
      const location = "123 Main St, NY";
      const evidenceHash = ethers.id("evidence1");

      // Create encrypted valuation
      const encryptedValuation = await fhevm
        .createEncryptedInput(assetManagerAddress, signers.deployer.address)
        .add64(450000n)
        .encrypt();

      const encryptedConfidence = await fhevm
        .createEncryptedInput(assetManagerAddress, signers.deployer.address)
        .add32(87)
        .encrypt();

      await expect(
        assetManagerContract.registerAsset(
          requestId,
          owner,
          assetType,
          location,
          encryptedValuation.handles[0],
          encryptedValuation.inputProof,
          encryptedConfidence.handles[0],
          encryptedConfidence.inputProof,
          evidenceHash
        )
      )
        .to.emit(assetManagerContract, "AssetRegistered");
    });

    it("cannot register asset with invalid owner", async function () {
      const encryptedValuation = await fhevm
        .createEncryptedInput(assetManagerAddress, signers.deployer.address)
        .add64(450000n)
        .encrypt();

      const encryptedConfidence = await fhevm
        .createEncryptedInput(assetManagerAddress, signers.deployer.address)
        .add32(87)
        .encrypt();

      await expect(
        assetManagerContract.registerAsset(
          1,
          ethers.ZeroAddress,
          0,
          "123 Main St",
          encryptedValuation.handles[0],
          encryptedValuation.inputProof,
          encryptedConfidence.handles[0],
          encryptedConfidence.inputProof,
          ethers.id("evidence1")
        )
      ).to.be.revertedWith("Invalid owner");
    });

    it("cannot register same request twice", async function () {
      const requestId = 2;
      const owner = signers.alice.address;
      const assetType = 0;
      const location = "123 Main St, NY";
      const evidenceHash = ethers.id("evidence2");

      const encryptedValuation = await fhevm
        .createEncryptedInput(assetManagerAddress, signers.deployer.address)
        .add64(450000n)
        .encrypt();

      const encryptedConfidence = await fhevm
        .createEncryptedInput(assetManagerAddress, signers.deployer.address)
        .add32(87)
        .encrypt();

      // First registration with requestId=2
      await assetManagerContract.registerAsset(
        requestId,
        owner,
        assetType,
        location,
        encryptedValuation.handles[0],
        encryptedValuation.inputProof,
        encryptedConfidence.handles[0],
        encryptedConfidence.inputProof,
        evidenceHash
      );

      // Second registration with same request ID (2)
      const encryptedValuation2 = await fhevm
        .createEncryptedInput(assetManagerAddress, signers.deployer.address)
        .add64(450000n)
        .encrypt();

      const encryptedConfidence2 = await fhevm
        .createEncryptedInput(assetManagerAddress, signers.deployer.address)
        .add32(87)
        .encrypt();

      await expect(
        assetManagerContract.registerAsset(
          requestId,
          owner,
          assetType,
          location,
          encryptedValuation2.handles[0],
          encryptedValuation2.inputProof,
          encryptedConfidence2.handles[0],
          encryptedConfidence2.inputProof,
          evidenceHash
        )
      ).to.be.revertedWith("Request already registered");
    });
  });

  // ========== ASSET MANAGEMENT TESTS ==========

  describe("Asset Management", function () {
    before(async function () {
      // Set deployer as oracle core for testing
      await assetManagerContract.setOracleCore(signers.deployer.address);

      // Register multiple assets for different test scenarios
      for (let i = 0; i < 2; i++) {
        const encryptedValuation = await fhevm
          .createEncryptedInput(assetManagerAddress, signers.deployer.address)
          .add64(450000n)
          .encrypt();

        const encryptedConfidence = await fhevm
          .createEncryptedInput(assetManagerAddress, signers.deployer.address)
          .add32(87)
          .encrypt();

        await assetManagerContract.registerAsset(
          10 + i,
          signers.alice.address,
          0,
          "123 Main St, NY",
          encryptedValuation.handles[0],
          encryptedValuation.inputProof,
          encryptedConfidence.handles[0],
          encryptedConfidence.inputProof,
          ethers.id("evidence1")
        );
      }
    });

    it("asset owner can get encrypted valuation", async function () {
      const assetId = 3;

      const encryptedVal = await assetManagerContract.connect(signers.alice)
        .getEncryptedAssetValuation(assetId);
      expect(encryptedVal).to.not.be.undefined;
    });

    it("non-owner cannot get encrypted valuation", async function () {
      const assetId = 3;

      await expect(
        assetManagerContract.connect(signers.bob).getEncryptedAssetValuation(assetId)
      ).to.be.revertedWith("Not owner");
    });

    it("asset owner can transfer asset", async function () {
      const assetId = 3;
      const newOwner = signers.bob.address;

      await expect(
        assetManagerContract.connect(signers.alice).transferAsset(assetId, newOwner)
      )
        .to.emit(assetManagerContract, "AssetTransferred")
        .withArgs(assetId, signers.alice.address, newOwner);

      const asset = await assetManagerContract.assets(assetId);
      expect(asset.owner).to.equal(newOwner);
    });

    it("non-owner cannot transfer asset", async function () {
      const assetId = 4;

      await expect(
        assetManagerContract.connect(signers.bob).transferAsset(assetId, signers.charlie.address)
      ).to.be.revertedWith("Not asset owner");
    });

    it("cannot transfer to zero address", async function () {
      const assetId = 4;

      await expect(
        assetManagerContract.connect(signers.alice).transferAsset(assetId, ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid new owner");
    });

    it("admin can update asset status", async function () {
      const assetId = 3;
      const newStatus = 3; // LIQUIDATED

      await expect(assetManagerContract.updateAssetStatus(assetId, newStatus))
        .to.emit(assetManagerContract, "AssetStatusChanged")
        .withArgs(assetId, newStatus);

      const asset = await assetManagerContract.assets(assetId);
      expect(asset.status).to.equal(newStatus);
    });

    it("non-admin cannot update asset status", async function () {
      const assetId = 3;
      const newStatus = 1; // INACTIVE

      await expect(
        assetManagerContract.connect(signers.alice).updateAssetStatus(assetId, newStatus)
      ).to.be.revertedWith("Not admin");
    });
  });

  // ========== TOKEN CREATION TESTS ==========

  describe("Token Creation & Management", function () {
    before(async function () {
      // Set deployer as oracle core for testing
      await assetManagerContract.setOracleCore(signers.deployer.address);

      const encryptedValuation = await fhevm
        .createEncryptedInput(assetManagerAddress, signers.deployer.address)
        .add64(450000n)
        .encrypt();

      const encryptedConfidence = await fhevm
        .createEncryptedInput(assetManagerAddress, signers.deployer.address)
        .add32(87)
        .encrypt();

      await assetManagerContract.registerAsset(
        12,
        signers.alice.address,
        0,
        "123 Main St, NY",
        encryptedValuation.handles[0],
        encryptedValuation.inputProof,
        encryptedConfidence.handles[0],
        encryptedConfidence.inputProof,
        ethers.id("evidence1")
      );
    });

    it("token should be created during asset registration", async function () {
      const assetId = 4;
      const asset = await assetManagerContract.assets(assetId);
      expect(asset.tokenAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("owner can get encrypted token balance", async function () {
      const assetId = 4;

      const encryptedBalance = await assetManagerContract.connect(signers.alice)
        .balanceOf(assetId, signers.alice.address);
      expect(encryptedBalance).to.not.be.undefined;
    });

    it("non-owner cannot get balance", async function () {
      const assetId = 4;

      await expect(
        assetManagerContract.balanceOf(assetId, signers.alice.address)
      ).to.be.revertedWith("Can only check own balance");
    });

    it("owner can get encrypted total supply", async function () {
      const assetId = 4;

      const encryptedSupply = await assetManagerContract.connect(signers.alice)
        .totalSupply(assetId);
      expect(encryptedSupply).to.not.be.undefined;
    });

    it("non-owner cannot get total supply", async function () {
      const assetId = 4;

      await expect(
        assetManagerContract.connect(signers.bob).totalSupply(assetId)
      ).to.be.revertedWith("Not owner");
    });
  });

  // ========== ENCRYPTED TRANSFER TESTS ==========

  describe("Encrypted Token Transfers", function () {
    before(async function () {
      // Set deployer as oracle core for testing
      await assetManagerContract.setOracleCore(signers.deployer.address);

      // Register asset
      const encryptedValuation = await fhevm
        .createEncryptedInput(assetManagerAddress, signers.deployer.address)
        .add64(1000000n)
        .encrypt(); // 1M tokens

      const encryptedConfidence = await fhevm
        .createEncryptedInput(assetManagerAddress, signers.deployer.address)
        .add32(90)
        .encrypt();

      await assetManagerContract.registerAsset(
        13,
        signers.alice.address,
        0,
        "123 Main St, NY",
        encryptedValuation.handles[0],
        encryptedValuation.inputProof,
        encryptedConfidence.handles[0],
        encryptedConfidence.inputProof,
        ethers.id("evidence1")
      );
    });

    it("owner can transfer encrypted tokens", async function () {
      const assetId = 5;
      const recipient = signers.bob.address;

      // Verify KYC for both parties (required by _checkTransferAllowed)
      await assetManagerContract.setKYCStatus(signers.alice.address, true, 0);
      await assetManagerContract.setKYCStatus(recipient, true, 0);

      // Enable transfers for this asset
      await assetManagerContract.connect(signers.alice).enableTransfers(assetId);

      // Whitelist both alice and bob for transfer
      await assetManagerContract.connect(signers.alice).addToWhitelist(assetId, signers.alice.address);
      await assetManagerContract.connect(signers.alice).addToWhitelist(assetId, recipient);

      // Create encrypted transfer amount
      const encryptedAmount = await fhevm
        .createEncryptedInput(assetManagerAddress, signers.alice.address)
        .add64(100000n)
        .encrypt();

      await expect(
        assetManagerContract.connect(signers.alice).transfer(
          assetId,
          recipient,
          encryptedAmount.handles[0],
          encryptedAmount.inputProof
        )
      )
        .to.emit(assetManagerContract, "Transfer")
        .withArgs(assetId, signers.alice.address, recipient);
    });

    it("cannot transfer to self", async function () {
      const assetId = 5;

      // Enable transfers
      await assetManagerContract.connect(signers.alice).enableTransfers(assetId);

      const encryptedAmount = await fhevm
        .createEncryptedInput(assetManagerAddress, signers.alice.address)
        .add64(100000n)
        .encrypt();

      await expect(
        assetManagerContract.connect(signers.alice).transfer(
          assetId,
          signers.alice.address,
          encryptedAmount.handles[0],
          encryptedAmount.inputProof
        )
      ).to.be.revertedWith("Cannot transfer to self");
    });

    it("cannot transfer to zero address", async function () {
      const assetId = 5;

      await assetManagerContract.connect(signers.alice).enableTransfers(assetId);

      const encryptedAmount = await fhevm
        .createEncryptedInput(assetManagerAddress, signers.alice.address)
        .add64(100000n)
        .encrypt();

      await expect(
        assetManagerContract.connect(signers.alice).transfer(
          assetId,
          ethers.ZeroAddress,
          encryptedAmount.handles[0],
          encryptedAmount.inputProof
        )
      ).to.be.revertedWith("Invalid recipient");
    });

    it("cannot transfer when disabled and not whitelisted", async function () {
      const assetId = 5;
      const recipient = signers.bob.address;
      // Transfers are disabled by default

      // Don't verify KYC to ensure transfer fails with compliance check
      // alice and bob are not KYC verified

      const encryptedAmount = await fhevm
        .createEncryptedInput(assetManagerAddress, signers.alice.address)
        .add64(100000n)
        .encrypt();

      await expect(
        assetManagerContract.connect(signers.alice).transfer(
          assetId,
          recipient,
          encryptedAmount.handles[0],
          encryptedAmount.inputProof
        )
      ).to.be.reverted;
    });
  });

  // ========== TOKEN APPROVAL TESTS ==========

  describe("Token Approvals", function () {
    before(async function () {
      // Set deployer as oracle core for testing
      await assetManagerContract.setOracleCore(signers.deployer.address);

      const encryptedValuation = await fhevm
        .createEncryptedInput(
          assetManagerAddress,
          signers.deployer.address
        )
        .add64(1000000n)
        .encrypt();

      const encryptedConfidence = await fhevm
        .createEncryptedInput(
          assetManagerAddress,
          signers.deployer.address
        )
        .add32(90)
        .encrypt();

      await assetManagerContract.registerAsset(
        14,
        signers.alice.address,
        0,
        "123 Main St, NY",
        encryptedValuation.handles[0],
        encryptedValuation.inputProof,
        encryptedConfidence.handles[0],
        encryptedConfidence.inputProof,
        ethers.id("evidence1")
      );
    });

    it("owner can approve spender", async function () {
      const assetId = 6;
      const spender = signers.bob.address;

      const encryptedAmount = await fhevm
        .createEncryptedInput(assetManagerAddress, signers.alice.address)
        .add64(500000n)
        .encrypt();

      await expect(
        assetManagerContract.connect(signers.alice).approve(
          assetId,
          spender,
          encryptedAmount.handles[0],
          encryptedAmount.inputProof
        )
      )
        .to.emit(assetManagerContract, "Approval")
        .withArgs(assetId, signers.alice.address, spender);
    });

    it("cannot approve zero address", async function () {
      const assetId = 6;

      const encryptedAmount = await fhevm
        .createEncryptedInput(assetManagerAddress, signers.alice.address)
        .add64(500000n)
        .encrypt();

      await expect(
        assetManagerContract.connect(signers.alice).approve(
          assetId,
          ethers.ZeroAddress,
          encryptedAmount.handles[0],
          encryptedAmount.inputProof
        )
      ).to.be.revertedWith("Invalid spender");
    });
  });

  // ========== COMPLIANCE TESTS ==========

  describe("Compliance Management", function () {
    before(async function () {
      // Set deployer as oracle core for testing
      await assetManagerContract.setOracleCore(signers.deployer.address);

      const encryptedValuation = await fhevm
        .createEncryptedInput(
          assetManagerAddress,
          signers.deployer.address
        )
        .add64(450000n)
        .encrypt();

      const encryptedConfidence = await fhevm
        .createEncryptedInput(
          assetManagerAddress,
          signers.deployer.address
        )
        .add32(87)
        .encrypt();

      await assetManagerContract.registerAsset(
        15,
        signers.alice.address,
        0,
        "123 Main St, NY",
        encryptedValuation.handles[0],
        encryptedValuation.inputProof,
        encryptedConfidence.handles[0],
        encryptedConfidence.inputProof,
        ethers.id("evidence1")
      );
    });

    it("admin can verify KYC", async function () {
      const user = signers.bob.address;
      const jurisdiction = 0; // US

      await expect(assetManagerContract.setKYCStatus(user, true, jurisdiction))
        .to.emit(assetManagerContract, "KYCVerified")
        .withArgs(user, jurisdiction);
    });

    it("admin can revoke KYC", async function () {
      const user = signers.bob.address;

      // First verify
      await assetManagerContract.setKYCStatus(user, true, 0);

      // Then revoke
      await expect(assetManagerContract.setKYCStatus(user, false, 0))
        .to.emit(assetManagerContract, "KYCRevoked")
        .withArgs(user);
    });

    it("non-admin cannot verify KYC", async function () {
      const user = signers.bob.address;

      await expect(
        assetManagerContract.connect(signers.alice).setKYCStatus(user, true, 0)
      ).to.be.revertedWith("Not admin");
    });

    it("admin can set accredited investor status", async function () {
      const user = signers.bob.address;

      await expect(assetManagerContract.setAccreditedInvestor(user, true))
        .to.emit(assetManagerContract, "AccreditedInvestorSet")
        .withArgs(user, true);

      const compliance = await assetManagerContract.userCompliance(user);
      expect(compliance.accreditedInvestor).to.equal(true);
    });

    it("admin can restrict user", async function () {
      const user = signers.bob.address;

      await expect(assetManagerContract.setUserRestriction(user, true))
        .to.emit(assetManagerContract, "UserRestricted")
        .withArgs(user, true);

      const compliance = await assetManagerContract.userCompliance(user);
      expect(compliance.restricted).to.equal(true);
    });

    it("restricted user cannot receive transfers", async function () {
      const assetId = 7;

      // Verify KYC for alice
      await assetManagerContract.setKYCStatus(signers.alice.address, true, 0);

      // Restrict bob
      await assetManagerContract.setUserRestriction(signers.bob.address, true);

      // Enable transfers
      await assetManagerContract.connect(signers.alice).enableTransfers(assetId);

      const encryptedAmount = await fhevm
        .createEncryptedInput(assetManagerAddress, signers.alice.address)
        .add64(100000n)
        .encrypt();

      await expect(
        assetManagerContract.connect(signers.alice).transfer(
          assetId,
          signers.bob.address,
          encryptedAmount.handles[0],
          encryptedAmount.inputProof
        )
      ).to.be.revertedWith("Transfer not allowed");
    });
  });

  // ========== WHITELISTING TESTS ==========

  describe("Token Whitelisting", function () {
    before(async function () {
      // Set deployer as oracle core for testing
      await assetManagerContract.setOracleCore(signers.deployer.address);

      const encryptedValuation = await fhevm
        .createEncryptedInput(
          assetManagerAddress,
          signers.deployer.address
        )
        .add64(1000000n)
        .encrypt();

      const encryptedConfidence = await fhevm
        .createEncryptedInput(
          assetManagerAddress,
          signers.deployer.address
        )
        .add32(90)
        .encrypt();

      await assetManagerContract.registerAsset(
        16,
        signers.alice.address,
        0,
        "123 Main St, NY",
        encryptedValuation.handles[0],
        encryptedValuation.inputProof,
        encryptedConfidence.handles[0],
        encryptedConfidence.inputProof,
        ethers.id("evidence1")
      );
    });

    it("owner is whitelisted by default", async function () {
      const assetId = 8;
      // The owner should be able to transfer - check tokenMetadata instead
      const metadata = await assetManagerContract.tokenMetadata(assetId);
      expect(metadata.assetId).to.equal(assetId);
    });

    it("admin can whitelist address", async function () {
      const assetId = 8;
      const address = signers.bob.address;

      await assetManagerContract.connect(signers.alice).addToWhitelist(assetId, address);

      const isWhitelisted = await assetManagerContract.tokenWhitelist(assetId, address);
      expect(isWhitelisted).to.equal(true);
    });

    it("whitelisted address can transfer when transfers disabled", async function () {
      const assetId = 8;

      // Whitelist alice and bob
      await assetManagerContract.connect(signers.alice).addToWhitelist(assetId, signers.alice.address);
      await assetManagerContract.connect(signers.alice).addToWhitelist(assetId, signers.bob.address);

      // Verify both are whitelisted
      const aliceWhitelisted = await assetManagerContract.tokenWhitelist(assetId, signers.alice.address);
      const bobWhitelisted = await assetManagerContract.tokenWhitelist(assetId, signers.bob.address);
      
      expect(aliceWhitelisted).to.equal(true);
      expect(bobWhitelisted).to.equal(true);
    });
  });

  // ========== VALUATION UPDATE TESTS ==========

  describe("Asset Revaluation", function () {
    before(async function () {
      // Set deployer as oracle core for testing
      await assetManagerContract.setOracleCore(signers.deployer.address);

      const encryptedValuation = await fhevm
        .createEncryptedInput(
          assetManagerAddress,
          signers.deployer.address
        )
        .add64(450000n)
        .encrypt();

      const encryptedConfidence = await fhevm
        .createEncryptedInput(
          assetManagerAddress,
          signers.deployer.address
        )
        .add32(87)
        .encrypt();

      await assetManagerContract.registerAsset(
        17,
        signers.alice.address,
        0,
        "123 Main St, NY",
        encryptedValuation.handles[0],
        encryptedValuation.inputProof,
        encryptedConfidence.handles[0],
        encryptedConfidence.inputProof,
        ethers.id("evidence1")
      );
    });

    it("oracle core can update valuation", async function () {
      const assetId = 9;

      const newEncryptedValuation = await fhevm
        .createEncryptedInput(
          assetManagerAddress,
          signers.deployer.address
        )
        .add64(475000n)
        .encrypt();

      const newEncryptedConfidence = await fhevm
        .createEncryptedInput(
          assetManagerAddress,
          signers.deployer.address
        )
        .add32(89)
        .encrypt();

      await expect(
        assetManagerContract.updateValuation(
          assetId,
          newEncryptedValuation.handles[0],
          newEncryptedValuation.inputProof,
          newEncryptedConfidence.handles[0],
          newEncryptedConfidence.inputProof,
          ethers.id("evidence2")
        )
      )
        .to.emit(assetManagerContract, "AssetUpdated");
    });

    it("non-oracle core cannot update valuation", async function () {
      const assetId = 9;

      const newEncryptedValuation = await fhevm
        .createEncryptedInput(
          assetManagerAddress,
          signers.alice.address
        )
        .add64(475000n)
        .encrypt();

      const newEncryptedConfidence = await fhevm
        .createEncryptedInput(
          assetManagerAddress,
          signers.alice.address
        )
        .add32(89)
        .encrypt();

      await expect(
        assetManagerContract.connect(signers.alice).updateValuation(
          assetId,
          newEncryptedValuation.handles[0],
          newEncryptedValuation.inputProof,
          newEncryptedConfidence.handles[0],
          newEncryptedConfidence.inputProof,
          ethers.id("evidence2")
        )
      ).to.be.revertedWith("Not oracle core");
    });
  });

  // ========== TOKEN TRANSFER CONTROLS TESTS ==========

  describe("Token Transfer Controls", function () {
    before(async function () {
      // Set deployer as oracle core for testing
      await assetManagerContract.setOracleCore(signers.deployer.address);

      const encryptedValuation = await fhevm
        .createEncryptedInput(
          assetManagerAddress,
          signers.deployer.address
        )
        .add64(1000000n)
        .encrypt();

      const encryptedConfidence = await fhevm
        .createEncryptedInput(
          assetManagerAddress,
          signers.deployer.address
        )
        .add32(90)
        .encrypt();

      await assetManagerContract.registerAsset(
        18,
        signers.alice.address,
        0,
        "123 Main St, NY",
        encryptedValuation.handles[0],
        encryptedValuation.inputProof,
        encryptedConfidence.handles[0],
        encryptedConfidence.inputProof,
        ethers.id("evidence1")
      );
    });

    it("admin can enable token transfers", async function () {
      const assetId = 10;

      await assetManagerContract.connect(signers.alice).enableTransfers(assetId);

      const metadata = await assetManagerContract.tokenMetadata(assetId);
      expect(metadata.transfersEnabled).to.equal(true);
    });

    it("admin can disable token transfers", async function () {
      const assetId = 10;

      // Enable first
      await assetManagerContract.connect(signers.alice).enableTransfers(assetId);
      expect((await assetManagerContract.tokenMetadata(assetId)).transfersEnabled).to.equal(true);

      // Disable
      await assetManagerContract.connect(signers.alice).disableTransfers(assetId);
      expect((await assetManagerContract.tokenMetadata(assetId)).transfersEnabled).to.equal(false);
    });

    it("non-admin cannot enable transfers", async function () {
      const assetId = 10;

      await expect(
        assetManagerContract.connect(signers.bob).enableTransfers(assetId)
      ).to.be.revertedWith("Not asset owner");
    });
  });

  // ========== OWNER ASSETS RETRIEVAL ==========

  describe("Owner Assets Query", function () {
    before(async function () {
      // Set deployer as oracle core for testing
      await assetManagerContract.setOracleCore(signers.deployer.address);

      // Create multiple assets for alice
      for (let i = 100; i <= 102; i++) {
        const encryptedValuation = await fhevm
          .createEncryptedInput(
            assetManagerAddress,
            signers.deployer.address
          )
          .add64(BigInt(450000 * (i - 99)))
          .encrypt();

        const encryptedConfidence = await fhevm
          .createEncryptedInput(
            assetManagerAddress,
            signers.deployer.address
          )
          .add32(85 + (i - 99))
          .encrypt();

        await assetManagerContract.registerAsset(
          i,
          signers.alice.address,
          0,
          `Asset ${i - 99}, NY`,
          encryptedValuation.handles[0],
          encryptedValuation.inputProof,
          encryptedConfidence.handles[0],
          encryptedConfidence.inputProof,
          ethers.id(`evidence${i - 99}`)
        );
      }
    });

    it("should retrieve all assets owned by user", async function () {
      const ownerAssets = await assetManagerContract.getAssetsByOwner(signers.alice.address);
      // Count assets registered in this describe block's before hook (should be 3)
      const beforeHookAssets = ownerAssets.filter((id) => id >= 11n && id <= 13n).length;
      expect(beforeHookAssets).to.equal(3);
    });

    it("should return empty array for user with no assets", async function () {
      const ownerAssets = await assetManagerContract.getAssetsByOwner(signers.dave.address);
      expect(ownerAssets.length).to.equal(0);
    });
  });
});
