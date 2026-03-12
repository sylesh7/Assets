import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { FHECounter } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  alice: HardhatEthersSigner;
};

describe("FHECounterSepolia", function () {
  let signers: Signers;
  let fheCounterContract: FHECounter;
  let fheCounterContractAddress: string;
  let step: number;
  let steps: number;

  function progress(message: string) {
    console.log(`${++step}/${steps} ${message}`);
  }

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    try {
      const deployment = await deployments.get("FHECounter");
      fheCounterContractAddress = deployment.address;

      fheCounterContract = await ethers.getContractAt(
        "FHECounter",
        fheCounterContractAddress
      );
    } catch (e) {
      (e as Error).message += ". Run: npx hardhat deploy --network sepolia";
      throw e;
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();

    signers = {
      alice: ethSigners[0],
    };
  });

  beforeEach(async () => {
    step = 0;
    steps = 0;
  });

  it("increment the counter by 1", async function () {
    steps = 8;
    this.timeout(4 * 60000);

    progress("Encrypting '0'...");

    const encryptedZero = await fhevm
      .createEncryptedInput(fheCounterContractAddress, signers.alice.address)
      .add32(0)
      .encrypt();

    progress("Calling increment(0)...");

    let tx = await fheCounterContract
      .connect(signers.alice)
      .increment(encryptedZero.handles[0], encryptedZero.inputProof);

    await tx.wait();

    progress("Reading encrypted count...");

    const encryptedCountBefore = await fheCounterContract.getCount();

    expect(encryptedCountBefore).to.not.equal(ethers.ZeroHash);

    progress("Decrypting count...");

    const clearCountBefore = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedCountBefore,
      fheCounterContractAddress,
      signers.alice
    );

    progress(`Count before increment = ${clearCountBefore}`);

    progress("Encrypting '1'...");

    const encryptedOne = await fhevm
      .createEncryptedInput(fheCounterContractAddress, signers.alice.address)
      .add32(1)
      .encrypt();

    progress("Calling increment(1)...");

    tx = await fheCounterContract
      .connect(signers.alice)
      .increment(encryptedOne.handles[0], encryptedOne.inputProof);

    await tx.wait();

    progress("Reading encrypted count after increment...");

    const encryptedCountAfter = await fheCounterContract.getCount();

    progress("Decrypting new count...");

    const clearCountAfter = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedCountAfter,
      fheCounterContractAddress,
      signers.alice
    );

    progress(`Count after increment = ${clearCountAfter}`);

    expect(Number(clearCountAfter) - Number(clearCountBefore)).to.equal(1);
  });
});