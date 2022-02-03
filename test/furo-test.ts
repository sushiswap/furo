// @ts-nocheck

import { ethers } from "hardhat";
import { Signer, BigNumber } from "ethers";
import {
  toShare,
  toAmount,
  getBentoBalance,
  snapshotStreamData,
  snapshotStreamId,
  getBigNumber,
  snapshot,
  restore,
  getStreamBalance,
  latest,
  increase,
  duration,
  ADDRESS_ZERO,
  getSignedMasterContractApprovalData,
  customError,
} from "./harness";
import { expect } from "chai";

describe("Stream Creation", function () {
  let accounts: Signer[];

  let snapshotId;

  let bento;
  let furoStream;
  let tokens = [];

  let startTime;
  let endTime;

  before(async function () {
    accounts = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const BentoBoxV1 = await ethers.getContractFactory("BentoBoxV1");
    const FuroStream = await ethers.getContractFactory("FuroStream");

    let promises = [];
    for (let i = 0; i < 1; i++) {
      promises.push(
        ERC20.deploy("Token" + i, "TOK" + i, getBigNumber(1000000))
      );
    }

    tokens = await Promise.all(promises);
    bento = await BentoBoxV1.deploy(tokens[0].address);
    furoStream = await FuroStream.deploy(bento.address, tokens[0].address);

    await bento.whitelistMasterContract(furoStream.address, true);

    promises = [];
    for (let i = 0; i < tokens.length; i++) {
      promises.push(
        tokens[i].approve(bento.address, getBigNumber(1000000)).then(() => {
          bento.deposit(
            tokens[i].address,
            accounts[0].address,
            accounts[0].address,
            getBigNumber(500000),
            0
          );
        })
      );
    }

    await Promise.all(promises);
    await bento.setMasterContractApproval(
      accounts[0].address,
      furoStream.address,
      true,
      "0",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    await bento
      .connect(accounts[1])
      .setMasterContractApproval(
        accounts[1].address,
        furoStream.address,
        true,
        "0",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      );

    startTime = BigNumber.from(Math.floor(new Date().getTime() / 1000)).add(
      BigNumber.from(300)
    );
    endTime = startTime.add(BigNumber.from(3600));
  });

  beforeEach(async function () {
    snapshotId = await snapshot();
  });

  afterEach(async function () {
    await restore(snapshotId);
  });

  it("should be able to create stream - bento", async function () {
    const amount = getBigNumber(10000);
    const amountToShares = await toShare(bento, tokens[0], amount);

    const amountToDeposit = await toAmount(bento, tokens[0], amountToShares);

    const oldStreamId = await snapshotStreamId(furoStream);
    const bentoBalanceBefore = await getBentoBalance(
      bento,
      tokens[0],
      accounts[0].address
    );

    await furoStream.createStream(
      accounts[1].address,
      tokens[0].address,
      startTime,
      endTime,
      amountToDeposit,
      true
    );

    const newStreamId = await snapshotStreamId(furoStream);
    const newStreamData = await snapshotStreamData(furoStream, oldStreamId);
    const bentoBalanceAfter = await getBentoBalance(
      bento,
      tokens[0],
      accounts[0].address
    );

    const { senderBalance, recipientBalance } = await getStreamBalance(
      furoStream,
      oldStreamId
    );

    expect(oldStreamId.add(1)).to.be.eq(newStreamId);
    expect(newStreamData.sender).to.be.eq(accounts[0].address);
    expect(newStreamData.recipient).to.be.eq(accounts[1].address);
    expect(newStreamData.token).to.be.eq(tokens[0].address);
    expect(newStreamData.depositedShares).to.be.eq(amountToDeposit);
    expect(newStreamData.withdrawnShares).to.be.eq(BigNumber.from(0));
    expect(newStreamData.startTime).to.be.eq(startTime);
    expect(newStreamData.endTime).to.be.eq(endTime);
    expect(bentoBalanceBefore).to.be.eq(bentoBalanceAfter.add(amountToDeposit));
    expect(senderBalance).to.be.eq(amountToDeposit);
    expect(recipientBalance).to.be.eq(getBigNumber(0));
  });

  it("should be able to create stream - native", async function () {
    const amount = getBigNumber(10000);
    const amountToShares = await toShare(bento, tokens[0], amount);

    const amountToDeposit = await toAmount(bento, tokens[0], amountToShares);

    const oldStreamId = await snapshotStreamId(furoStream);
    const tokenBalanceBefore = await tokens[0].balanceOf(accounts[0].address);

    await furoStream.createStream(
      accounts[1].address,
      tokens[0].address,
      startTime,
      endTime,
      amountToDeposit,
      false
    );

    const newStreamId = await snapshotStreamId(furoStream);
    const newStreamData = await snapshotStreamData(furoStream, oldStreamId);
    const tokenBalanceAfter = await tokens[0].balanceOf(accounts[0].address);

    var { senderBalance, recipientBalance } = await getStreamBalance(
      furoStream,
      oldStreamId
    );

    expect(oldStreamId.add(1)).to.be.eq(newStreamId);
    expect(newStreamData.sender).to.be.eq(accounts[0].address);
    expect(newStreamData.recipient).to.be.eq(accounts[1].address);
    expect(newStreamData.token).to.be.eq(tokens[0].address);
    expect(newStreamData.depositedShares).to.be.eq(amountToDeposit);
    expect(newStreamData.withdrawnShares).to.be.eq(BigNumber.from(0));
    expect(newStreamData.startTime).to.be.eq(startTime);
    expect(newStreamData.endTime).to.be.eq(endTime);
    expect(tokenBalanceBefore).to.be.eq(tokenBalanceAfter.add(amountToDeposit));
    expect(senderBalance).to.be.eq(amountToDeposit);
    expect(recipientBalance).to.be.eq(getBigNumber(0));
  });

  it("should allow sender to be updated", async function () {
    const amount = getBigNumber(10000);
    const amountToShares = await toShare(bento, tokens[0], amount);
    const amountToDeposit = await toAmount(bento, tokens[0], amountToShares);

    const oldStreamId = await snapshotStreamId(furoStream);

    await furoStream.createStream(
      accounts[1].address,
      tokens[0].address,
      startTime,
      endTime,
      amountToDeposit,
      false
    );

    await furoStream.updateSender(oldStreamId, accounts[2].address);

    const newStreamData = await snapshotStreamData(furoStream, oldStreamId);

    expect(newStreamData.sender).to.be.eq(accounts[2].address);
  });

  it("should not allow sender to be updated", async function () {
    const amount = getBigNumber(10000);
    const amountToShares = await toShare(bento, tokens[0], amount);
    const amountToDeposit = await toAmount(bento, tokens[0], amountToShares);

    const oldStreamId = await snapshotStreamId(furoStream);

    await furoStream.createStream(
      accounts[1].address,
      tokens[0].address,
      startTime,
      endTime,
      amountToDeposit,
      false
    );

    await expect(
      furoStream.connect(accounts[1]).updateSender(oldStreamId, accounts[2].address)
    ).to.be.revertedWith(customError("NotSender"));
  });

  it("should not be able create stream when startTime is less than block.timestamp", async function () {
    const startTime = await latest();
    const endTime = startTime.add(BigNumber.from(3600));

    const amount = getBigNumber(10000);
    const amountToShares = await toShare(bento, tokens[0], amount);

    const amountToDeposit = amountToShares;

    await expect(
      furoStream.createStream(
        accounts[1].address,
        tokens[0].address,
        startTime,
        endTime,
        amountToDeposit,
        true
      )
    ).to.be.revertedWith(customError("InvalidStartTime"));
  });

  it("should not be able create stream when endTime is less than startTime", async function () {
    await expect(
      furoStream.createStream(
        accounts[1].address,
        tokens[0].address,
        startTime,
        startTime,
        getBigNumber(1000),
        true
      )
    ).to.be.revertedWith(customError("InvalidEndTime"));
  });
});

describe("Stream Creation via Native Token", function () {
  let accounts: Signer[];

  let snapshotId;

  let bento;
  let furoStream;
  let weth;
  let tokens = [];

  let startTime;
  let endTime;

  before(async function () {
    accounts = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const BentoBoxV1 = await ethers.getContractFactory("BentoBoxV1");
    const FuroStream = await ethers.getContractFactory("FuroStream");

    let promises = [];
    for (let i = 0; i < 1; i++) {
      promises.push(
        ERC20.deploy("Token" + i, "TOK" + i, getBigNumber(1000000))
      );
    }

    weth = await ERC20.deploy("WETH9", "WETH", getBigNumber(1000000));
    tokens = await Promise.all(promises);
    bento = await BentoBoxV1.deploy(weth.address);
    furoStream = await FuroStream.deploy(bento.address, weth.address);
    await weth.approve(bento.address, getBigNumber(1000000));
    await bento.deposit(
      weth.address,
      accounts[0].address,
      accounts[0].address,
      getBigNumber(500000),
      0
    );

    await bento.whitelistMasterContract(furoStream.address, true);

    promises = [];
    for (let i = 0; i < tokens.length; i++) {
      promises.push(
        tokens[i].approve(bento.address, getBigNumber(1000000)).then(() => {
          bento.deposit(
            tokens[i].address,
            accounts[0].address,
            accounts[0].address,
            getBigNumber(500000),
            0
          );
        })
      );
    }

    await Promise.all(promises);
    await bento.setMasterContractApproval(
      accounts[0].address,
      furoStream.address,
      true,
      "0",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    await bento
      .connect(accounts[1])
      .setMasterContractApproval(
        accounts[1].address,
        furoStream.address,
        true,
        "0",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      );

    startTime = BigNumber.from(Math.floor(new Date().getTime() / 1000)).add(
      BigNumber.from(300)
    );
    endTime = startTime.add(BigNumber.from(3600));
  });

  beforeEach(async function () {
    snapshotId = await snapshot();
  });

  afterEach(async function () {
    await restore(snapshotId);
  });

  it("should be able to create stream - bento - native token", async function () {
    const amount = getBigNumber(10);
    const amountToShares = await toShare(bento, weth, amount);

    const amountToDeposit = await toAmount(bento, weth, amountToShares);
    const oldStreamId = await snapshotStreamId(furoStream);
    const bentoBalanceBefore = await getBentoBalance(
      bento,
      weth,
      accounts[0].address
    );

    await furoStream.createStream(
      accounts[1].address,
      weth.address,
      startTime,
      endTime,
      amountToDeposit,
      true
    );

    const newStreamId = await snapshotStreamId(furoStream);
    const newStreamData = await snapshotStreamData(furoStream, oldStreamId);
    const bentoBalanceAfter = await getBentoBalance(
      bento,
      weth,
      accounts[0].address
    );

    const { senderBalance, recipientBalance } = await getStreamBalance(
      furoStream,
      oldStreamId
    );

    expect(oldStreamId.add(1)).to.be.eq(newStreamId);
    expect(newStreamData.sender).to.be.eq(accounts[0].address);
    expect(newStreamData.recipient).to.be.eq(accounts[1].address);
    expect(newStreamData.token).to.be.eq(weth.address);
    expect(newStreamData.depositedShares).to.be.eq(amountToDeposit);
    expect(newStreamData.withdrawnShares).to.be.eq(BigNumber.from(0));
    expect(newStreamData.startTime).to.be.eq(startTime);
    expect(newStreamData.endTime).to.be.eq(endTime);
    expect(bentoBalanceBefore).to.be.eq(bentoBalanceAfter.add(amountToDeposit));
    expect(senderBalance).to.be.eq(amountToDeposit);
    expect(recipientBalance).to.be.eq(getBigNumber(0));
  });

  it("should be able to create stream - native - native token", async function () {
    const amount = getBigNumber(10);
    const amountToShares = await toShare(bento, weth, amount);

    const amountToDeposit = await toAmount(bento, weth, amountToShares);

    const oldStreamId = await snapshotStreamId(furoStream);
    const tokenBalanceBefore = await weth.balanceOf(accounts[0].address);

    await furoStream.createStream(
      accounts[1].address,
      weth.address,
      startTime,
      endTime,
      amountToDeposit,
      false,
      { value: amountToDeposit }
    );

    const newStreamId = await snapshotStreamId(furoStream);
    const newStreamData = await snapshotStreamData(furoStream, oldStreamId);
    const tokenBalanceAfter = await weth.balanceOf(accounts[0].address);

    var { senderBalance, recipientBalance } = await getStreamBalance(
      furoStream,
      oldStreamId
    );

    expect(oldStreamId.add(1)).to.be.eq(newStreamId);
    expect(newStreamData.sender).to.be.eq(accounts[0].address);
    expect(newStreamData.recipient).to.be.eq(accounts[1].address);
    expect(newStreamData.token).to.be.eq(weth.address);
    expect(newStreamData.depositedShares).to.be.eq(amountToDeposit);
    expect(newStreamData.withdrawnShares).to.be.eq(BigNumber.from(0));
    expect(newStreamData.startTime).to.be.eq(startTime);
    expect(newStreamData.endTime).to.be.eq(endTime);
    expect(tokenBalanceBefore).to.be.eq(tokenBalanceAfter);
    expect(senderBalance).to.be.eq(amountToDeposit);
    expect(recipientBalance).to.be.eq(getBigNumber(0));
  });
});

describe("Stream Balances", function () {
  let accounts: Signer[];

  let snapshotId;

  let bento;
  let furoStream;
  let tokens = [];

  let startTime;
  let endTime;
  let streamId;
  let amountToDeposit;

  before(async function () {
    accounts = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const BentoBoxV1 = await ethers.getContractFactory("BentoBoxV1");
    const FuroStream = await ethers.getContractFactory("FuroStream");

    let promises = [];
    for (let i = 0; i < 1; i++) {
      promises.push(
        ERC20.deploy("Token" + i, "TOK" + i, getBigNumber(1000000))
      );
    }

    tokens = await Promise.all(promises);
    bento = await BentoBoxV1.deploy(tokens[0].address);
    furoStream = await FuroStream.deploy(bento.address, tokens[0].address);

    await bento.whitelistMasterContract(furoStream.address, true);

    promises = [];
    for (let i = 0; i < tokens.length; i++) {
      promises.push(
        tokens[i].approve(bento.address, getBigNumber(1000000)).then(() => {
          bento.deposit(
            tokens[i].address,
            accounts[0].address,
            accounts[0].address,
            getBigNumber(500000),
            0
          );
        })
      );
    }
    await Promise.all(promises);
    await bento.setMasterContractApproval(
      accounts[0].address,
      furoStream.address,
      true,
      "0",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    await bento
      .connect(accounts[1])
      .setMasterContractApproval(
        accounts[1].address,
        furoStream.address,
        true,
        "0",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      );

    startTime = BigNumber.from(Math.floor(new Date().getTime() / 1000)).add(
      BigNumber.from(300)
    );
    endTime = startTime.add(BigNumber.from(3600));

    const amount = getBigNumber(10000);
    const amountToShares = await toShare(bento, tokens[0], amount);

    amountToDeposit = await toAmount(bento, tokens[0], amountToShares);

    streamId = (await snapshotStreamId(furoStream)).toString();

    await furoStream.createStream(
      accounts[1].address,
      tokens[0].address,
      startTime,
      endTime,
      amountToDeposit,
      true
    );
  });

  beforeEach(async function () {
    snapshotId = await snapshot();
  });

  afterEach(async function () {
    await restore(snapshotId);
  });

  it("should report correct balance before the start of stream", async function () {
    const { senderBalance, recipientBalance } = await getStreamBalance(
      furoStream,
      streamId
    );
    expect(senderBalance).to.be.eq(amountToDeposit);
    expect(recipientBalance).to.be.eq(getBigNumber(0));
  });

  it("should report correct balance at just the start of the stream", async function () {
    const timeNow = await latest();
    const differnceInTime = startTime.sub(timeNow);
    await increase(duration.seconds(differnceInTime.toNumber()));
    const { senderBalance, recipientBalance } = await getStreamBalance(
      furoStream,
      streamId
    );
    expect(senderBalance).to.be.eq(amountToDeposit);
    expect(recipientBalance).to.be.eq(getBigNumber(0));
  });

  it("should report correct balance after one second from the start of the stream", async function () {
    const streamData = await snapshotStreamData(furoStream, streamId);
    const timeNow = await latest();
    const differnceInTime = startTime.sub(timeNow).add(1);
    await increase(duration.seconds(differnceInTime.toNumber()));
    const { senderBalance, recipientBalance } = await getStreamBalance(
      furoStream,
      streamId
    );
    const amountToBeStreamed = streamData.depositedShares
      .mul((await latest()) - streamData.startTime)
      .div(streamData.endTime - streamData.startTime);
    expect(senderBalance).to.be.eq(amountToDeposit.sub(amountToBeStreamed));
    expect(recipientBalance).to.be.eq(amountToBeStreamed);
  });

  it("should report correct balance after x second from the start of the stream", async function () {
    const streamData = await snapshotStreamData(furoStream, streamId);
    const timeNow = await latest();
    const randSec = Math.floor(
      Math.random() * (endTime - startTime) + startTime
    );
    const differnceInTime = startTime.sub(timeNow).add(randSec);
    await increase(duration.seconds(differnceInTime.toNumber()));
    const { senderBalance, recipientBalance } = await getStreamBalance(
      furoStream,
      streamId
    );
    const amountToBeStreamed = streamData.depositedShares
      .mul((await latest()) - streamData.startTime)
      .div(streamData.endTime - streamData.startTime);
    expect(senderBalance).to.be.eq(amountToDeposit.sub(amountToBeStreamed));
    expect(recipientBalance).to.be.eq(amountToBeStreamed);
  });

  it("should report correct balance at the endTime", async function () {
    const timeNow = await latest();
    const differnceInTime = endTime.sub(timeNow);
    await increase(duration.seconds(differnceInTime.toNumber()));
    const { senderBalance, recipientBalance } = await getStreamBalance(
      furoStream,
      streamId
    );
    expect(senderBalance).to.be.eq(0);
    expect(recipientBalance).to.be.eq(amountToDeposit);
  });

  it("should report correct balance after endTime 1 second has passed", async function () {
    const timeNow = await latest();
    const differnceInTime = endTime.sub(timeNow).add(1);
    await increase(duration.seconds(differnceInTime.toNumber()));
    const { senderBalance, recipientBalance } = await getStreamBalance(
      furoStream,
      streamId
    );
    expect(senderBalance).to.be.eq(0);
    expect(recipientBalance).to.be.eq(amountToDeposit);
  });

  it("should report correct balance after endTime x second has passed", async function () {
    const timeNow = await latest();
    const randSec = Math.floor(
      Math.random() * (endTime - startTime) + startTime
    );
    const differnceInTime = endTime.sub(timeNow).add(randSec);
    await increase(duration.seconds(differnceInTime.toNumber()));
    const { senderBalance, recipientBalance } = await getStreamBalance(
      furoStream,
      streamId
    );
    expect(senderBalance).to.be.eq(0);
    expect(recipientBalance).to.be.eq(amountToDeposit);
  });
});

describe("Stream Withdraw", function () {
  let accounts: Signer[];

  let snapshotId;

  let bento;
  let furoStream;
  let tokens = [];
  let tasker;

  let startTime;
  let endTime;
  let streamId;
  let amountToDeposit;

  before(async function () {
    accounts = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const BentoBoxV1 = await ethers.getContractFactory("BentoBoxV1");
    const FuroStream = await ethers.getContractFactory("FuroStream");
    const Tasker = await ethers.getContractFactory("TaskReceiverMock");

    let promises = [];
    for (let i = 0; i < 1; i++) {
      promises.push(
        ERC20.deploy("Token" + i, "TOK" + i, getBigNumber(1000000))
      );
    }

    tokens = await Promise.all(promises);
    bento = await BentoBoxV1.deploy(tokens[0].address);
    furoStream = await FuroStream.deploy(bento.address, tokens[0].address);
    tasker = await Tasker.deploy();

    await bento.whitelistMasterContract(furoStream.address, true);

    promises = [];
    for (let i = 0; i < tokens.length; i++) {
      promises.push(
        tokens[i].approve(bento.address, getBigNumber(1000000)).then(() => {
          bento.deposit(
            tokens[i].address,
            accounts[0].address,
            accounts[0].address,
            getBigNumber(500000),
            0
          );
        })
      );
    }
    await Promise.all(promises);
    await bento.setMasterContractApproval(
      accounts[0].address,
      furoStream.address,
      true,
      "0",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    await bento
      .connect(accounts[1])
      .setMasterContractApproval(
        accounts[1].address,
        furoStream.address,
        true,
        "0",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      );

    startTime = BigNumber.from(Math.floor(new Date().getTime() / 1000)).add(
      BigNumber.from(300)
    );
    endTime = startTime.add(BigNumber.from(3600));

    const amount = getBigNumber(10000);
    const amountToShares = await toShare(bento, tokens[0], amount);

    amountToDeposit = await toAmount(bento, tokens[0], amountToShares);

    streamId = (await snapshotStreamId(furoStream)).toString();

    await furoStream.createStream(
      accounts[1].address,
      tokens[0].address,
      startTime,
      endTime,
      amountToDeposit,
      true
    );
  });

  beforeEach(async function () {
    snapshotId = await snapshot();
  });

  afterEach(async function () {
    await restore(snapshotId);
  });

  it("should let user withdraw at the start of the stream", async function () {
    const recipientOldBentoBalance = await getBentoBalance(
      bento,
      tokens[0],
      accounts[1].address
    );

    await furoStream.withdrawFromStream(streamId, 0, ADDRESS_ZERO, true, "0x");

    const recipientNewBentoBalance = await getBentoBalance(
      bento,
      tokens[0],
      accounts[1].address
    );

    expect(recipientNewBentoBalance).to.be.eq(recipientOldBentoBalance);
  });

  it("should only allow sender or recipient to withdraw", async function () {
    await expect(
      furoStream
        .connect(accounts[2])
        .withdrawFromStream(streamId, 0, ADDRESS_ZERO, true, "0x")
    ).to.be.revertedWith(customError("NotSenderOrRecipient"));

    await furoStream
      .connect(accounts[0])
      .withdrawFromStream(streamId, 0, ADDRESS_ZERO, true, "0x");
    await furoStream
      .connect(accounts[1])
      .withdrawFromStream(streamId, 0, ADDRESS_ZERO, true, "0x");
  });

  it("should allow to run task", async function () {
    await furoStream
      .connect(accounts[1])
      .withdrawFromStream(streamId, 0, tasker.address, true, "0x00");
  });

  it("should allow to withdraw after x time from start of stream - bento", async function () {
    const streamData = await snapshotStreamData(furoStream, streamId);
    const timeNow = await latest();
    const randSec = Math.floor(
      Math.random() * (endTime - startTime) + startTime
    );
    const differnceInTime = startTime.sub(timeNow).add(randSec);
    await increase(duration.seconds(differnceInTime));
    const amountToWithdraw = streamData.depositedShares
      .mul((await latest()) - streamData.startTime)
      .div(streamData.endTime - streamData.startTime);
    const recipientOldBentoBalance = await getBentoBalance(
      bento,
      tokens[0],
      streamData.recipient
    );

    await furoStream.withdrawFromStream(
      streamId,
      amountToWithdraw,
      ADDRESS_ZERO,
      true,
      "0x"
    );

    const recipientNewBentoBalance = await getBentoBalance(
      bento,
      tokens[0],
      streamData.recipient
    );

    const streamDataNew = await snapshotStreamData(furoStream, streamId);

    expect(recipientNewBentoBalance).to.be.eq(
      recipientOldBentoBalance.add(amountToWithdraw)
    );
    expect(streamDataNew.withdrawnShares).to.be.eq(
      streamData.withdrawnShares.add(amountToWithdraw)
    );
  });

  it("should allow to withdraw after x time from start of stream - native", async function () {
    const streamData = await snapshotStreamData(furoStream, streamId);
    const timeNow = await latest();
    const randSec = Math.floor(
      Math.random() * (endTime - startTime) + startTime
    );
    const differnceInTime = startTime.sub(timeNow).add(randSec);
    await increase(duration.seconds(differnceInTime));
    const amountToWithdraw = streamData.depositedShares
      .mul((await latest()) - streamData.startTime)
      .div(streamData.endTime - streamData.startTime);
    const recipientOldBalance = await tokens[0].balanceOf(streamData.recipient);

    await furoStream.withdrawFromStream(
      streamId,
      amountToWithdraw,
      ADDRESS_ZERO,
      false,
      "0x"
    );

    const recipientNewBalance = await tokens[0].balanceOf(streamData.recipient);

    const streamDataNew = await snapshotStreamData(furoStream, streamId);

    expect(recipientNewBalance).to.be.eq(
      recipientOldBalance.add(amountToWithdraw)
    );
    expect(streamDataNew.withdrawnShares).to.be.eq(
      streamData.withdrawnShares.add(amountToWithdraw)
    );
  });

  it("should allow to withdraw at the endTime of the stream", async function () {
    const streamData = await snapshotStreamData(furoStream, streamId);
    const timeNow = await latest();
    const differnceInTime = endTime.sub(timeNow);
    await increase(duration.seconds(differnceInTime.toNumber()));
    await furoStream.withdrawFromStream(
      streamId,
      streamData.depositedShares,
      ADDRESS_ZERO,
      true,
      "0x"
    );
    const { senderBalance, recipientBalance } = await getStreamBalance(
      furoStream,
      streamId
    );
    const streamDataNew = await snapshotStreamData(furoStream, streamId);
    expect(streamData.depositedShares).to.be.eq(streamDataNew.withdrawnShares);
    expect(
      await getBentoBalance(bento, tokens[0], streamDataNew.recipient)
    ).to.be.eq(streamDataNew.depositedShares);
    expect(senderBalance).to.be.eq(0);
    expect(recipientBalance).to.be.eq(0);
  });

  it("should not allow to withdraw more after completely withdrawn", async function () {
    const streamData = await snapshotStreamData(furoStream, streamId);
    const timeNow = await latest();
    const differnceInTime = endTime.sub(timeNow);
    await increase(duration.seconds(differnceInTime.toNumber()));
    await furoStream.withdrawFromStream(
      streamId,
      streamData.depositedShares,
      ADDRESS_ZERO,
      true,
      "0x"
    );
    await expect(
      furoStream.withdrawFromStream(streamId, 1, ADDRESS_ZERO, true, "0x")
    ).to.be.revertedWith(customError("InvalidWithdrawTooMuch"));

    const { senderBalance, recipientBalance } = await getStreamBalance(
      furoStream,
      streamId
    );
    const streamDataNew = await snapshotStreamData(furoStream, streamId);
    expect(streamData.depositedShares).to.be.eq(streamDataNew.withdrawnShares);
    expect(
      await getBentoBalance(bento, tokens[0], streamDataNew.recipient)
    ).to.be.eq(streamDataNew.depositedShares);
    expect(senderBalance).to.be.eq(0);
    expect(recipientBalance).to.be.eq(0);
  });

  it("should not allow to withdraw more than available", async function () {
    const streamData = await snapshotStreamData(furoStream, streamId);
    const timeNow = await latest();
    const differnceInTime = startTime.sub(timeNow);
    await increase(duration.seconds(differnceInTime));
    await expect(
      furoStream.withdrawFromStream(
        streamId,
        streamData.depositedShares,
        ADDRESS_ZERO,
        true,
        "0x"
      )
    ).to.be.revertedWith(customError("InvalidWithdrawTooMuch"));
  });

  it("should allow to withdrawTo if called by recipient only", async function () {
    const streamData = await snapshotStreamData(furoStream, streamId);
    const timeNow = await latest();
    const differnceInTime = endTime.sub(timeNow);

    await increase(duration.seconds(differnceInTime.toNumber()));

    await furoStream
      .connect(accounts[1])
      .withdrawFromStream(
        streamId,
        streamData.depositedShares,
        accounts[2].address,
        true,
        "0x"
      );

    const { senderBalance, recipientBalance } = await getStreamBalance(
      furoStream,
      streamId
    );
    const streamDataNew = await snapshotStreamData(furoStream, streamId);
    expect(streamData.depositedShares).to.be.eq(streamDataNew.withdrawnShares);
    expect(
      await getBentoBalance(bento, tokens[0], accounts[2].address)
    ).to.be.eq(streamDataNew.depositedShares);
    expect(senderBalance).to.be.eq(0);
    expect(recipientBalance).to.be.eq(0);
  });

  it("should ignore withdrawTo if set by the sender", async function () {
    const streamData = await snapshotStreamData(furoStream, streamId);
    const timeNow = await latest();
    const differnceInTime = endTime.sub(timeNow);

    await increase(duration.seconds(differnceInTime.toNumber()));

    await furoStream
      .connect(accounts[0])
      .withdrawFromStream(
        streamId,
        streamData.depositedShares,
        accounts[2].address,
        true,
        "0x"
      );

    const { senderBalance, recipientBalance } = await getStreamBalance(
      furoStream,
      streamId
    );
    const streamDataNew = await snapshotStreamData(furoStream, streamId);
    expect(streamData.depositedShares).to.be.eq(streamDataNew.withdrawnShares);
    expect(
      await getBentoBalance(bento, tokens[0], streamData.recipient)
    ).to.be.eq(streamDataNew.depositedShares);
    expect(senderBalance).to.be.eq(0);
    expect(recipientBalance).to.be.eq(0);
  });
});

describe("Stream Cancel", function () {
  let accounts: Signer[];

  let snapshotId;

  let bento;
  let furoStream;
  let tokens = [];

  let startTime;
  let endTime;
  let streamId;
  let amountToDeposit;

  before(async function () {
    accounts = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const BentoBoxV1 = await ethers.getContractFactory("BentoBoxV1");
    const FuroStream = await ethers.getContractFactory("FuroStream");

    let promises = [];
    for (let i = 0; i < 1; i++) {
      promises.push(
        ERC20.deploy("Token" + i, "TOK" + i, getBigNumber(1000000))
      );
    }

    tokens = await Promise.all(promises);
    bento = await BentoBoxV1.deploy(tokens[0].address);
    furoStream = await FuroStream.deploy(bento.address, tokens[0].address);

    await bento.whitelistMasterContract(furoStream.address, true);

    promises = [];
    for (let i = 0; i < tokens.length; i++) {
      promises.push(
        tokens[i].approve(bento.address, getBigNumber(1000000)).then(() => {
          bento.deposit(
            tokens[i].address,
            accounts[0].address,
            accounts[0].address,
            getBigNumber(500000),
            0
          );
        })
      );
    }
    await Promise.all(promises);
    await bento.setMasterContractApproval(
      accounts[0].address,
      furoStream.address,
      true,
      "0",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    await bento
      .connect(accounts[1])
      .setMasterContractApproval(
        accounts[1].address,
        furoStream.address,
        true,
        "0",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      );

    startTime = BigNumber.from(Math.floor(new Date().getTime() / 1000)).add(
      BigNumber.from(300)
    );
    endTime = startTime.add(BigNumber.from(3600));

    const amount = getBigNumber(10000);
    const amountToShares = await toShare(bento, tokens[0], amount);

    amountToDeposit = await toAmount(bento, tokens[0], amountToShares);

    streamId = (await snapshotStreamId(furoStream)).toString();

    await furoStream.createStream(
      accounts[1].address,
      tokens[0].address,
      startTime,
      endTime,
      amountToDeposit,
      true
    );
  });

  beforeEach(async function () {
    snapshotId = await snapshot();
  });

  afterEach(async function () {
    await restore(snapshotId);
  });

  it("should only allow sender or recipient to cancel the stream", async function () {
    await expect(
      furoStream.connect(accounts[2]).cancelStream(streamId, true)
    ).to.be.revertedWith(customError("NotSenderOrRecipient"));
  });

  it("should cancel stream after x time and distribute correct amounts - bento", async function () {
    const streamData = await snapshotStreamData(furoStream, streamId);
    const timeNow = await latest();
    const randSec = Math.floor(
      Math.random() * (endTime - startTime) + startTime
    );
    const differnceInTime = startTime.sub(timeNow).add(randSec);
    await increase(duration.seconds(differnceInTime.toNumber()));

    const senderBentoBefore = await getBentoBalance(
      bento,
      tokens[0],
      streamData.sender
    );
    const recipientBentoBefore = await getBentoBalance(
      bento,
      tokens[0],
      streamData.recipient
    );

    await furoStream.cancelStream(streamId, true);

    const recipientBalance = streamData.depositedShares
      .mul((await latest()) - streamData.startTime)
      .div(streamData.endTime - streamData.startTime);
    const senderBalance = streamData.depositedShares.sub(recipientBalance);

    const senderBentoAfter = await getBentoBalance(
      bento,
      tokens[0],
      streamData.sender
    );
    const recipientBentoAfter = await getBentoBalance(
      bento,
      tokens[0],
      streamData.recipient
    );

    expect(senderBentoAfter).to.be.eq(senderBentoBefore.add(senderBalance));
    expect(recipientBentoAfter).to.be.eq(
      recipientBentoBefore.add(recipientBalance)
    );
  });

  it("should cancel stream after x time and distribute correct amounts - native", async function () {
    const streamData = await snapshotStreamData(furoStream, streamId);
    const timeNow = await latest();
    const randSec = Math.floor(
      Math.random() * (endTime - startTime) + startTime
    );
    const differnceInTime = startTime.sub(timeNow).add(randSec);
    await increase(duration.seconds(differnceInTime.toNumber()));

    const senderBalanceBefore = await tokens[0].balanceOf(streamData.sender);
    const recipientBalanceBefore = await tokens[0].balanceOf(
      streamData.recipient
    );

    await furoStream.cancelStream(streamId, false);
    const recipientBalance = streamData.depositedShares
      .mul((await latest()) - streamData.startTime)
      .div(streamData.endTime - streamData.startTime);
    const senderBalance = streamData.depositedShares.sub(recipientBalance);

    const senderBalanceAfter = await tokens[0].balanceOf(streamData.sender);
    const recipientBalanceAfter = await tokens[0].balanceOf(
      streamData.recipient
    );

    expect(senderBalanceAfter).to.be.eq(senderBalanceBefore.add(senderBalance));
    expect(recipientBalanceAfter).to.be.eq(
      recipientBalanceBefore.add(recipientBalance)
    );
  });

  it("should allow to cancel stream before the startTime", async function () {
    const streamData = await snapshotStreamData(furoStream, streamId);
    const timeNow = await latest();

    const differnceInTime = startTime.sub(timeNow);
    await increase(duration.seconds(differnceInTime.toNumber()));

    const senderBentoBefore = await getBentoBalance(
      bento,
      tokens[0],
      streamData.sender
    );
    const recipientBentoBefore = await getBentoBalance(
      bento,
      tokens[0],
      streamData.recipient
    );

    await furoStream.cancelStream(streamId, true);
    const recipientBalance = streamData.depositedShares
      .mul((await latest()) - streamData.startTime)
      .div(streamData.endTime - streamData.startTime);
    const senderBalance = streamData.depositedShares.sub(recipientBalance);

    const senderBentoAfter = await getBentoBalance(
      bento,
      tokens[0],
      streamData.sender
    );
    const recipientBentoAfter = await getBentoBalance(
      bento,
      tokens[0],
      streamData.recipient
    );

    expect(senderBentoAfter).to.be.eq(senderBentoBefore.add(senderBalance));
    expect(recipientBentoAfter).to.be.eq(
      recipientBentoBefore.add(recipientBalance)
    );
  });

  it("should allow to cancel stream after the endTime", async function () {
    const streamData = await snapshotStreamData(furoStream, streamId);
    const timeNow = await latest();

    const differnceInTime = endTime.sub(timeNow);
    await increase(duration.seconds(differnceInTime.toNumber()));

    const { senderBalance, recipientBalance } = await getStreamBalance(
      furoStream,
      streamId
    );
    const senderBentoBefore = await getBentoBalance(
      bento,
      tokens[0],
      streamData.sender
    );
    const recipientBentoBefore = await getBentoBalance(
      bento,
      tokens[0],
      streamData.recipient
    );

    await furoStream.cancelStream(streamId, true);

    const senderBentoAfter = await getBentoBalance(
      bento,
      tokens[0],
      streamData.sender
    );
    const recipientBentoAfter = await getBentoBalance(
      bento,
      tokens[0],
      streamData.recipient
    );

    expect(senderBentoAfter).to.be.eq(senderBentoBefore.add(senderBalance));
    expect(recipientBentoAfter).to.be.eq(
      recipientBentoBefore.add(recipientBalance)
    );
  });
});

describe("Stream Creation - Batchable", function () {
  let accounts: Signer[];

  let snapshotId;

  let bento;
  let furoStream;
  let tokens = [];

  let startTime;
  let endTime;

  before(async function () {
    accounts = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const BentoBoxV1 = await ethers.getContractFactory("BentoBoxV1");
    const FuroStream = await ethers.getContractFactory("FuroStream");

    let promises = [];
    for (let i = 0; i < 1; i++) {
      promises.push(
        ERC20.deploy("Token" + i, "TOK" + i, getBigNumber(1000000))
      );
    }

    tokens = await Promise.all(promises);
    bento = await BentoBoxV1.deploy(tokens[0].address);
    furoStream = await FuroStream.deploy(bento.address, tokens[0].address);

    await bento.whitelistMasterContract(furoStream.address, true);

    startTime = BigNumber.from(Math.floor(new Date().getTime() / 1000)).add(
      BigNumber.from(300)
    );
    endTime = startTime.add(BigNumber.from(3600));
  });

  beforeEach(async function () {
    snapshotId = await snapshot();
  });

  afterEach(async function () {
    await restore(snapshotId);
  });

  it("should be able to create stream - bento", async function () {
    const amount = getBigNumber(10000);
    const amountToShares = await toShare(bento, tokens[0], amount);

    const amountToDeposit = await toAmount(bento, tokens[0], amountToShares);

    const oldStreamId = await snapshotStreamId(furoStream);
    const tokenBalanceBefore = await tokens[0].balanceOf(accounts[0].address);

    await tokens[0].approve(bento.address, getBigNumber(1000000));
    const nonce = await bento.nonces(accounts[0].address);
    const { v, r, s } = getSignedMasterContractApprovalData(
      bento,
      accounts[0],
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      furoStream.address,
      true,
      nonce
    );
    let masterContractApprovalData = furoStream.interface.encodeFunctionData(
      "setBentoBoxApproval",
      [accounts[0].address, true, v, r, s]
    );
    let createStreamData = furoStream.interface.encodeFunctionData("createStream", [
      accounts[1].address,
      tokens[0].address,
      startTime,
      endTime,
      amountToDeposit,
      false,
    ]);
    await furoStream.batch([masterContractApprovalData, createStreamData], true);
    const newStreamId = await snapshotStreamId(furoStream);
    const newStreamData = await snapshotStreamData(furoStream, oldStreamId);
    const tokenBalanceAfter = await tokens[0].balanceOf(accounts[0].address);

    var { senderBalance, recipientBalance } = await getStreamBalance(
      furoStream,
      oldStreamId
    );

    expect(oldStreamId.add(1)).to.be.eq(newStreamId);
    expect(newStreamData.sender).to.be.eq(accounts[0].address);
    expect(newStreamData.recipient).to.be.eq(accounts[1].address);
    expect(newStreamData.token).to.be.eq(tokens[0].address);
    expect(newStreamData.depositedShares).to.be.eq(amountToDeposit);
    expect(newStreamData.withdrawnShares).to.be.eq(BigNumber.from(0));
    expect(newStreamData.startTime).to.be.eq(startTime);
    expect(newStreamData.endTime).to.be.eq(endTime);
    expect(tokenBalanceBefore).to.be.eq(tokenBalanceAfter.add(amountToDeposit));
    expect(senderBalance).to.be.eq(amountToDeposit);
    expect(recipientBalance).to.be.eq(getBigNumber(0));
  });
});

describe("Stream Admin Functionality", function () {
  let accounts: Signer[];

  let snapshotId;

  let bento;
  let furoStream;
  let tokens = [];

  let startTime;
  let endTime;

  before(async function () {
    accounts = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const BentoBoxV1 = await ethers.getContractFactory("BentoBoxV1");
    const FuroStream = await ethers.getContractFactory("FuroStream");

    let promises = [];
    for (let i = 0; i < 1; i++) {
      promises.push(
        ERC20.deploy("Token" + i, "TOK" + i, getBigNumber(1000000))
      );
    }

    tokens = await Promise.all(promises);
    bento = await BentoBoxV1.deploy(tokens[0].address);
    furoStream = await FuroStream.deploy(bento.address, tokens[0].address);

    await bento.whitelistMasterContract(furoStream.address, true);

    promises = [];
    for (let i = 0; i < tokens.length; i++) {
      promises.push(
        tokens[i].approve(bento.address, getBigNumber(1000000)).then(() => {
          bento.deposit(
            tokens[i].address,
            accounts[0].address,
            accounts[0].address,
            getBigNumber(500000),
            0
          );
        })
      );
    }

    await Promise.all(promises);
    await bento.setMasterContractApproval(
      accounts[0].address,
      furoStream.address,
      true,
      "0",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    await bento
      .connect(accounts[1])
      .setMasterContractApproval(
        accounts[1].address,
        furoStream.address,
        true,
        "0",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      );

    startTime = BigNumber.from(Math.floor(new Date().getTime() / 1000)).add(
      BigNumber.from(300)
    );
    endTime = startTime.add(BigNumber.from(3600));
  });

  beforeEach(async function () {
    snapshotId = await snapshot();
  });

  afterEach(async function () {
    await restore(snapshotId);
  });

  it("should not allow to set new owner when not owner", async function () {
    await expect(
      furoStream
        .connect(accounts[1])
        .transferOwnership(accounts[1].address, true, false)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("should allow to set new owner when owner", async function () {
    await furoStream
      .connect(accounts[0])
      .transferOwnership(accounts[1].address, true, false);
    expect(await furoStream.owner()).to.be.eq(accounts[1].address);
  });
});
