import { HardhatRuntimeEnvironment } from "hardhat/types";

const BENTO_ADDRESS = new Map();
const SUSHI_FACTORY = new Map();
const PAIR_CODE_HASH = new Map();
const WNATIVE = new Map();

BENTO_ADDRESS.set(137, "0x0319000133d3AdA02600f0875d2cf03D442C3367");
SUSHI_FACTORY.set(137, "0xc35DADB65012eC5796536bD9864eD8773aBc74C4");
WNATIVE.set(137, "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270");
PAIR_CODE_HASH.set(
  137,
  "0xe18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303"
);

export default async (hre: HardhatRuntimeEnvironment) => {
  const accounts = await hre.ethers.getSigners();
  const { deployments } = hre;
  const { deploy } = deployments;

  const chainId = Number(await hre.getChainId());

  const deployer = accounts[0].address;

  const furo = await deploy("Furo", {
    from: deployer,
    args: [BENTO_ADDRESS.get(chainId), WNATIVE.get(chainId)],
  });

  console.log(`Furo deployed to ${furo.address}`);

  const swapReceiver = await deploy("SwapReceiver", {
    from: deployer,
    args: [
      SUSHI_FACTORY.get(chainId),
      BENTO_ADDRESS.get(chainId),
      PAIR_CODE_HASH.get(chainId),
    ],
  });

  console.log(`Swap Receiver to ${swapReceiver.address}`);

  console.log(`Whitelisting Swap Receiver...`);
  const furoContract = await hre.ethers.getContract("Furo");
  await furoContract.whitelistReceiver(swapReceiver.address, true);

  console.log(`Verifying Contracts...`);

  await hre.run("verify:verify", {
    address: furo.address,
    constructorArguments: [BENTO_ADDRESS.get(chainId), WNATIVE.get(chainId)],
  });

  await hre.run("verify:verify", {
    address: swapReceiver.address,
    constructorArguments: [
      SUSHI_FACTORY.get(chainId),
      BENTO_ADDRESS.get(chainId),
      PAIR_CODE_HASH.get(chainId),
    ],
  });
};
