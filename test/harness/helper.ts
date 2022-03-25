import { ethers } from "hardhat";
import { BigNumber, BigNumberish } from "ethers";

export const ZERO = BigNumber.from(0);
export const ONE = BigNumber.from(1);
export const TWO = BigNumber.from(2);
export const E18 = BigNumber.from(10).pow(18);
export const MAX_FEE = BigNumber.from(10000);
export const ONE_YEAR = BigNumber.from(60 * 60 * 24 * 365);
export const ONE_MONTH = BigNumber.from(60 * 60 * 24 * 30);

export const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

// Defaults to e18 using amount * 10^18
export function getBigNumber(amount: BigNumberish, decimals = 18): BigNumber {
  return BigNumber.from(amount).mul(BigNumber.from(10).pow(decimals));
}

export async function snapshot(): Promise<Number> {
  return ethers.provider.send("evm_snapshot", []);
}

export async function restore(snapshotId: any): Promise<Number> {
  return ethers.provider.send("evm_revert", [snapshotId]);
}

export function customError(errorName: string): string {
  return `VM Exception while processing transaction: reverted with custom error '${errorName}()'`;
}
