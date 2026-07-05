const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());
  
  // Configuration
  const CONFIG = {
    // BSC Mainnet USDT address
    USDT: "0x55d398326f99059fF775485246999027B3197955",
    BURN_ADDRESS: "0x000000000000000000000000000000000000dEaD",
    
    // Wallet addresses (change to actual addresses before mainnet deployment)
    nodeDividendWallet: deployer.address,  // Will be updated to NodePartner
    operationsWallet: deployer.address,    // Operations team wallet
    marketMakerWallet: deployer.address,   // Will be updated to MarketMaker
    
    // Team vesting
    teamVestingAmount: hre.ethers.parseUnits("1000000", 18), // 1M TFT
    teamVestingMonths: 50,
    
    // Initial liquidity
    initialUSDT: hre.ethers.parseUnits("100", 6),  // 100 USDT
    initialTFT: hre.ethers.parseUnits("100000", 18), // 100,000 TFT
  };
  
  const deployedContracts = {};
  
  // ==========================================
  // 1. Deploy TradeFutureToken
  // ==========================================
  console.log("\n=== [1/9] Deploying TradeFutureToken ===");
  const TradeFutureToken = await hre.ethers.getContractFactory("TradeFutureToken");
  const tft = await TradeFutureToken.deploy(
    CONFIG.nodeDividendWallet,
    CONFIG.operationsWallet,
    CONFIG.marketMakerWallet
  );
  await tft.waitForDeployment();
  deployedContracts.TradeFutureToken = await tft.getAddress();
  console.log("TradeFutureToken:", deployedContracts.TradeFutureToken);
  
  // ==========================================
  // 2. Deploy InsurancePool
  // ==========================================
  console.log("\n=== [2/9] Deploying InsurancePool ===");
  const InsurancePool = await hre.ethers.getContractFactory("InsurancePool");
  const insurance = await InsurancePool.deploy(
    CONFIG.USDT,
    deployedContracts.TradeFutureToken,
    deployer.address // placeholder, will update
  );
  await insurance.waitForDeployment();
  deployedContracts.InsurancePool = await insurance.getAddress();
  console.log("InsurancePool:", deployedContracts.InsurancePool);
  
  // ==========================================
  // 3. Deploy PredictionMarket
  // ==========================================
  console.log("\n=== [3/9] Deploying PredictionMarket ===");
  const PredictionMarket = await hre.ethers.getContractFactory("PredictionMarket");
  const prediction = await PredictionMarket.deploy(
    CONFIG.USDT,
    deployedContracts.TradeFutureToken,
    deployedContracts.InsurancePool,
    deployer.address // oracle
  );
  await prediction.waitForDeployment();
  deployedContracts.PredictionMarket = await prediction.getAddress();
  console.log("PredictionMarket:", deployedContracts.PredictionMarket);
  
  // ==========================================
  // 4. Deploy NodePartner
  // ==========================================
  console.log("\n=== [4/9] Deploying NodePartner ===");
  const NodePartner = await hre.ethers.getContractFactory("NodePartner");
  const nodePartner = await NodePartner.deploy(
    deployedContracts.TradeFutureToken,
    CONFIG.USDT
  );
  await nodePartner.waitForDeployment();
  deployedContracts.NodePartner = await nodePartner.getAddress();
  console.log("NodePartner:", deployedContracts.NodePartner);
  
  // ==========================================
  // 5. Deploy MarketMaker
  // ==========================================
  console.log("\n=== [5/9] Deploying MarketMaker ===");
  const MarketMaker = await hre.ethers.getContractFactory("MarketMaker");
  const marketMaker = await MarketMaker.deploy(
    CONFIG.USDT,
    deployedContracts.TradeFutureToken
  );
  await marketMaker.waitForDeployment();
  deployedContracts.MarketMaker = await marketMaker.getAddress();
  console.log("MarketMaker:", deployedContracts.MarketMaker);
  
  // ==========================================
  // 6. Deploy VIPSystem
  // ==========================================
  console.log("\n=== [6/9] Deploying VIPSystem ===");
  const VIPSystem = await hre.ethers.getContractFactory("VIPSystem");
  const vipSystem = await VIPSystem.deploy(
    CONFIG.USDT,
    deployedContracts.TradeFutureToken,
    deployedContracts.NodePartner,
    deployedContracts.MarketMaker,
    CONFIG.operationsWallet,
    deployedContracts.InsurancePool
  );
  await vipSystem.waitForDeployment();
  deployedContracts.VIPSystem = await vipSystem.getAddress();
  console.log("VIPSystem:", deployedContracts.VIPSystem);
  
  // ==========================================
  // 7. Deploy TeamVesting
  // ==========================================
  console.log("\n=== [7/9] Deploying TeamVesting ===");
  const TeamVesting = await hre.ethers.getContractFactory("TeamVesting");
  const teamVesting = await TeamVesting.deploy(
    deployedContracts.TradeFutureToken
  );
  await teamVesting.waitForDeployment();
  deployedContracts.TeamVesting = await teamVesting.getAddress();
  console.log("TeamVesting:", deployedContracts.TeamVesting);
  
  // ==========================================
  // 8. Deploy AutoBurn (lpToken will be set later)
  // ==========================================
  console.log("\n=== [8/9] Deploying AutoBurn ===");
  const AutoBurn = await hre.ethers.getContractFactory("AutoBurn");
  const autoBurn = await AutoBurn.deploy(
    deployedContracts.TradeFutureToken,
    CONFIG.USDT,
    hre.ethers.ZeroAddress // LP token will be set after adding liquidity
  );
  await autoBurn.waitForDeployment();
  deployedContracts.AutoBurn = await autoBurn.getAddress();
  console.log("AutoBurn:", deployedContracts.AutoBurn);
  
  // ==========================================
  // 9. Deploy PhaseControl
  // ==========================================
  console.log("\n=== [9/9] Deploying PhaseControl ===");
  const PhaseControl = await hre.ethers.getContractFactory("PhaseControl");
  const phaseControl = await PhaseControl.deploy(
    deployedContracts.TradeFutureToken,
    deployedContracts.PredictionMarket,
    deployedContracts.InsurancePool,
    deployedContracts.NodePartner,
    deployedContracts.MarketMaker
  );
  await phaseControl.waitForDeployment();
  deployedContracts.PhaseControl = await phaseControl.getAddress();
  console.log("PhaseControl:", deployedContracts.PhaseControl);
  
  // ==========================================
  // Configure Contract Relationships
  // ==========================================
  console.log("\n=== Configuring Contract Relationships ===");
  
  // Set InsurancePool's PredictionMarket
  console.log("Setting PredictionMarket in InsurancePool...");
  await insurance.setPredictionMarket(deployedContracts.PredictionMarket);
  
  // Set whitelist for all contracts in TFT
  console.log("Setting whitelist in TradeFutureToken...");
  const whitelistContracts = [
    "PredictionMarket",
    "InsurancePool", 
    "NodePartner",
    "MarketMaker",
    "VIPSystem",
    "AutoBurn"
  ];
  
  for (const contractName of whitelistContracts) {
    await tft.setWhitelist(deployedContracts[contractName], true);
    console.log(`  Whitelisted: ${contractName}`);
  }
  
  // ==========================================
  // Summary
  // ==========================================
  console.log("\n========================================");
  console.log("       DEPLOYMENT SUMMARY");
  console.log("========================================");
  console.log("Network:", hre.network.name);
  console.log("Deployer:", deployer.address);
  console.log("----------------------------------------");
  for (const [name, address] of Object.entries(deployedContracts)) {
    console.log(`${name}: ${address}`);
  }
  console.log("----------------------------------------");
  console.log("USDT:", CONFIG.USDT);
  console.log("========================================\n");
  
  // Save deployment info
  const fs = require("fs");
  const deploymentInfo = {
    network: hre.network.name,
    deployer: deployer.address,
    contracts: deployedContracts,
    config: {
      USDT: CONFIG.USDT,
      teamVestingAmount: CONFIG.teamVestingAmount.toString(),
      teamVestingMonths: CONFIG.teamVestingMonths,
    },
    timestamp: new Date().toISOString(),
  };
  
  fs.writeFileSync(
    `deployment-${hre.network.name}.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("Deployment info saved to deployment-" + hre.network.name + ".json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
