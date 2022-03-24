// @ts-nocheck

import { BigNumber } from "@ethersproject/bignumber";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Furo } from "../../typechain";

interface StreamData {
  sender: string;
  recipient: string;
  token: string;
  depositedShares: BigNumber;
  withdrawnShares: BigNumber;
  startTime: BigNumber;
  endTime: BigNumber;
}

export async function snapshotStreamId(furo: Furo): Promise<BigNumber> {
  return furo.streamIds();
}

export async function snapshotStreamData(
  furo: Furo,
  streamId: BigNumber
): Promise<StreamData> {
  return furo.getStream(streamId);
}

export async function getStreamBalance(
  furo: Furo,
  streamId: BigNumber
): Promise<{ senderBalance: BigNumber; recipientBalance: BigNumber }> {
  return furo.streamBalanceOf(streamId);
}
