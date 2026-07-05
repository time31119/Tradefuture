const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("TradeFuture Contracts", function () {
  let token, usdt, prediction, insurance, nodePartner, marketMaker;
  let owner, user1, user2, oracle;

  beforeEach(async function () {
    [owner, user1, user2, oracle] = await ethers.getSigners();

    // Deploy MockUSDT
    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    usdt = await MockUSDT.deploy();
    await usdt.waitForDeployment();

    // Deploy TradeFutureToken
    const TradeFutureToken = await ethers.getContractFactory("TradeFutureToken");
    token = await TradeFutureToken.deploy(
      owner.address, // _nodeDividendWallet
      owner.address, // _operationsWallet
      owner.address, // _marketMakerWallet
      owner.address, // _levelRewardWallet
      owner.address  // _liquidityReturnWallet
    );
    await token.waitForDeployment();

    // Deploy InsurancePool with placeholder prediction market address
    const InsurancePool = await ethers.getContractFactory("InsurancePool");
    insurance = await InsurancePool.deploy(
      await usdt.getAddress(),
      await token.getAddress(),
      owner.address // placeholder, will update later
    );
    await insurance.waitForDeployment();

    // Deploy PredictionMarket
    const PredictionMarket = await ethers.getContractFactory("PredictionMarket");
    prediction = await PredictionMarket.deploy(
      await usdt.getAddress(),
      await token.getAddress(),
      await insurance.getAddress(),
      oracle.address
    );
    await prediction.waitForDeployment();

    // Update insurance with correct prediction address
    await insurance.setPredictionMarket(await prediction.getAddress());

    // Oracle sets start price for round 1
    await prediction.connect(oracle).setRoundStartPrice(ethers.parseUnits("67500", 8));

    // Mint tokens to users for testing
    await token.transfer(user1.address, ethers.parseUnits("100000", 18));
    await token.transfer(user2.address, ethers.parseUnits("100000", 18));

    // Mint USDT to users
    await usdt.mint(user1.address, ethers.parseUnits("10000", 6));
    await usdt.mint(user2.address, ethers.parseUnits("10000", 6));

    // Approve USDT for prediction market
    await usdt.connect(user1).approve(await prediction.getAddress(), ethers.MaxUint256);
    await usdt.connect(user2).approve(await prediction.getAddress(), ethers.MaxUint256);

    // Approve TFT for prediction market
    await token.connect(user1).approve(await prediction.getAddress(), ethers.MaxUint256);
    await token.connect(user2).approve(await prediction.getAddress(), ethers.MaxUint256);
  });

  describe("TradeFutureToken", function () {
    it("Should have correct name and symbol", async function () {
      expect(await token.name()).to.equal("TradeFuture Token");
      expect(await token.symbol()).to.equal("TFT");
    });

    it("Should have 11M initial supply", async function () {
      const totalSupply = await token.totalSupply();
      expect(totalSupply).to.equal(ethers.parseUnits("11000000", 18));
    });

    it("Should apply 6% tax on transfers", async function () {
      // Enable trading
      await token.setTradingEnabled(true);
      
      const amount = ethers.parseUnits("1000", 18);
      const tax = amount * 6n / 100n; // 6%
      
      await token.transfer(user1.address, amount);
      const balanceBefore = await token.balanceOf(user2.address);
      await token.connect(user1).transfer(user2.address, amount);
      const balanceAfter = await token.balanceOf(user2.address);
      
      expect(balanceAfter - balanceBefore).to.equal(amount - tax);
    });

    it("Should allow burning", async function () {
      const burnAmount = ethers.parseUnits("1000", 18);
      await token.burn(burnAmount);
      const totalSupply = await token.totalSupply();
      expect(totalSupply).to.equal(ethers.parseUnits("11000000", 18) - burnAmount);
    });
  });

  describe("PredictionMarket", function () {
    it("Should allow users to place bets", async function () {
      const betAmount = ethers.parseUnits("100", 6); // 100 USDT
      
      await prediction.connect(user1).placeBet(1, betAmount); // Bet UP (Direction.Up = 1)
      
      const round = await prediction.rounds(1);
      // 20% goes to insurance, so totalUpBets = 80 USDT
      expect(round.totalUpBets).to.equal(ethers.parseUnits("80", 6));
    });

    it("Should reject bets below minimum", async function () {
      const betAmount = ethers.parseUnits("1", 6); // 1 USDT (below 10 minimum)
      
      await expect(
        prediction.connect(user1).placeBet(1, betAmount)
      ).to.be.revertedWith("Below minimum bet");
    });

    it("Should track total bets per round", async function () {
      const betAmount1 = ethers.parseUnits("100", 6);
      const betAmount2 = ethers.parseUnits("200", 6);
      
      await prediction.connect(user1).placeBet(1, betAmount1); // Bet UP
      await prediction.connect(user2).placeBet(2, betAmount2); // Bet DOWN
      
      const round = await prediction.rounds(1);
      // 20% goes to insurance
      expect(round.totalUpBets).to.equal(ethers.parseUnits("80", 6)); // 100 * 80%
      expect(round.totalDownBets).to.equal(ethers.parseUnits("160", 6)); // 200 * 80%
    });

    it("Should allow settlement with oracle price", async function () {
      const betAmount = ethers.parseUnits("100", 6);
      
      // Place bets
      await prediction.connect(user1).placeBet(1, betAmount); // Bet UP
      
      // Wait for round to end
      await time.increase(301); // 5 minutes + 1 second
      
      // Oracle sets end price (price went up)
      await prediction.connect(oracle).settleRound(ethers.parseUnits("68000", 8));
      
      const round = await prediction.rounds(1);
      expect(round.settled).to.be.true;
      expect(round.winningDirection).to.equal(1); // UP
    });
  });

  describe("InsurancePool", function () {
    it("Should track total TFT balance", async function () {
      const depositAmount = ethers.parseUnits("10000", 18);
      await token.transfer(await insurance.getAddress(), depositAmount);
      
      const balance = await token.balanceOf(await insurance.getAddress());
      expect(balance).to.equal(depositAmount);
    });

    it("Should allow deposits from prediction market", async function () {
      const betAmount = ethers.parseUnits("100", 6); // 100 USDT
      
      // Place bet - 20% goes to insurance pool as USDT
      await prediction.connect(user1).placeBet(1, betAmount); // Bet UP
      
      // Check insurance pool received USDT (20% of bet)
      const insuranceBalance = await usdt.balanceOf(await insurance.getAddress());
      expect(insuranceBalance).to.be.gt(0);
    });
  });
});
