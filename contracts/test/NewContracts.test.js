const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("New Contracts", function () {
  let tftToken, mockUSDT, vipSystem, teamVesting, autoBurn;
  let owner, user1, user2, user3, user4, user5;
  let nodePool, opsWallet, mmPool;

  beforeEach(async function () {
    [owner, user1, user2, user3, user4, user5, nodePool, opsWallet, mmPool] = await ethers.getSigners();

    // Deploy MockUSDT
    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    mockUSDT = await MockUSDT.deploy();
    await mockUSDT.waitForDeployment();

    // Deploy TFTToken
    const TFTToken = await ethers.getContractFactory("TradeFutureToken");
    tftToken = await TFTToken.deploy(
      nodePool.address,
      opsWallet.address,
      mmPool.address
    );
    await tftToken.waitForDeployment();

    // Deploy VIPSystem
    const VIPSystem = await ethers.getContractFactory("VIPSystem");
    vipSystem = await VIPSystem.deploy(
      await mockUSDT.getAddress(),
      await tftToken.getAddress(),
      nodePool.address,
      opsWallet.address,
      mmPool.address,
      owner.address // price oracle
    );
    await vipSystem.waitForDeployment();

    // Deploy TeamVesting
    const TeamVesting = await ethers.getContractFactory("TeamVesting");
    teamVesting = await TeamVesting.deploy(await tftToken.getAddress());
    await teamVesting.waitForDeployment();

    // Deploy AutoBurn
    const AutoBurn = await ethers.getContractFactory("AutoBurn");
    autoBurn = await AutoBurn.deploy(
      await tftToken.getAddress(),
      await mockUSDT.getAddress(),
      await mockUSDT.getAddress() // placeholder LP token
    );
    await autoBurn.waitForDeployment();

    // Enable trading
    await tftToken.connect(owner).enableTrading();

    // Set up whitelist
    await tftToken.connect(owner).setWhitelist(await vipSystem.getAddress(), true);
    await tftToken.connect(owner).setWhitelist(await teamVesting.getAddress(), true);
    await tftToken.connect(owner).setWhitelist(await autoBurn.getAddress(), true);
    await tftToken.connect(owner).setWhitelist(owner.address, true);
    await tftToken.connect(owner).setWhitelist(user1.address, true);
    await tftToken.connect(owner).setWhitelist(user2.address, true);
    await tftToken.connect(owner).setWhitelist(user3.address, true);
    await tftToken.connect(owner).setWhitelist(user4.address, true);
    await tftToken.connect(owner).setWhitelist(user5.address, true);

    // Transfer TFT to owner for testing (owner is whitelisted so no tax)
    await tftToken.connect(owner).transfer(user1.address, ethers.parseUnits("2000000", 18));
    await tftToken.connect(owner).transfer(user2.address, ethers.parseUnits("2000000", 18));
    
    // Transfer to teamVesting for testing (whitelisted, no tax)
    await tftToken.connect(owner).transfer(await teamVesting.getAddress(), ethers.parseUnits("1000000", 18));
    // Transfer to autoBurn for testing (whitelisted, no tax)
    await tftToken.connect(owner).transfer(await autoBurn.getAddress(), ethers.parseUnits("200000", 18));
    
    // Transfer TFT to VIPSystem for TFT returns (whitelisted, no tax)
    await tftToken.connect(owner).transfer(await vipSystem.getAddress(), ethers.parseUnits("1000000", 18));

    // Mint USDT for testing
    await mockUSDT.connect(owner).mint(owner.address, ethers.parseUnits("1000000", 6));
    await mockUSDT.connect(owner).mint(user1.address, ethers.parseUnits("100000", 6));
    await mockUSDT.connect(owner).mint(user2.address, ethers.parseUnits("100000", 6));
    await mockUSDT.connect(owner).mint(user3.address, ethers.parseUnits("100000", 6));
    await mockUSDT.connect(owner).mint(user4.address, ethers.parseUnits("100000", 6));
    await mockUSDT.connect(owner).mint(user5.address, ethers.parseUnits("100000", 6));
  });

  describe("VIPSystem", function () {
    it("Should have correct configuration", async function () {
      expect(await vipSystem.VIP_ACTIVATION_FEE()).to.equal(ethers.parseUnits("100", 6));
      expect(await vipSystem.DIRECT_REFERRAL_REWARD()).to.equal(ethers.parseUnits("50", 6));
      expect(await vipSystem.SEE_POINT_REWARD()).to.equal(ethers.parseUnits("1", 6));
      expect(await vipSystem.MAX_REFERRAL_LEVELS()).to.equal(20);
    });

    it("Should allow user to activate VIP", async function () {
      const fee = ethers.parseUnits("100", 6);
      await mockUSDT.connect(user1).approve(await vipSystem.getAddress(), fee);
      
      await vipSystem.connect(user1).activateVIP(ethers.ZeroAddress);
      
      const info = await vipSystem.getVIPInfo(user1.address);
      expect(info.isVIP).to.equal(true);
      expect(await vipSystem.totalVIPs()).to.equal(1);
    });

    it("Should distribute activation fee correctly", async function () {
      const fee = ethers.parseUnits("100", 6);
      
      const nodePoolBefore = await mockUSDT.balanceOf(nodePool.address);
      const opsWalletBefore = await mockUSDT.balanceOf(opsWallet.address);
      const mmPoolBefore = await mockUSDT.balanceOf(mmPool.address);
      
      await mockUSDT.connect(user1).approve(await vipSystem.getAddress(), fee);
      await vipSystem.connect(user1).activateVIP(ethers.ZeroAddress);
      
      const nodePoolAfter = await mockUSDT.balanceOf(nodePool.address);
      const opsWalletAfter = await mockUSDT.balanceOf(opsWallet.address);
      const mmPoolAfter = await mockUSDT.balanceOf(mmPool.address);
      
      // 3% to node pool = 3 USDT
      expect(nodePoolAfter - nodePoolBefore).to.equal(ethers.parseUnits("3", 6));
      // 1% to ops wallet = 1 USDT
      expect(opsWalletAfter - opsWalletBefore).to.equal(ethers.parseUnits("1", 6));
      // 1% to mm pool = 1 USDT
      expect(mmPoolAfter - mmPoolBefore).to.equal(ethers.parseUnits("1", 6));
    });

    it("Should track referral chain", async function () {
      const fee = ethers.parseUnits("100", 6);
      
      // user1 activates VIP (no referrer)
      await mockUSDT.connect(user1).approve(await vipSystem.getAddress(), fee);
      await vipSystem.connect(user1).activateVIP(ethers.ZeroAddress);
      
      // user2 activates VIP with user1 as referrer
      await mockUSDT.connect(user2).approve(await vipSystem.getAddress(), fee);
      await vipSystem.connect(user2).activateVIP(user1.address);
      
      // user3 activates VIP with user2 as referrer
      await mockUSDT.connect(user3).approve(await vipSystem.getAddress(), fee);
      await vipSystem.connect(user3).activateVIP(user2.address);
      
      // Check referral chain for user3
      const chain = await vipSystem.getReferralChain(user3.address);
      expect(chain.length).to.equal(2);
      expect(chain[0]).to.equal(user2.address);
      expect(chain[1]).to.equal(user1.address);
    });

    it("Should distribute direct referral reward", async function () {
      const fee = ethers.parseUnits("100", 6);
      
      // user1 activates VIP
      await mockUSDT.connect(user1).approve(await vipSystem.getAddress(), fee);
      await vipSystem.connect(user1).activateVIP(ethers.ZeroAddress);
      
      // user2 activates VIP with user1 as referrer
      await mockUSDT.connect(user2).approve(await vipSystem.getAddress(), fee);
      await vipSystem.connect(user2).activateVIP(user1.address);
      
      // Check pending direct reward for user1
      const rewards = await vipSystem.getVIPRewards(user1.address);
      expect(rewards.pendingDirectReward).to.equal(ethers.parseUnits("50", 6));
      
      // Claim reward
      const balanceBefore = await mockUSDT.balanceOf(user1.address);
      await vipSystem.connect(user1).claimDirectReward();
      const balanceAfter = await mockUSDT.balanceOf(user1.address);
      
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseUnits("50", 6));
    });

    it("Should distribute see-point rewards to 20 levels", async function () {
      const fee = ethers.parseUnits("100", 6);
      
      // Create a chain of 5 users
      await mockUSDT.connect(user1).approve(await vipSystem.getAddress(), fee);
      await vipSystem.connect(user1).activateVIP(ethers.ZeroAddress);
      
      await mockUSDT.connect(user2).approve(await vipSystem.getAddress(), fee);
      await vipSystem.connect(user2).activateVIP(user1.address);
      
      await mockUSDT.connect(user3).approve(await vipSystem.getAddress(), fee);
      await vipSystem.connect(user3).activateVIP(user2.address);
      
      await mockUSDT.connect(user4).approve(await vipSystem.getAddress(), fee);
      await vipSystem.connect(user4).activateVIP(user3.address);
      
      await mockUSDT.connect(user5).approve(await vipSystem.getAddress(), fee);
      await vipSystem.connect(user5).activateVIP(user4.address);
      
      // user5 activates VIP, see-point rewards should go to user4, user3, user2, user1
      // Each level gets 1 USDT per activation
      // user4 gets: 1 USDT from user5 (level 1)
      // user3 gets: 1 USDT from user4 (level 1) + 1 USDT from user5 (level 2) = 2 USDT
      // user2 gets: 1 USDT from user3 (level 1) + 1 USDT from user4 (level 2) + 1 USDT from user5 (level 3) = 3 USDT
      // user1 gets: 1 USDT from user2 (level 1) + 1 USDT from user3 (level 2) + 1 USDT from user4 (level 3) + 1 USDT from user5 (level 4) = 4 USDT
      const user4Info = await vipSystem.getVIPInfo(user4.address);
      const user3Info = await vipSystem.getVIPInfo(user3.address);
      const user2Info = await vipSystem.getVIPInfo(user2.address);
      const user1Info = await vipSystem.getVIPInfo(user1.address);
      
      expect(user4Info[5]).to.equal(ethers.parseUnits("1", 6)); // 1 USDT from user5
      expect(user3Info[5]).to.equal(ethers.parseUnits("2", 6)); // 1 USDT from user4 + 1 USDT from user5
      expect(user2Info[5]).to.equal(ethers.parseUnits("3", 6)); // 1 USDT from user3 + 1 USDT from user4 + 1 USDT from user5
      expect(user1Info[5]).to.equal(ethers.parseUnits("4", 6)); // 1 USDT from user2 + 1 USDT from user3 + 1 USDT from user4 + 1 USDT from user5
    });

    it("Should return correct TFT amount for USDT", async function () {
      // Default price: 0.001 USDT per TFT
      const usdtAmount = ethers.parseUnits("20", 6); // 20 USDT
      const tftAmount = await vipSystem.calculateTFTReturn(usdtAmount);
      
      // 20 USDT / 0.001 = 20000 TFT
      expect(tftAmount).to.equal(ethers.parseUnits("20000", 18));
    });

    it("Should allow owner to update TFT price", async function () {
      const newPrice = ethers.parseUnits("0.02", 18); // 0.02 USDT
      await vipSystem.connect(owner).setTFTPrice(newPrice);
      
      expect(await vipSystem.tftPriceInUSDT()).to.equal(newPrice);
    });
  });

  describe("TeamVesting", function () {
    it("Should have correct configuration", async function () {
      expect(await teamVesting.TOTAL_VESTING_AMOUNT()).to.equal(ethers.parseUnits("1000000", 18));
      expect(await teamVesting.RELEASE_PER_MONTH()).to.equal(ethers.parseUnits("20000", 18));
    });

    it("Should allow adding beneficiaries", async function () {
      await teamVesting.connect(owner).addBeneficiary(user1.address, ethers.parseUnits("500000", 18));
      
      const info = await teamVesting.getBeneficiaryInfo(user1.address);
      expect(info.allocatedAmount).to.equal(ethers.parseUnits("500000", 18));
    });

    it("Should allow batch adding beneficiaries", async function () {
      const beneficiaries = [user1.address, user2.address];
      const amounts = [ethers.parseUnits("400000", 18), ethers.parseUnits("600000", 18)];
      
      await teamVesting.connect(owner).addBeneficiaries(beneficiaries, amounts);
      
      expect(await teamVesting.getBeneficiaryCount()).to.equal(2);
    });

    it("Should start vesting with correct amount", async function () {
      // Tokens already transferred in beforeEach
      await teamVesting.connect(owner).startVesting();
      
      const progress = await teamVesting.getVestingProgress();
      expect(progress.totalLockedAmount).to.equal(ethers.parseUnits("1000000", 18));
    });

    it("Should not release tokens during cliff period", async function () {
      // Add beneficiary and start vesting
      await teamVesting.connect(owner).addBeneficiary(user1.address, ethers.parseUnits("500000", 18));
      // Tokens already in contract from beforeEach
      await teamVesting.connect(owner).startVesting();
      
      // Try to release immediately (should fail)
      await expect(teamVesting.connect(user1).release()).to.be.revertedWith("Nothing to release");
    });

    it("Should release tokens after cliff period", async function () {
      // Add beneficiary and start vesting
      await teamVesting.connect(owner).addBeneficiary(user1.address, ethers.parseUnits("500000", 18));
      // Tokens already in contract from beforeEach
      await teamVesting.connect(owner).startVesting();
      
      // Wait for 2 months (60 days)
      await time.increase(60 * 24 * 60 * 60);
      
      // Release tokens
      const balanceBefore = await tftToken.balanceOf(user1.address);
      await teamVesting.connect(user1).release();
      const balanceAfter = await tftToken.balanceOf(user1.address);
      
      // Should release 2 months * 20,000 = 40,000 TFT
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseUnits("40000", 18));
    });

    it("Should release all tokens after 50 months", async function () {
      // Add beneficiary and start vesting
      await teamVesting.connect(owner).addBeneficiary(user1.address, ethers.parseUnits("500000", 18));
      // Tokens already in contract from beforeEach
      await teamVesting.connect(owner).startVesting();
      
      // Wait for 51 months
      await time.increase(51 * 30 * 24 * 60 * 60);
      
      // Release tokens
      const balanceBefore = await tftToken.balanceOf(user1.address);
      await teamVesting.connect(user1).release();
      const balanceAfter = await tftToken.balanceOf(user1.address);
      
      // Should release all 500,000 TFT
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseUnits("500000", 18));
    });
  });

  describe("AutoBurn", function () {
    it("Should have correct configuration", async function () {
      expect(await autoBurn.MIN_SUPPLY()).to.equal(ethers.parseUnits("50000", 18));
      expect(await autoBurn.BURN_INTERVAL()).to.equal(3600); // 1 hour
    });

    it("Should have correct tier thresholds", async function () {
      const config = await autoBurn.getTierConfig();
      expect(config.tier1Threshold).to.equal(ethers.parseUnits("5000000", 6)); // 5M USDT
      expect(config.tier2Threshold).to.equal(ethers.parseUnits("2000000", 6)); // 2M USDT
      expect(config.tier3Threshold).to.equal(ethers.parseUnits("50100", 6));   // 50.1K USDT
      expect(config.tier4Threshold).to.equal(ethers.parseUnits("50000", 6));   // 50K USDT
    });

    it("Should allow depositing tokens for burn", async function () {
      const amount = ethers.parseUnits("100000", 18);
      await tftToken.connect(owner).approve(await autoBurn.getAddress(), amount);
      
      const balanceBefore = await tftToken.balanceOf(await autoBurn.getAddress());
      await autoBurn.connect(owner).depositForBurn(amount);
      const balanceAfter = await tftToken.balanceOf(await autoBurn.getAddress());
      
      expect(balanceAfter - balanceBefore).to.equal(amount);
    });

    it("Should allow manual burn by owner", async function () {
      // Tokens already in contract from beforeEach (200,000 TFT)
      const totalBurnedBefore = await autoBurn.totalBurned();
      const burnAmount = ethers.parseUnits("50000", 18);
      await autoBurn.connect(owner).manualBurn(burnAmount);
      const totalBurnedAfter = await autoBurn.totalBurned();
      
      // Check that totalBurned increased (tokens transferred to burn address)
      expect(totalBurnedAfter - totalBurnedBefore).to.equal(burnAmount);
    });

    it("Should not burn below minimum supply", async function () {
      // Tokens already in contract from beforeEach (200,000 TFT)
      // Current supply is about 10.99M - 5.2M transferred = ~5.79M
      // Min supply is 50,000
      // So we can burn up to ~5.74M
      // Try to burn more than available
      const hugeAmount = ethers.parseUnits("10000000", 18); // 10M
      await expect(
        autoBurn.connect(owner).manualBurn(hugeAmount)
      ).to.be.reverted;
    });

    it("Should allow toggling auto burn", async function () {
      await autoBurn.connect(owner).setAutoBurnEnabled(false);
      expect(await autoBurn.autoBurnEnabled()).to.equal(false);
      
      await autoBurn.connect(owner).setAutoBurnEnabled(true);
      expect(await autoBurn.autoBurnEnabled()).to.equal(true);
    });

    it("Should return correct burn stats", async function () {
      const stats = await autoBurn.getBurnStats();
      expect(stats._totalBurned).to.equal(0);
      expect(stats._burnCount).to.equal(0);
    });

    it("Should check if burn can be executed", async function () {
      // Initially cannot execute (no tokens in contract)
      const canBurn = await autoBurn.canExecuteBurn();
      expect(canBurn).to.equal(false);
    });
  });
});
