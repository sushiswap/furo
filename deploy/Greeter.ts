import { Greeter } from "../typechain";

export default async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const { address }: Greeter = await deploy("Greeter", {
    from: deployer,
    args: ["Hello, world!"],
  });

  console.log(`Greeter deployed to ${address}`);
};
