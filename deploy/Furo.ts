import { HardhatRuntimeEnvironment } from "hardhat/types";

const BENTO_ADDRESS = new Map();
const SUSHI_FACTORY = new Map();
const PAIR_CODE_HASH = new Map();
const WNATIVE = new Map();

BENTO_ADDRESS.set(42, "0x9A0D9920D92c178a58D99B455898Df2df22A2eE4");
SUSHI_FACTORY.set(42, "0xc35DADB65012eC5796536bD9864eD8773aBc74C4");
WNATIVE.set(42, "0xd0A1E359811322d97991E03f863a0C30C2cF029C");
PAIR_CODE_HASH.set(
  42,
  "0xe18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303"
);

export default async (hre: HardhatRuntimeEnvironment) => {
  const accounts = await hre.ethers.getSigners();
  const { deployments } = hre;
  const { deploy } = deployments;

  const chainId = Number(await hre.getChainId());

  const deployer = accounts[0].address;

  const furo = await deploy("FuroVesting", {
    from: deployer,
    args: [BENTO_ADDRESS.get(chainId), WNATIVE.get(chainId)],
  });

  console.log(`Furo deployed to ${furo.address}`);


  console.log(`Verifying Contracts...`);

  await hre.run("verify:verify", {
    address: furo.address,
    constructorArguments: [BENTO_ADDRESS.get(chainId), WNATIVE.get(chainId)],
  });

};
