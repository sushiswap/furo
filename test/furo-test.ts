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
  let furo;
  let tokens = [];

  let startTime;
  let endTime;

  before(async function () {
    accounts = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const BentoBoxV1 = await ethers.getContractFactory("BentoBoxV1");
    const Furo = await ethers.getContractFactory("Furo");

    let promises = [];
    for (let i = 0; i < 1; i++) {
      promises.push(
        ERC20.deploy("Token" + i, "TOK" + i, getBigNumber(1000000))
      );
    }

    tokens = await Promise.all(promises);
    bento = await BentoBoxV1.deploy(tokens[0].address);
    furo = await Furo.deploy(bento.address, tokens[0].address);

    await bento.whitelistMasterContract(furo.address, true);

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
      furo.address,
      true,
      "0",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    await bento
      .connect(accounts[1])
      .setMasterContractApproval(
        accounts[1].address,
        furo.address,
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

    const oldStreamId = await snapshotStreamId(furo);
    const bentoBalanceBefore = await getBentoBalance(
      bento,
      tokens[0],
      accounts[0].address
    );

    await furo.createStream(
      accounts[1].address,
      tokens[0].address,
      startTime,
      endTime,
      amountToDeposit,
      true
    );

    const newStreamId = await snapshotStreamId(furo);
    const newStreamData = await snapshotStreamData(furo, oldStreamId);
    const bentoBalanceAfter = await getBentoBalance(
      bento,
      tokens[0],
      accounts[0].address
    );

    const { senderBalance, recipientBalance } = await getStreamBalance(
      furo,
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

    const oldStreamId = await snapshotStreamId(furo);
    const tokenBalanceBefore = await tokens[0].balanceOf(accounts[0].address);

    await furo.createStream(
      accounts[1].address,
      tokens[0].address,
      startTime,
      endTime,
      amountToDeposit,
      false
    );

    const newStreamId = await snapshotStreamId(furo);
    const newStreamData = await snapshotStreamData(furo, oldStreamId);
    const tokenBalanceAfter = await tokens[0].balanceOf(accounts[0].address);

    var { senderBalance, recipientBalance } = await getStreamBalance(
      furo,
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

  it("should not be able create stream when startTime is less than block.timestamp", async function () {
    const startTime = await latest();
    const endTime = startTime.add(BigNumber.from(3600));

    const amount = getBigNumber(10000);
    const amountToShares = await toShare(bento, tokens[0], amount);

    const amountToDeposit = amountToShares;

    await expect(
      furo.createStream(
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
      furo.createStream(
        accounts[1].address,
        tokens[0].address,
        startTime,
        startTime,
        getBigNumber(1000),
        true
      )
    ).to.be.revertedWith(customError("InvalidEndTime"));
  });

  it("should not stream to invalid recipients", async function () {
    const amount = getBigNumber(10000);
    const amountToShares = await toShare(bento, tokens[0], amount);

    const amountToDeposit = await toAmount(bento, tokens[0], amountToShares);

    await expect(
      furo.createStream(
        ADDRESS_ZERO,
        tokens[0].address,
        startTime,
        endTime,
        amountToDeposit,
        true
      )
    ).to.be.revertedWith(customError("InvalidAddressZero"));

    await expect(
      furo.createStream(
        furo.address,
        tokens[0].address,
        startTime,
        endTime,
        amountToDeposit,
        true
      )
    ).to.be.revertedWith(customError("InvalidAddressFuro"));

    await expect(
      furo.createStream(
        accounts[0].address,
        tokens[0].address,
        startTime,
        endTime,
        amountToDeposit,
        true
      )
    ).to.be.revertedWith(customError("InvalidAddressSender"));
  });
});

describe("Stream Creation via Native Token", function () {
  let accounts: Signer[];

  let snapshotId;

  let bento;
  let furo;
  let weth;
  let tokens = [];

  let startTime;
  let endTime;

  before(async function () {
    accounts = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const BentoBoxV1 = await ethers.getContractFactory("BentoBoxV1");
    const Furo = await ethers.getContractFactory("Furo");

    let promises = [];
    for (let i = 0; i < 1; i++) {
      promises.push(
        ERC20.deploy("Token" + i, "TOK" + i, getBigNumber(1000000))
      );
    }

    weth = await ERC20.deploy("WETH9", "WETH", getBigNumber(1000000));
    tokens = await Promise.all(promises);
    bento = await BentoBoxV1.deploy(weth.address);
    furo = await Furo.deploy(bento.address, weth.address);
    await weth.approve(bento.address, getBigNumber(1000000));
    await bento.deposit(
      weth.address,
      accounts[0].address,
      accounts[0].address,
      getBigNumber(500000),
      0
    );

    await bento.whitelistMasterContract(furo.address, true);

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
      furo.address,
      true,
      "0",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    await bento
      .connect(accounts[1])
      .setMasterContractApproval(
        accounts[1].address,
        furo.address,
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
    const oldStreamId = await snapshotStreamId(furo);
    const bentoBalanceBefore = await getBentoBalance(
      bento,
      weth,
      accounts[0].address
    );

    await furo.createStream(
      accounts[1].address,
      weth.address,
      startTime,
      endTime,
      amountToDeposit,
      true
    );

    const newStreamId = await snapshotStreamId(furo);
    const newStreamData = await snapshotStreamData(furo, oldStreamId);
    const bentoBalanceAfter = await getBentoBalance(
      bento,
      weth,
      accounts[0].address
    );

    const { senderBalance, recipientBalance } = await getStreamBalance(
      furo,
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

    const oldStreamId = await snapshotStreamId(furo);
    const tokenBalanceBefore = await weth.balanceOf(accounts[0].address);

    await furo.createStream(
      accounts[1].address,
      weth.address,
      startTime,
      endTime,
      amountToDeposit,
      false,
      { value: amountToDeposit }
    );

    const newStreamId = await snapshotStreamId(furo);
    const newStreamData = await snapshotStreamData(furo, oldStreamId);
    const tokenBalanceAfter = await weth.balanceOf(accounts[0].address);

    var { senderBalance, recipientBalance } = await getStreamBalance(
      furo,
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
  let furo;
  let tokens = [];

  let startTime;
  let endTime;
  let streamId;
  let amountToDeposit;

  before(async function () {
    accounts = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const BentoBoxV1 = await ethers.getContractFactory("BentoBoxV1");
    const Furo = await ethers.getContractFactory("Furo");

    let promises = [];
    for (let i = 0; i < 1; i++) {
      promises.push(
        ERC20.deploy("Token" + i, "TOK" + i, getBigNumber(1000000))
      );
    }

    tokens = await Promise.all(promises);
    bento = await BentoBoxV1.deploy(tokens[0].address);
    furo = await Furo.deploy(bento.address, tokens[0].address);

    await bento.whitelistMasterContract(furo.address, true);

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
      furo.address,
      true,
      "0",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    await bento
      .connect(accounts[1])
      .setMasterContractApproval(
        accounts[1].address,
        furo.address,
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

    streamId = (await snapshotStreamId(furo)).toString();

    await furo.createStream(
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
      furo,
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
      furo,
      streamId
    );
    expect(senderBalance).to.be.eq(amountToDeposit);
    expect(recipientBalance).to.be.eq(getBigNumber(0));
  });

  it("should report correct balance after one second from the start of the stream", async function () {
    const streamData = await snapshotStreamData(furo, streamId);
    const timeNow = await latest();
    const differnceInTime = startTime.sub(timeNow).add(1);
    await increase(duration.seconds(differnceInTime.toNumber()));
    const { senderBalance, recipientBalance } = await getStreamBalance(
      furo,
      streamId
    );
    const amountToBeStreamed = streamData.depositedShares
      .mul((await latest()) - streamData.startTime)
      .div(streamData.endTime - streamData.startTime);
    expect(senderBalance).to.be.eq(amountToDeposit.sub(amountToBeStreamed));
    expect(recipientBalance).to.be.eq(amountToBeStreamed);
  });

  it("should report correct balance after x second from the start of the stream", async function () {
    const streamData = await snapshotStreamData(furo, streamId);
    const timeNow = await latest();
    const randSec = Math.floor(
      Math.random() * (endTime - startTime) + startTime
    );
    const differnceInTime = startTime.sub(timeNow).add(randSec);
    await increase(duration.seconds(differnceInTime.toNumber()));
    const { senderBalance, recipientBalance } = await getStreamBalance(
      furo,
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
      furo,
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
      furo,
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
      furo,
      streamId
    );
    expect(senderBalance).to.be.eq(0);
    expect(recipientBalance).to.be.eq(amountToDeposit);
  });

  it("should not get balances from invalid stream id", async function () {
    await expect(furo.balanceOf(streamId + 1)).to.be.revertedWith(
      customError("InvalidStream")
    );
  });
});

describe("Stream Withdraw", function () {
  let accounts: Signer[];

  let snapshotId;

  let bento;
  let furo;
  let tokens = [];

  let startTime;
  let endTime;
  let streamId;
  let amountToDeposit;

  before(async function () {
    accounts = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const BentoBoxV1 = await ethers.getContractFactory("BentoBoxV1");
    const Furo = await ethers.getContractFactory("Furo");

    let promises = [];
    for (let i = 0; i < 1; i++) {
      promises.push(
        ERC20.deploy("Token" + i, "TOK" + i, getBigNumber(1000000))
      );
    }

    tokens = await Promise.all(promises);
    bento = await BentoBoxV1.deploy(tokens[0].address);
    furo = await Furo.deploy(bento.address, tokens[0].address);

    await bento.whitelistMasterContract(furo.address, true);

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
      furo.address,
      true,
      "0",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    await bento
      .connect(accounts[1])
      .setMasterContractApproval(
        accounts[1].address,
        furo.address,
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

    streamId = (await snapshotStreamId(furo)).toString();

    await furo.createStream(
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

    await furo.withdrawFromStream(streamId, 0, ADDRESS_ZERO, true);

    const recipientNewBentoBalance = await getBentoBalance(
      bento,
      tokens[0],
      accounts[1].address
    );

    expect(recipientNewBentoBalance).to.be.eq(recipientOldBentoBalance);
  });

  it("should only allow sender or recipient to withdraw", async function () {
    await expect(
      furo
        .connect(accounts[2])
        .withdrawFromStream(streamId, 0, ADDRESS_ZERO, true)
    ).to.be.revertedWith(customError("NotSenderOrRecipient"));

    await furo
      .connect(accounts[0])
      .withdrawFromStream(streamId, 0, ADDRESS_ZERO, true);
    await furo
      .connect(accounts[1])
      .withdrawFromStream(streamId, 0, ADDRESS_ZERO, true);
  });

  it("should allow to withdraw after x time from start of stream - bento", async function () {
    const streamData = await snapshotStreamData(furo, streamId);
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

    await furo.withdrawFromStream(
      streamId,
      amountToWithdraw,
      ADDRESS_ZERO,
      true
    );

    const recipientNewBentoBalance = await getBentoBalance(
      bento,
      tokens[0],
      streamData.recipient
    );

    const streamDataNew = await snapshotStreamData(furo, streamId);

    expect(recipientNewBentoBalance).to.be.eq(
      recipientOldBentoBalance.add(amountToWithdraw)
    );
    expect(streamDataNew.withdrawnShares).to.be.eq(
      streamData.withdrawnShares.add(amountToWithdraw)
    );
  });

  it("should allow to withdraw after x time from start of stream - native", async function () {
    const streamData = await snapshotStreamData(furo, streamId);
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

    await furo.withdrawFromStream(
      streamId,
      amountToWithdraw,
      ADDRESS_ZERO,
      false
    );

    const recipientNewBalance = await tokens[0].balanceOf(streamData.recipient);

    const streamDataNew = await snapshotStreamData(furo, streamId);

    expect(recipientNewBalance).to.be.eq(
      recipientOldBalance.add(amountToWithdraw)
    );
    expect(streamDataNew.withdrawnShares).to.be.eq(
      streamData.withdrawnShares.add(amountToWithdraw)
    );
  });

  it("should allow to withdraw at the endTime of the stream", async function () {
    const streamData = await snapshotStreamData(furo, streamId);
    const timeNow = await latest();
    const differnceInTime = endTime.sub(timeNow);
    await increase(duration.seconds(differnceInTime.toNumber()));
    await furo.withdrawFromStream(
      streamId,
      streamData.depositedShares,
      ADDRESS_ZERO,
      true
    );
    const { senderBalance, recipientBalance } = await getStreamBalance(
      furo,
      streamId
    );
    const streamDataNew = await snapshotStreamData(furo, streamId);
    expect(streamData.depositedShares).to.be.eq(streamDataNew.withdrawnShares);
    expect(
      await getBentoBalance(bento, tokens[0], streamDataNew.recipient)
    ).to.be.eq(streamDataNew.depositedShares);
    expect(senderBalance).to.be.eq(0);
    expect(recipientBalance).to.be.eq(0);
  });

  it("should not allow to withdraw more after completely withdrawn", async function () {
    const streamData = await snapshotStreamData(furo, streamId);
    const timeNow = await latest();
    const differnceInTime = endTime.sub(timeNow);
    await increase(duration.seconds(differnceInTime.toNumber()));
    await furo.withdrawFromStream(
      streamId,
      streamData.depositedShares,
      ADDRESS_ZERO,
      true
    );
    await expect(
      furo.withdrawFromStream(streamId, 1, ADDRESS_ZERO, true)
    ).to.be.revertedWith(customError("InvalidWithdrawTooMuch"));

    const { senderBalance, recipientBalance } = await getStreamBalance(
      furo,
      streamId
    );
    const streamDataNew = await snapshotStreamData(furo, streamId);
    expect(streamData.depositedShares).to.be.eq(streamDataNew.withdrawnShares);
    expect(
      await getBentoBalance(bento, tokens[0], streamDataNew.recipient)
    ).to.be.eq(streamDataNew.depositedShares);
    expect(senderBalance).to.be.eq(0);
    expect(recipientBalance).to.be.eq(0);
  });

  it("should not allow to withdraw more than available", async function () {
    const streamData = await snapshotStreamData(furo, streamId);
    const timeNow = await latest();
    const differnceInTime = startTime.sub(timeNow);
    await increase(duration.seconds(differnceInTime));
    await expect(
      furo.withdrawFromStream(
        streamId,
        streamData.depositedShares,
        ADDRESS_ZERO,
        true
      )
    ).to.be.revertedWith(customError("InvalidWithdrawTooMuch"));
  });

  it("should allow to withdrawTo if called by recipient only", async function () {
    const streamData = await snapshotStreamData(furo, streamId);
    const timeNow = await latest();
    const differnceInTime = endTime.sub(timeNow);

    await increase(duration.seconds(differnceInTime.toNumber()));

    await furo
      .connect(accounts[1])
      .withdrawFromStream(
        streamId,
        streamData.depositedShares,
        accounts[2].address,
        true
      );

    const { senderBalance, recipientBalance } = await getStreamBalance(
      furo,
      streamId
    );
    const streamDataNew = await snapshotStreamData(furo, streamId);
    expect(streamData.depositedShares).to.be.eq(streamDataNew.withdrawnShares);
    expect(
      await getBentoBalance(bento, tokens[0], accounts[2].address)
    ).to.be.eq(streamDataNew.depositedShares);
    expect(senderBalance).to.be.eq(0);
    expect(recipientBalance).to.be.eq(0);
  });

  it("should ignore withdrawTo if set by the sender", async function () {
    const streamData = await snapshotStreamData(furo, streamId);
    const timeNow = await latest();
    const differnceInTime = endTime.sub(timeNow);

    await increase(duration.seconds(differnceInTime.toNumber()));

    await furo
      .connect(accounts[0])
      .withdrawFromStream(
        streamId,
        streamData.depositedShares,
        accounts[2].address,
        true
      );

    const { senderBalance, recipientBalance } = await getStreamBalance(
      furo,
      streamId
    );
    const streamDataNew = await snapshotStreamData(furo, streamId);
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
  let furo;
  let tokens = [];

  let startTime;
  let endTime;
  let streamId;
  let amountToDeposit;

  before(async function () {
    accounts = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const BentoBoxV1 = await ethers.getContractFactory("BentoBoxV1");
    const Furo = await ethers.getContractFactory("Furo");

    let promises = [];
    for (let i = 0; i < 1; i++) {
      promises.push(
        ERC20.deploy("Token" + i, "TOK" + i, getBigNumber(1000000))
      );
    }

    tokens = await Promise.all(promises);
    bento = await BentoBoxV1.deploy(tokens[0].address);
    furo = await Furo.deploy(bento.address, tokens[0].address);

    await bento.whitelistMasterContract(furo.address, true);

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
      furo.address,
      true,
      "0",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    await bento
      .connect(accounts[1])
      .setMasterContractApproval(
        accounts[1].address,
        furo.address,
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

    streamId = (await snapshotStreamId(furo)).toString();

    await furo.createStream(
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
      furo.connect(accounts[2]).cancelStream(streamId, true)
    ).to.be.revertedWith(customError("NotSenderOrRecipient"));
  });

  it("should allow sender to cancel the stream", async function () {
    await furo.connect(accounts[0]).cancelStream(streamId, true);
    await expect(snapshotStreamData(furo, streamId)).to.be.revertedWith(
      customError("InvalidStream")
    );
  });

  it("should allow recipient to cancel the stream", async function () {
    await furo.connect(accounts[1]).cancelStream(streamId, true);
    await expect(snapshotStreamData(furo, streamId)).to.be.revertedWith(
      customError("InvalidStream")
    );
  });

  it("should cancel stream after x time and distribute correct amounts - bento", async function () {
    const streamData = await snapshotStreamData(furo, streamId);
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

    await furo.cancelStream(streamId, true);

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
    const streamData = await snapshotStreamData(furo, streamId);
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

    await furo.cancelStream(streamId, false);
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
    const streamData = await snapshotStreamData(furo, streamId);
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

    await furo.cancelStream(streamId, true);
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
    const streamData = await snapshotStreamData(furo, streamId);
    const timeNow = await latest();

    const differnceInTime = endTime.sub(timeNow);
    await increase(duration.seconds(differnceInTime.toNumber()));

    const { senderBalance, recipientBalance } = await getStreamBalance(
      furo,
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

    await furo.cancelStream(streamId, true);

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
  let furo;
  let tokens = [];

  let startTime;
  let endTime;

  before(async function () {
    accounts = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const BentoBoxV1 = await ethers.getContractFactory("BentoBoxV1");
    const Furo = await ethers.getContractFactory("Furo");

    let promises = [];
    for (let i = 0; i < 1; i++) {
      promises.push(
        ERC20.deploy("Token" + i, "TOK" + i, getBigNumber(1000000))
      );
    }

    tokens = await Promise.all(promises);
    bento = await BentoBoxV1.deploy(tokens[0].address);
    furo = await Furo.deploy(bento.address, tokens[0].address);

    await bento.whitelistMasterContract(furo.address, true);

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

    const oldStreamId = await snapshotStreamId(furo);
    const tokenBalanceBefore = await tokens[0].balanceOf(accounts[0].address);

    await tokens[0].approve(bento.address, getBigNumber(1000000));
    const nonce = await bento.nonces(accounts[0].address);
    const { v, r, s } = getSignedMasterContractApprovalData(
      bento,
      accounts[0],
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      furo.address,
      true,
      nonce
    );
    let masterContractApprovalData = furo.interface.encodeFunctionData(
      "setBentoBoxApproval",
      [accounts[0].address, true, v, r, s]
    );
    let createStreamData = furo.interface.encodeFunctionData("createStream", [
      accounts[1].address,
      tokens[0].address,
      startTime,
      endTime,
      amountToDeposit,
      false,
    ]);
    await furo.batch([masterContractApprovalData, createStreamData], true);
    const newStreamId = await snapshotStreamId(furo);
    const newStreamData = await snapshotStreamData(furo, oldStreamId);
    const tokenBalanceAfter = await tokens[0].balanceOf(accounts[0].address);

    var { senderBalance, recipientBalance } = await getStreamBalance(
      furo,
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

describe("Stream Swap Withdraw", function () {
  let accounts: Signer[];

  let snapshotId;

  let bento;
  let furo;
  let factory;
  let swapReceiver;
  let swapReceiverMalicious;
  let amountToDeposit;
  let streamId;
  let pair;
  let tokens = [];

  let startTime;
  let endTime;

  before(async function () {
    accounts = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const BentoBoxV1 = await ethers.getContractFactory("BentoBoxV1");
    const Furo = await ethers.getContractFactory("Furo");
    const Factory = await ethers.getContractFactory("SushiSwapFactoryMock");
    const SushiSwapPairMock = await ethers.getContractFactory(
      "SushiSwapPairMock"
    );
    const SwapReceiver = await ethers.getContractFactory("SwapReceiver");
    const SwapReceiverMalicious = await ethers.getContractFactory(
      "SwapReceiverMalicious"
    );

    let promises = [];
    for (let i = 0; i < 2; i++) {
      promises.push(
        ERC20.deploy("Token" + i, "TOK" + i, getBigNumber(1000000))
      );
    }

    tokens = await Promise.all(promises);
    bento = await BentoBoxV1.deploy(tokens[0].address);
    furo = await Furo.deploy(bento.address, tokens[0].address);
    factory = await Factory.deploy();
    const pairCodeHash = await factory.pairCodeHash();

    swapReceiver = await SwapReceiver.deploy(
      factory.address,
      bento.address,
      pairCodeHash
    );

    swapReceiverMalicious = await SwapReceiverMalicious.deploy(
      factory.address,
      bento.address,
      pairCodeHash
    );

    const createPairTx = await factory.createPair(
      tokens[0].address,
      tokens[1].address
    );

    const _pair = (await createPairTx.wait()).events[0].args.pair;

    pair = await SushiSwapPairMock.attach(_pair);

    await tokens[0].transfer(pair.address, getBigNumber(400000));
    await tokens[1].transfer(pair.address, getBigNumber(400000));

    await pair.mint(accounts[0].address);

    await bento.whitelistMasterContract(furo.address, true);

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
      furo.address,
      true,
      "0",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    await bento
      .connect(accounts[1])
      .setMasterContractApproval(
        accounts[1].address,
        furo.address,
        true,
        "0",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      );

    startTime = BigNumber.from(Math.floor(new Date().getTime() / 1000)).add(
      BigNumber.from(300)
    );
    endTime = startTime.add(BigNumber.from(3600));

    let timeDifference = endTime - startTime;
    const amount = getBigNumber(10000);
    const amountToShares = await toShare(bento, tokens[0], amount);

    const modValue = amountToShares.mod(timeDifference);
    amountToDeposit = await toAmount(
      bento,
      tokens[0],
      amountToShares.sub(modValue)
    );

    streamId = (await snapshotStreamId(furo)).toString();

    await furo.createStream(
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

  it("should only allow whitelisted receivers", async function () {
    const timeNow = await latest();
    const timeDifference = endTime - timeNow;
    await increase(duration.seconds(timeDifference));
    const stream = await snapshotStreamData(furo, streamId);
    const data = ethers.utils.defaultAbiCoder.encode(
      ["address[]"],
      [[tokens[0].address, tokens[1].address]]
    );
    await expect(
      furo
        .connect(accounts[1])
        .withdrawSwap(
          streamId,
          stream.depositedShares,
          tokens[1].address,
          BigNumber.from("9727541039588262553138"),
          swapReceiver.address,
          data,
          false
        )
    ).to.be.revertedWith(customError("InvalidSwapper"));
  });

  it("should only be called by the stream recipient", async function () {
    await furo.whitelistReceiver(swapReceiver.address, true);
    const timeNow = await latest();
    const timeDifference = endTime - timeNow;
    await increase(duration.seconds(timeDifference));
    const stream = await snapshotStreamData(furo, streamId);
    const data = ethers.utils.defaultAbiCoder.encode(
      ["address[]"],
      [[tokens[0].address, tokens[1].address]]
    );
    await expect(
      furo
        .connect(accounts[0])
        .withdrawSwap(
          streamId,
          stream.depositedShares,
          tokens[1].address,
          BigNumber.from("9727541039588262553138"),
          swapReceiver.address,
          data,
          false
        )
    ).to.be.revertedWith(customError("NotRecipient"));
  });

  it("should not allow receiver to provide less token than minimum", async function () {
    await furo.whitelistReceiver(swapReceiverMalicious.address, true);
    const timeNow = await latest();
    const timeDifference = endTime - timeNow;
    await increase(duration.seconds(timeDifference));
    const stream = await snapshotStreamData(furo, streamId);
    const data = ethers.utils.defaultAbiCoder.encode(
      ["address[]"],
      [[tokens[0].address, tokens[1].address]]
    );
    await expect(
      furo
        .connect(accounts[1])
        .withdrawSwap(
          streamId,
          stream.depositedShares,
          tokens[1].address,
          BigNumber.from("9727541039588262553139"),
          swapReceiverMalicious.address,
          data,
          false
        )
    ).to.be.revertedWith(customError("ReceivedTooLess"));
  });

  it("should not allow to withdraw more than available", async function () {
    await furo.whitelistReceiver(swapReceiver.address, true);
    const timeNow = await latest();
    const timeDifference = endTime - timeNow;
    await increase(duration.seconds(timeDifference));
    const stream = await snapshotStreamData(furo, streamId);
    const data = ethers.utils.defaultAbiCoder.encode(
      ["address[]"],
      [[tokens[0].address, tokens[1].address]]
    );
    await expect(
      furo
        .connect(accounts[1])
        .withdrawSwap(
          streamId,
          stream.depositedShares.add(1),
          tokens[1].address,
          BigNumber.from("9727541039588262553138"),
          swapReceiver.address,
          data,
          false
        )
    ).to.be.revertedWith("Furo: withdraw too much");
  });

  it("should be able to swap withdraw - bento", async function () {
    await furo.whitelistReceiver(swapReceiver.address, true);
    const timeNow = await latest();
    const timeDifference = endTime - timeNow;
    await increase(duration.seconds(timeDifference));
    const stream = await snapshotStreamData(furo, streamId);
    const amountOutMin = BigNumber.from("9727541039588262553139");
    const data = ethers.utils.defaultAbiCoder.encode(
      ["address[]"],
      [[tokens[0].address, tokens[1].address]]
    );

    const token1BentoBalanceBefore = await getBentoBalance(
      bento,
      tokens[1],
      accounts[1].address
    );

    await furo
      .connect(accounts[1])
      .withdrawSwap(
        streamId,
        stream.depositedShares,
        tokens[1].address,
        amountOutMin,
        swapReceiver.address,
        data,
        true
      );

    const token1BentoBalanceAfter = await getBentoBalance(
      bento,
      tokens[1],
      accounts[1].address
    );

    const { senderBalance, recipientBalance } = await getStreamBalance(
      furo,
      streamId
    );

    expect(token1BentoBalanceAfter).to.be.eq(
      token1BentoBalanceBefore.add(amountOutMin)
    );
    const streamDataNew = await snapshotStreamData(furo, streamId);
    expect(stream.depositedShares).to.be.eq(streamDataNew.withdrawnShares);
    expect(senderBalance).to.be.eq(0);
    expect(recipientBalance).to.be.eq(0);
  });

  it("should be able to swap withdraw - native", async function () {
    await furo.whitelistReceiver(swapReceiver.address, true);
    const timeNow = await latest();
    const timeDifference = endTime - timeNow;
    await increase(duration.seconds(timeDifference));
    const stream = await snapshotStreamData(furo, streamId);
    const amountOutMin = BigNumber.from("9727541039588262553139");
    const data = ethers.utils.defaultAbiCoder.encode(
      ["address[]"],
      [[tokens[0].address, tokens[1].address]]
    );

    const token1BalanceBefore = await tokens[1].balanceOf(accounts[1].address);

    await furo
      .connect(accounts[1])
      .withdrawSwap(
        streamId,
        stream.depositedShares,
        tokens[1].address,
        amountOutMin,
        swapReceiver.address,
        data,
        false
      );

    const token1BalanceAfter = await tokens[1].balanceOf(accounts[1].address);

    const { senderBalance, recipientBalance } = await getStreamBalance(
      furo,
      streamId
    );

    expect(token1BalanceAfter).to.be.eq(token1BalanceBefore.add(amountOutMin));
    const streamDataNew = await snapshotStreamData(furo, streamId);
    expect(stream.depositedShares).to.be.eq(streamDataNew.withdrawnShares);
    expect(senderBalance).to.be.eq(0);
    expect(recipientBalance).to.be.eq(0);
  });
});

describe("Stream Admin Functionality", function () {
  let accounts: Signer[];

  let snapshotId;

  let bento;
  let furo;
  let tokens = [];

  let startTime;
  let endTime;

  before(async function () {
    accounts = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const BentoBoxV1 = await ethers.getContractFactory("BentoBoxV1");
    const Furo = await ethers.getContractFactory("Furo");

    let promises = [];
    for (let i = 0; i < 1; i++) {
      promises.push(
        ERC20.deploy("Token" + i, "TOK" + i, getBigNumber(1000000))
      );
    }

    tokens = await Promise.all(promises);
    bento = await BentoBoxV1.deploy(tokens[0].address);
    furo = await Furo.deploy(bento.address, tokens[0].address);

    await bento.whitelistMasterContract(furo.address, true);

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
      furo.address,
      true,
      "0",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    await bento
      .connect(accounts[1])
      .setMasterContractApproval(
        accounts[1].address,
        furo.address,
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

  it("should not allow to whitelist receiver when not owner", async function () {
    await expect(
      furo.connect(accounts[1]).whitelistReceiver(accounts[1].address, true)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("should allow to whitelist receiver when owner", async function () {
    await furo
      .connect(accounts[0])
      .whitelistReceiver(accounts[0].address, true);
    expect(await furo.whitelistedReceivers(accounts[0].address)).to.be.eq(true);
  });
  it("should not allow to set new owner when not owner", async function () {
    await expect(
      furo
        .connect(accounts[1])
        .transferOwnership(accounts[1].address, true, false)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("should allow to set new owner when owner", async function () {
    await furo
      .connect(accounts[0])
      .transferOwnership(accounts[1].address, true, false);
    expect(await furo.owner()).to.be.eq(accounts[1].address);
  });
});
