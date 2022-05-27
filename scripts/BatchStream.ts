const hre = require("hardhat");
import { ethers, utils } from "ethers";

const FURO_ADDRESS = "0x4F74B61f78179DA88C9507955d0d97Cf3B486ca5";
const BENTO_ADDRESS = "0xF5BCE5077908a1b7370B9ae04AdC565EBd643966";
const employees = ["0x4bb4c1B0745ef7B4642fEECcd0740deC417ca0a0"];
const amounts = [100];

const token = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

async function main() {
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: ["0x19B3Eb3Af5D93b77a5619b047De0EED7115A19e7"],
  });

  const signer = await hre.ethers.getSigner(
    "0x19B3Eb3Af5D93b77a5619b047De0EED7115A19e7"
  );

  const Furo = await hre.ethers.getContractFactory("FuroStream");
  const Bento = await hre.ethers.getContractFactory("BentoBoxV1");
  const furo = await Furo.attach("0x4F74B61f78179DA88C9507955d0d97Cf3B486ca5");
  const bento = await Bento.attach(BENTO_ADDRESS);

  await bento.connect(signer).whitelistMasterContract(FURO_ADDRESS, true);

  await bento
    .connect(signer)
    .setMasterContractApproval(
      signer.address,
      FURO_ADDRESS,
      true,
      0,
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );

  const USDC = await hre.ethers.getContractFactory("ERC20Mock");
  const usdc = await USDC.attach(token);

  await usdc
    .connect(signer)
    .approve(BENTO_ADDRESS, ethers.utils.parseEther("10000000000000000"));

  const streamDataForBatch = [];

  for (let i = 0; i < employees.length; i++) {
    streamDataForBatch[i] = Furo.interface.encodeFunctionData("createStream", [
      employees[i],
      token,
      1654188593, // 2 June 2022
      1685724593, // 2 June 2023
      ethers.utils.parseUnits(amounts[i].toString(), 6),
      false,
    ]);
  }

  console.log(streamDataForBatch);

//   await furo.connect(signer).batch(streamDataForBatch, true);

//   console.log(await furo.streams(1000));
//   console.log(await furo.ownerOf(1000));
//   console.log((await furo.streamIds()).toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
