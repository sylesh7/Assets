import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedFHECounter = await deploy("FHECounter", {
    from: deployer,
    log: true,
  });

  console.log(`FHECounter contract: `, deployedFHECounter.address);

  const deployedRWAOracleCore = await deploy("RWAOracleCore", {
    from: deployer,
    log: true,
  });

  console.log(`RWAOracleCore contract: `, deployedRWAOracleCore.address);

  const deployedRWAAssetManager = await deploy("RWAAssetManager", {
    from: deployer,
    args: [deployedRWAOracleCore.address],
    log: true,
  });

  console.log(`RWAAssetManager contract: `, deployedRWAAssetManager.address);
};

export default func;
func.id = "deploy_rwaAssetManager"; // id required to prevent reexecution
func.tags = ["RWAAssetManager"];
