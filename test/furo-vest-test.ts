// @ts-nocheck

import { ethers } from "hardhat";
import { Signer, BigNumber } from "ethers";
import { expect } from "chai";
import {
  getBentoBalance,
  getBigNumber,
  snapshot,
  restore,
  ONE_YEAR,
  ONE_MONTH,
  increase,
  ADDRESS_ZERO,
} from "./harness";

describe("Create Vest", () => {
  let accounts: Signer[];

  let snapshotId;

  let bento;
  let furoVesting;
  let tokens = [];

  let startTime;
  let cliffAmount = getBigNumber(100);
  let stepAmount = getBigNumber(50);
  let steps = 3;

  before(async function () {
    accounts = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const BentoBoxV1 = await ethers.getContractFactory("BentoBoxV1");
    const FuroVesting = await ethers.getContractFactory("FuroVesting");

    let promises = [];
    for (let i = 0; i < 1; i++) {
      promises.push(
        ERC20.deploy("Token" + i, "TOK" + i, getBigNumber(1000000))
      );
    }

    tokens = await Promise.all(promises);
    bento = await BentoBoxV1.deploy(tokens[0].address);
    furoVesting = await FuroVesting.deploy(bento.address, tokens[0].address);

    await bento.whitelistMasterContract(furoVesting.address, true);

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
      furoVesting.address,
      true,
      "0",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    await bento
      .connect(accounts[1])
      .setMasterContractApproval(
        accounts[1].address,
        furoVesting.address,
        true,
        "0",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      );

    startTime = BigNumber.from(Math.floor(new Date().getTime() / 1000)).add(
      BigNumber.from(300)
    );
  });

  beforeEach(async function () {
    snapshotId = await snapshot();
  });

  afterEach(async function () {
    await restore(snapshotId);
  });

  it("should allow create vest - bento", async function () {
    const preVestId = await furoVesting.vestIds();
    const preUserTokenBalance = await getBentoBalance(
      bento,
      tokens[0],
      accounts[0].address
    );
    const preBentoBalanceFuro = await getBentoBalance(
      bento,
      tokens[0],
      furoVesting.address
    );
    await furoVesting.createVesting(
      tokens[0].address,
      accounts[1].address,
      startTime,
      ONE_YEAR,
      ONE_MONTH,
      steps,
      cliffAmount,
      stepAmount,
      true
    );
    const postBentoBalanceFuro = await getBentoBalance(
      bento,
      tokens[0],
      furoVesting.address
    );
    const postVestIds = await furoVesting.vestIds();

    const vestNFTOwner = await furoVesting.ownerOf(preVestId);

    const postUserTokenBalance = await getBentoBalance(
      bento,
      tokens[0],
      accounts[0].address
    );
    const vestData = await furoVesting.vests(preVestId);

    expect(vestNFTOwner).to.be.eq(accounts[1].address);
    expect(vestData.owner).to.be.eq(accounts[0].address);

    expect(postVestIds).to.be.eq(preVestId.add(1));
    expect(postUserTokenBalance).to.be.eq(
      preUserTokenBalance.sub(cliffAmount.add(stepAmount.mul(steps)))
    );
    expect(postBentoBalanceFuro).to.be.eq(
      preBentoBalanceFuro.add(cliffAmount.add(stepAmount.mul(steps)))
    );
  });

  it("should allow create vest - native", async function () {
    const preVestId = await furoVesting.vestIds();
    const preUserTokenBalance = await tokens[0].balanceOf(accounts[0].address);
    const preBentoBalanceFuro = await getBentoBalance(
      bento,
      tokens[0],
      furoVesting.address
    );
    await furoVesting.createVesting(
      tokens[0].address,
      accounts[1].address,
      startTime,
      ONE_YEAR,
      ONE_MONTH,
      steps,
      cliffAmount,
      stepAmount,
      false
    );
    const postBentoBalanceFuro = await getBentoBalance(
      bento,
      tokens[0],
      furoVesting.address
    );
    const postVestIds = await furoVesting.vestIds();

    const vestNFTOwner = await furoVesting.ownerOf(preVestId);

    const postUserTokenBalance = await tokens[0].balanceOf(accounts[0].address);
    const vestData = await furoVesting.vests(preVestId);

    expect(vestNFTOwner).to.be.eq(accounts[1].address);
    expect(vestData.owner).to.be.eq(accounts[0].address);

    expect(postVestIds).to.be.eq(preVestId.add(1));
    expect(postUserTokenBalance).to.be.eq(
      preUserTokenBalance.sub(cliffAmount.add(stepAmount.mul(steps)))
    );
    expect(postBentoBalanceFuro).to.be.eq(
      preBentoBalanceFuro.add(cliffAmount.add(stepAmount.mul(steps)))
    );
  });

  it("should not allow to create vest with old start", async function () {
    await expect(
      furoVesting.createVesting(
        tokens[0].address,
        accounts[1].address,
        startTime.sub(1000),
        ONE_YEAR,
        ONE_MONTH,
        steps,
        cliffAmount,
        stepAmount,
        false
      )
    ).to.be.revertedWith("InvalidStart()");
  });
});

describe("Balances", () => {
  let accounts: Signer[];

  let snapshotId;

  let bento;
  let furoVesting;
  let tokens = [];

  let startTime;
  let cliffAmount = getBigNumber(100);
  let stepAmount = getBigNumber(50);
  let steps = 3;
  let vestId;

  before(async function () {
    accounts = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const BentoBoxV1 = await ethers.getContractFactory("BentoBoxV1");
    const FuroVesting = await ethers.getContractFactory("FuroVesting");

    let promises = [];
    for (let i = 0; i < 1; i++) {
      promises.push(
        ERC20.deploy("Token" + i, "TOK" + i, getBigNumber(1000000))
      );
    }

    tokens = await Promise.all(promises);
    bento = await BentoBoxV1.deploy(tokens[0].address);
    furoVesting = await FuroVesting.deploy(bento.address, tokens[0].address);

    await bento.whitelistMasterContract(furoVesting.address, true);

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
      furoVesting.address,
      true,
      "0",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    await bento
      .connect(accounts[1])
      .setMasterContractApproval(
        accounts[1].address,
        furoVesting.address,
        true,
        "0",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      );

    startTime = BigNumber.from(Math.floor(new Date().getTime() / 1000)).add(
      BigNumber.from(300)
    );

    vestId = await furoVesting.vestIds();

    await furoVesting.createVesting(
      tokens[0].address,
      accounts[1].address,
      startTime,
      ONE_YEAR,
      ONE_MONTH,
      steps,
      cliffAmount,
      stepAmount,
      true
    );
  });

  beforeEach(async function () {
    snapshotId = await snapshot();
  });

  afterEach(async function () {
    await restore(snapshotId);
  });

  it("should return 0 when cliff not met", async function () {
    let vestBalance = await furoVesting.vestBalance(vestId);
    expect(vestBalance).to.be.eq(0);
    await increase(ONE_MONTH);
    expect(vestBalance).to.be.eq(0);
  });

  it("should return cliffAmount when cliff met", async function () {
    await increase(ONE_YEAR.add(300));
    let vestBalance = await furoVesting.vestBalance(vestId);
    expect(vestBalance).to.be.eq(cliffAmount);
  });

  it("should return cliffAmount + stepAmount when one step met", async function () {
    await increase(ONE_YEAR.add(ONE_MONTH).add(300));
    let vestBalance = await furoVesting.vestBalance(vestId);
    expect(vestBalance).to.be.eq(cliffAmount.add(stepAmount));
  });

  it("should return entire amount after vesting over", async function () {
    await increase(ONE_YEAR.add(ONE_MONTH.mul(steps)).add(300));
    let vestBalance = await furoVesting.vestBalance(vestId);
    expect(vestBalance).to.be.eq(cliffAmount.add(stepAmount.mul(steps)));
  });
});

describe("Withdraw", () => {
  let accounts: Signer[];

  let snapshotId;

  let bento;
  let furoVesting;
  let tokens = [];

  let startTime;
  let cliffAmount = getBigNumber(100);
  let stepAmount = getBigNumber(50);
  let steps = 3;
  let vestId;

  before(async function () {
    accounts = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const BentoBoxV1 = await ethers.getContractFactory("BentoBoxV1");
    const FuroVesting = await ethers.getContractFactory("FuroVesting");

    let promises = [];
    for (let i = 0; i < 1; i++) {
      promises.push(
        ERC20.deploy("Token" + i, "TOK" + i, getBigNumber(1000000))
      );
    }

    tokens = await Promise.all(promises);
    bento = await BentoBoxV1.deploy(tokens[0].address);
    furoVesting = await FuroVesting.deploy(bento.address, tokens[0].address);

    await bento.whitelistMasterContract(furoVesting.address, true);

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
      furoVesting.address,
      true,
      "0",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    await bento
      .connect(accounts[1])
      .setMasterContractApproval(
        accounts[1].address,
        furoVesting.address,
        true,
        "0",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      );

    startTime = BigNumber.from(Math.floor(new Date().getTime() / 1000)).add(
      BigNumber.from(300)
    );

    vestId = await furoVesting.vestIds();

    await furoVesting.createVesting(
      tokens[0].address,
      accounts[1].address,
      startTime,
      ONE_YEAR,
      ONE_MONTH,
      steps,
      cliffAmount,
      stepAmount,
      true
    );
  });

  beforeEach(async function () {
    snapshotId = await snapshot();
  });

  afterEach(async function () {
    await restore(snapshotId);
  });

  it("should not allow to withdraw if not owner", async function () {
    await expect(furoVesting.withdraw(vestId, "0x", false)).to.be.revertedWith(
      "NotVestReceiver()"
    );
  });

  it("should allow withdraw - bento", async function () {
    const preUserBalanceBento = await getBentoBalance(
      bento,
      tokens[0],
      accounts[1].address
    );
    await increase(ONE_YEAR.add(300));
    await furoVesting.connect(accounts[1]).withdraw(vestId, "0x", true);
    const postUserBalanceBento = await getBentoBalance(
      bento,
      tokens[0],
      accounts[1].address
    );
    expect(postUserBalanceBento).to.be.eq(preUserBalanceBento.add(cliffAmount));
  });

  it("should allow withdraw - native", async function () {
    const preUserBalanceToken = await tokens[0].balanceOf(accounts[1].address);
    await increase(ONE_YEAR.add(300));
    await furoVesting.connect(accounts[1]).withdraw(vestId, "0x", false);
    const postUserBalanceToken = await tokens[0].balanceOf(accounts[1].address);

    expect(postUserBalanceToken).to.be.eq(preUserBalanceToken.add(cliffAmount));
  });
});

describe("Vest Owner Operations", () => {
  let accounts: Signer[];

  let snapshotId;

  let bento;
  let furoVesting;
  let tokens = [];

  let startTime;
  let cliffAmount = getBigNumber(100);
  let stepAmount = getBigNumber(50);
  let steps = 3;
  let vestId;

  before(async function () {
    accounts = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const BentoBoxV1 = await ethers.getContractFactory("BentoBoxV1");
    const FuroVesting = await ethers.getContractFactory("FuroVesting");

    let promises = [];
    for (let i = 0; i < 1; i++) {
      promises.push(
        ERC20.deploy("Token" + i, "TOK" + i, getBigNumber(1000000))
      );
    }

    tokens = await Promise.all(promises);
    bento = await BentoBoxV1.deploy(tokens[0].address);
    furoVesting = await FuroVesting.deploy(bento.address, tokens[0].address);

    await bento.whitelistMasterContract(furoVesting.address, true);

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
      furoVesting.address,
      true,
      "0",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    await bento
      .connect(accounts[1])
      .setMasterContractApproval(
        accounts[1].address,
        furoVesting.address,
        true,
        "0",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      );

    startTime = BigNumber.from(Math.floor(new Date().getTime() / 1000)).add(
      BigNumber.from(300)
    );

    vestId = await furoVesting.vestIds();

    await furoVesting.createVesting(
      tokens[0].address,
      accounts[1].address,
      startTime,
      ONE_YEAR,
      ONE_MONTH,
      steps,
      cliffAmount,
      stepAmount,
      true
    );
  });

  beforeEach(async function () {
    snapshotId = await snapshot();
  });

  afterEach(async function () {
    await restore(snapshotId);
  });

  it("should not allow to stop vest when not owner", async function () {
    await expect(
      furoVesting.connect(accounts[1]).stopVesting(vestId, true)
    ).to.be.revertedWith("NotOwner()");
  });

  it("should not allow to update vest owner when not owner", async function () {
    await expect(
      furoVesting.connect(accounts[1]).updateOwner(vestId, accounts[1].address)
    ).to.be.revertedWith("NotOwner()");
  });

  it("should allow to stop vesting - bento", async function () {
    await increase(ONE_YEAR.add(ONE_MONTH.mul(steps - 1)).add(300));

    const recipentShouldReceive = cliffAmount.add(stepAmount.mul(steps - 1));
    const ownerShouldReceive = cliffAmount
      .add(stepAmount.mul(steps))
      .sub(recipentShouldReceive);

    const preRecipientBalanceBento = await getBentoBalance(
      bento,
      tokens[0],
      accounts[1].address
    );
    const preOwnerBalanceBento = await getBentoBalance(
      bento,
      tokens[0],
      accounts[0].address
    );
    await furoVesting.stopVesting(vestId, true);

    const vestData = await furoVesting.vests(vestId);

    const postRecipientBalanceBento = await getBentoBalance(
      bento,
      tokens[0],
      accounts[1].address
    );
    const postOwnerBalanceBento = await getBentoBalance(
      bento,
      tokens[0],
      accounts[0].address
    );

    expect(postRecipientBalanceBento).to.be.eq(
      preRecipientBalanceBento.add(recipentShouldReceive)
    );
    expect(postOwnerBalanceBento).to.be.eq(
      preOwnerBalanceBento.add(ownerShouldReceive)
    );
    expect(vestData.owner).to.be.eq(ADDRESS_ZERO);
  });

  it("should allow to stop vesting - native", async function () {
    await increase(ONE_YEAR.add(ONE_MONTH.mul(steps - 1)).add(300));

    const recipentShouldReceive = cliffAmount.add(stepAmount.mul(steps - 1));
    const ownerShouldReceive = cliffAmount
      .add(stepAmount.mul(steps))
      .sub(recipentShouldReceive);

    const preRecipientBalanceBento = await tokens[0].balanceOf(
      accounts[1].address
    );
    const preOwnerBalanceBento = await tokens[0].balanceOf(accounts[0].address);
    await furoVesting.stopVesting(vestId, false);

    const vestData = await furoVesting.vests(vestId);

    const postRecipientBalanceBento = await tokens[0].balanceOf(
      accounts[1].address
    );
    const postOwnerBalanceBento = await tokens[0].balanceOf(
      accounts[0].address
    );

    expect(postRecipientBalanceBento).to.be.eq(
      preRecipientBalanceBento.add(recipentShouldReceive)
    );
    expect(postOwnerBalanceBento).to.be.eq(
      preOwnerBalanceBento.add(ownerShouldReceive)
    );
    expect(vestData.owner).to.be.eq(ADDRESS_ZERO);
  });

  it("should allow to update vest owner", async function () {
    await furoVesting.updateOwner(vestId, accounts[1].address);
    const postVestData = await furoVesting.vests(vestId);

    expect(postVestData.owner).to.be.eq(accounts[1].address);
  });
});
