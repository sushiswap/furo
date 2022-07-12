import { HardhatRuntimeEnvironment } from "hardhat/types";

export default async (hre: HardhatRuntimeEnvironment) => {
  const accounts = await hre.ethers.getSigners();
  const { deployments } = hre;
  const { deploy } = deployments;

  const chainId = Number(await hre.getChainId());

  const deployer = accounts[0].address;

  const WETH = await deploy("ERC20Mock", {
    from: deployer,
    args: ["Wrapped ETH", "WETH", hre.ethers.utils.parseEther("1000000")]
  })

  console.log(`WETH deployed to ${WETH.address}`);

  const bentoBox = await deploy("BentoBoxV1", {
    from: deployer,
    args: [WETH.address]
  })

  console.log(`BentoBoxV1 deployed to ${bentoBox.address}`);

  const furoStream = await deploy("FuroStream", {
    from: deployer,
    args: [bentoBox.address, WETH.address],
  });

  console.log(`FuroStream deployed to ${furoStream.address}`);


  const furoVesting = await deploy("FuroVesting", {
    from: deployer,
    args: [bentoBox.address, WETH.address],
  });

  console.log(`FuroVesting deployed to ${furoVesting.address}`);

  // console.log(`Verifying Contracts...`);

  // await hre.run("verify:verify", {
  //   address: furo.address,
  //   constructorArguments: [BENTO_ADDRESS.get(chainId), WNATIVE.get(chainId)],
  // });

  // await hre.run("verify:verify", {
  //   address: swapReceiver.address,
  //   constructorArguments: [
  //     SUSHI_FACTORY.get(chainId),
  //     BENTO_ADDRESS.get(chainId),
  //     PAIR_CODE_HASH.get(chainId),
  //   ],
  // });
};
