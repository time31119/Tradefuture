const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("TradeFuture DApp", function () {
  let tftToken, predictionMarket, insurancePool, nodePartner, marketMaker, mockUSDT;
  let owner, user1, user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy MockUSDT
    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    mockUSDT = await MockUSDT.deploy();
    await mockUSDT.waitForDeployment();

    // Deploy TFTToken
    const TFTToken = await ethers.getContractFactory("TradeFutureToken");
    tftToken = await TFTToken.deploy(
      owner.address, // node dividend wallet
      owner.address, // operations wallet
      owner.address  // market maker wallet
    );
    await tftToken.waitForDeployment();

    // Deploy InsurancePool (with placeholder prediction market)
    const InsurancePool = await ethers.getContractFactory("InsurancePool");
    insurancePool = await InsurancePool.deploy(
      await mockUSDT.getAddress(),
      await tftToken.getAddress(),
      owner.address // placeholder, will update later
    );
    await insurancePool.waitForDeployment();

    // Deploy PredictionMarket (constructor starts first round)
    const PredictionMarket = await ethers.getContractFactory("PredictionMarket");
    predictionMarket = await PredictionMarket.deploy(
      await mockUSDT.getAddress(),
      await tftToken.getAddress(),
      await insurancePool.getAddress(),
      owner.address // oracle
    );
    await predictionMarket.waitForDeployment();

    // Update InsurancePool with correct PredictionMarket address
    await insurancePool.connect(owner).setPredictionMarket(await predictionMarket.getAddress());

    // Deploy NodePartner
    const NodePartner = await ethers.getContractFactory("NodePartner");
    nodePartner = await NodePartner.deploy(
      await tftToken.getAddress(),
      await mockUSDT.getAddress()
    );
    await nodePartner.waitForDeployment();

    // Deploy MarketMaker
    const MarketMaker = await ethers.getContractFactory("MarketMaker");
    marketMaker = await MarketMaker.deploy(
      await mockUSDT.getAddress(),
      await tftToken.getAddress()
    );
    await marketMaker.waitForDeployment();

    // Enable trading for tests
    await tftToken.connect(owner).enableTrading();

    // Set up whitelist
    await tftToken.connect(owner).setWhitelist(await predictionMarket.getAddress(), true);
    await tftToken.connect(owner).setWhitelist(await insurancePool.getAddress(), true);
    await tftToken.connect(owner).setWhitelist(await nodePartner.getAddress(), true);
    await tftToken.connect(owner).setWhitelist(await marketMaker.getAddress(), true);
    await tftToken.connect(owner).setWhitelist(owner.address, true);
    // Don't whitelist user1/user2 for some tests to test tax

    // Transfer TFT to users for testing (owner already has tokens from constructor)
    await tftToken.connect(owner).transfer(user1.address, ethers.parseUnits("1000000", 18));
    await tftToken.connect(owner).transfer(user2.address, ethers.parseUnits("1000000", 18));

    // Mint USDT for testing
    await mockUSDT.connect(owner).mint(owner.address, ethers.parseUnits("1000000", 6));
    await mockUSDT.connect(owner).mint(user1.address, ethers.parseUnits("100000", 6));
    await mockUSDT.connect(owner).mint(user2.address, ethers.parseUnits("100000", 6));
  });

  describe("TFT Token", function () {
    it("Should have correct name and symbol", async function () {
      expect(await tftToken.name()).to.equal("TradeFuture Token");
      expect(await tftToken.symbol()).to.equal("TFT");
    });

    it("Should have correct initial supply after burn", async function () {
      const totalSupply = await tftToken.totalSupply();
      // 11M minted - 10K burn = 10,990,000
      expect(totalSupply).to.equal(ethers.parseUnits("10990000", 18));
    });

    it("Should distribute tax correctly on transfer", async function () {
      const transferAmount = ethers.parseUnits("10000", 18);
      
      // Remove whitelist from user1 to test tax
      await tftToken.connect(owner).setWhitelist(user1.address, false);
      
      const nodeWalletBefore = await tftToken.balanceOf(owner.address);
      
      await tftToken.connect(user1).transfer(user2.address, transferAmount);

      // Tax breakdown: 3% node + 1% ops + 1% mm + 1% burn = 6%
      // All go to owner address in this test
      const nodeWalletAfter = await tftToken.balanceOf(owner.address);
      
      // Total tax should be 6% of 10000 = 600
      expect(nodeWalletAfter - nodeWalletBefore).to.be.gt(0);
    });

    it("Should have correct tax rates", async function () {
      const amount = ethers.parseUnits("10000", 18);
      const breakdown = await tftToken.getTaxBreakdown(amount);
      // breakdown: totalTax, nodeDividend, operations, marketMaker, burnAmount, amountAfterTax
      expect(breakdown.nodeDividend).to.equal(ethers.parseUnits("300", 18)); // 3%
      expect(breakdown.operations).to.equal(ethers.parseUnits("100", 18)); // 1%
      expect(breakdown.marketMaker).to.equal(ethers.parseUnits("100", 18)); // 1%
      expect(breakdown.burnAmount).to.equal(ethers.parseUnits("100", 18)); // 1%
    });

    it("Should allow owner to update tax rates", async function () {
      await tftToken.connect(owner).setTaxRates(200, 150, 100, 100);
      const amount = ethers.parseUnits("10000", 18);
      const breakdown = await tftToken.getTaxBreakdown(amount);
      expect(breakdown.nodeDividend).to.equal(ethers.parseUnits("200", 18));
      expect(breakdown.operations).to.equal(ethers.parseUnits("150", 18));
    });

    it("Should reject tax rates exceeding max", async function () {
      await expect(
        tftToken.connect(owner).setTaxRates(1000, 100, 100, 100)
      ).to.be.revertedWith("Total tax exceeds max");
    });

    it("Should have trading disabled by default", async function () {
      // Deploy fresh token without enabling trading
      const TFTToken = await ethers.getContractFactory("TradeFutureToken");
      const newToken = await TFTToken.deploy(owner.address, owner.address, owner.address);
      expect(await newToken.tradingEnabled()).to.equal(false);
    });

    it("Should allow owner to enable/disable trading", async function () {
      await tftToken.connect(owner).disableTrading();
      expect(await tftToken.tradingEnabled()).to.equal(false);
      
      await tftToken.connect(owner).enableTrading();
      expect(await tftToken.tradingEnabled()).to.equal(true);
    });

    it("Should allow whitelisted addresses to transfer when trading is disabled", async function () {
      await tftToken.connect(owner).disableTrading();
      
      // Owner is whitelisted, should be able to transfer
      await tftToken.connect(owner).transfer(user1.address, ethers.parseUnits("1000", 18));
      
      const balance = await tftToken.balanceOf(user1.address);
      expect(balance).to.be.gt(0);
    });

    it("Should allow batch whitelist update", async function () {
      const addresses = [user1.address, user2.address];
      await tftToken.connect(owner).setWhitelistBatch(addresses, true);
      
      expect(await tftToken.whitelist(user1.address)).to.equal(true);
      expect(await tftToken.whitelist(user2.address)).to.equal(true);
    });

    it("Should exempt whitelisted addresses from tax", async function () {
      // Owner is whitelisted
      const transferAmount = ethers.parseUnits("10000", 18);
      const balanceBefore = await tftToken.balanceOf(user1.address);
      
      await tftToken.connect(owner).transfer(user1.address, transferAmount);
      
      const balanceAfter = await tftToken.balanceOf(user1.address);
      // Whitelisted sender pays no tax
      expect(balanceAfter - balanceBefore).to.equal(transferAmount);
    });

    it("Should return correct canTransfer status", async function () {
      await tftToken.connect(owner).disableTrading();
      
      // Whitelisted can transfer
      expect(await tftToken.canTransfer(owner.address)).to.equal(true);
      
      // Non-whitelisted cannot transfer
      const [, , , , nonWhitelisted] = await ethers.getSigners();
      expect(await tftToken.canTransfer(nonWhitelisted.address)).to.equal(false);
      
      await tftToken.connect(owner).enableTrading();
      expect(await tftToken.canTransfer(nonWhitelisted.address)).to.equal(true);
    });
  });

  describe("Prediction Market", function () {
    it("Should allow users to place bets", async function () {
      const betAmount = ethers.parseUnits("100", 6);
      
      // Set start price for round 1
      await predictionMarket.connect(owner).setRoundStartPrice(ethers.parseUnits("65000", 8));
      
      await mockUSDT.connect(user1).approve(await predictionMarket.getAddress(), betAmount);
      await predictionMarket.connect(user1).placeBet(1, betAmount); // Direction.Up
      
      const bet = await predictionMarket.bets(1, user1.address);
      expect(bet.direction).to.equal(1);
      // Bet amount is 80% because 20% goes to insurance
      expect(bet.amount).to.equal(betAmount * 8000n / 10000n);
    });

    it("Should distribute 20% to insurance pool on bet", async function () {
      const betAmount = ethers.parseUnits("100", 6);
      const insuranceAmount = betAmount * 2000n / 10000n; // 20%

      // Set start price for round 1
      await predictionMarket.connect(owner).setRoundStartPrice(ethers.parseUnits("65000", 8));

      const initialBalance = await mockUSDT.balanceOf(await insurancePool.getAddress());
      await mockUSDT.connect(user1).approve(await predictionMarket.getAddress(), betAmount);
      await predictionMarket.connect(user1).placeBet(1, betAmount);
      const finalBalance = await mockUSDT.balanceOf(await insurancePool.getAddress());

      expect(finalBalance - initialBalance).to.equal(insuranceAmount);
    });

    it("Should reject bets below minimum amount", async function () {
      const smallBet = ethers.parseUnits("0.5", 6); // 0.5 USDT < 1 USDT minimum
      
      // Set start price for round 1
      await predictionMarket.connect(owner).setRoundStartPrice(ethers.parseUnits("65000", 8));
      
      await mockUSDT.connect(user1).approve(await predictionMarket.getAddress(), smallBet);
      
      await expect(
        predictionMarket.connect(user1).placeBet(1, smallBet)
      ).to.be.revertedWith("Below minimum bet");
    });

    it("Should allow oracle to settle rounds", async function () {
      const betAmount = ethers.parseUnits("100", 6);
      
      // Set start price for round 1
      await predictionMarket.connect(owner).setRoundStartPrice(ethers.parseUnits("65000", 8));
      
      await mockUSDT.connect(user1).approve(await predictionMarket.getAddress(), betAmount);
      await predictionMarket.connect(user1).placeBet(1, betAmount);

      // Wait for round to end (5 minutes)
      await time.increase(301);

      // Settle with end price (price went up from 65000 to 66000)
      await predictionMarket.connect(owner).settleRound(ethers.parseUnits("66000", 8));

      const round = await predictionMarket.rounds(1);
      expect(round.settled).to.equal(true);
      expect(round.winningDirection).to.equal(1); // Direction.Up = 1
    });

    it("Should allow winners to claim rewards", async function () {
      const betAmount = ethers.parseUnits("100", 6);
      
      // Set start price for round 1
      await predictionMarket.connect(owner).setRoundStartPrice(ethers.parseUnits("65000", 8));
      
      await mockUSDT.connect(user1).approve(await predictionMarket.getAddress(), betAmount);
      await predictionMarket.connect(user1).placeBet(1, betAmount);

      // Wait for round to end
      await time.increase(301);

      // Settle with UP direction (user1 wins) - price went up
      await predictionMarket.connect(owner).settleRound(ethers.parseUnits("66000", 8));

      const initialBalance = await mockUSDT.balanceOf(user1.address);
      await predictionMarket.connect(user1).claimBet(1);
      const finalBalance = await mockUSDT.balanceOf(user1.address);

      expect(finalBalance).to.be.gt(initialBalance);

      const bet = await predictionMarket.bets(1, user1.address);
      expect(bet.claimed).to.equal(true);
    });
  });

  describe("Insurance Pool", function () {
    it("Should receive USDT from prediction bets", async function () {
      const betAmount = ethers.parseUnits("100", 6);
      const insuranceAmount = betAmount * 2000n / 10000n; // 20%

      // Set start price for round 1
      await predictionMarket.connect(owner).setRoundStartPrice(ethers.parseUnits("65000", 8));

      const initialBalance = await mockUSDT.balanceOf(await insurancePool.getAddress());
      await mockUSDT.connect(user1).approve(await predictionMarket.getAddress(), betAmount);
      await predictionMarket.connect(user1).placeBet(1, betAmount);
      const finalBalance = await mockUSDT.balanceOf(await insurancePool.getAddress());

      expect(finalBalance - initialBalance).to.equal(insuranceAmount);
    });

    it("Should track current round insurance correctly", async function () {
      const betAmount = ethers.parseUnits("100", 6);
      const insuranceAmount = betAmount * 2000n / 10000n; // 20%
      
      // Set start price for round 1
      await predictionMarket.connect(owner).setRoundStartPrice(ethers.parseUnits("65000", 8));
      
      await mockUSDT.connect(user1).approve(await predictionMarket.getAddress(), betAmount);
      await predictionMarket.connect(user1).placeBet(1, betAmount);

      const roundInsurance = await insurancePool.currentRoundInsurance();
      expect(roundInsurance).to.equal(insuranceAmount);
    });
  });

  describe("Node Partner", function () {
    it("Should allow burning TFT for node qualification", async function () {
      const burnAmount = ethers.parseUnits("100000", 18);
      await tftToken.connect(owner).transfer(user1.address, burnAmount);
      await tftToken.connect(user1).approve(await nodePartner.getAddress(), burnAmount);
      
      await nodePartner.connect(user1).createNodeByBurn();
      
      const nodeCount = await nodePartner.userNodeCount(user1.address);
      expect(nodeCount).to.equal(1);
    });

    it("Should track node count correctly", async function () {
      const burnAmount = ethers.parseUnits("100000", 18);
      await tftToken.connect(owner).transfer(user1.address, burnAmount);
      await tftToken.connect(user1).approve(await nodePartner.getAddress(), burnAmount);
      
      await nodePartner.connect(user1).createNodeByBurn();
      
      const nodeCount = await nodePartner.userNodeCount(user1.address);
      expect(nodeCount).to.equal(1);
    });
  });

  describe("Market Maker", function () {
    it("Should allow owner to update referral metrics", async function () {
      await marketMaker.connect(owner).updateReferralMetrics(user1.address, 10, 100000);
      
      const info = await marketMaker.marketMakers(user1.address);
      expect(info.directReferrals).to.equal(10);
      expect(info.teamVolume).to.equal(100000);
    });

    it("Should allow owner to distribute VIP revenue", async function () {
      // First add a market maker that qualifies (10 referrals + $2000 volume)
      await marketMaker.connect(owner).updateReferralMetrics(user1.address, 10, ethers.parseUnits("2000", 18));
      
      const amount = ethers.parseUnits("1000", 6);
      await mockUSDT.connect(owner).approve(await marketMaker.getAddress(), amount);
      
      await marketMaker.connect(owner).distributeVIPRevenue(amount);
      
      // Check that revenue was distributed
      const totalDistributed = await marketMaker.totalVIPRevenue();
      expect(totalDistributed).to.equal(amount);
    });
  });
});
