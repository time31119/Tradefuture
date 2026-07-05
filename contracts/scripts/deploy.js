const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());
  
  // Configuration
  const CONFIG = {
    // BSC Mainnet addresses (change for testnet)
    USDT: "0x55d398326f99059fF775485246999027B3197955",  // BSC USDT
    BURN_ADDRESS: "0x000000000000000000000000000000000000dEaD",
    
    // Token parameters
    TOKEN_NAME: "TradeFuture Token",
    TOKEN_SYMBOL: "TFT",
    INITIAL_SUPPLY: hre.ethers.parseUnits("10000000", 18),  // 10M TFT
    
    // Tax distribution (total 6%)
    BURN_RATE: 500,       // 5% burn
    NODE_POOL_RATE: 30,   // 0.3% node pool
    OPERATIONS_RATE: 100, // 1% operations
    MARKET_MAKER_RATE: 100, // 1% market maker
    INSURANCE_RATE: 200,  // 2% insurance (was 20% bet, now 2% of trade)
    
    // Prediction market
    ROUND_DURATION: 300,  // 5 minutes
    INSURANCE_PERCENTAGE: 20,  // 20% of bet goes to insurance
  };
  
  console.log("\n=== Deploying TradeFutureToken ===");
  const TradeFutureToken = await hre.ethers.getContractFactory("TradeFutureToken");
  const tft = await TradeFutureToken.deploy(
    deployer.address, // _nodeDividendWallet (will be updated to node contract after deployment)
    deployer.address, // _operationsWallet
    deployer.address  // _marketMakerWallet (will be updated to market maker contract after deployment)
  );
  await tft.waitForDeployment();
  const tftAddress = await tft.getAddress();
  console.log("TradeFutureToken deployed to:", tftAddress);
  
  console.log("\n=== Deploying PredictionMarket ===");
  const PredictionMarket = await hre.ethers.getContractFactory("PredictionMarket");
  const prediction = await PredictionMarket.deploy(
    CONFIG.USDT,
    tftAddress,
    CONFIG.ROUND_DURATION,
    CONFIG.INSURANCE_PERCENTAGE
  );
  await prediction.waitForDeployment();
  const predictionAddress = await prediction.getAddress();
  console.log("PredictionMarket deployed to:", predictionAddress);
  
  console.log("\n=== Deploying InsurancePool ===");
  const InsurancePool = await hre.ethers.getContractFactory("InsurancePool");
  const insurance = await InsurancePool.deploy(
    CONFIG.USDT,
    tftAddress,
    predictionAddress
  );
  await insurance.waitForDeployment();
  const insuranceAddress = await insurance.getAddress();
  console.log("InsurancePool deployed to:", insuranceAddress);
  
  console.log("\n=== Deploying NodePartner ===");
  const NodePartner = await hre.ethers.getContractFactory("NodePartner");
  const nodePartner = await NodePartner.deploy(tftAddress, CONFIG.USDT);
  await nodePartner.waitForDeployment();
  const nodePartnerAddress = await nodePartner.getAddress();
  console.log("NodePartner deployed to:", nodePartnerAddress);
  
  console.log("\n=== Deploying MarketMaker ===");
  const MarketMaker = await hre.ethers.getContractFactory("MarketMaker");
  const marketMaker = await MarketMaker.deploy(CONFIG.USDT, tftAddress);
  await marketMaker.waitForDeployment();
  const marketMakerAddress = await marketMaker.getAddress();
  console.log("MarketMaker deployed to:", marketMakerAddress);
  
  // Configure contract relationships
  console.log("\n=== Configuring Contract Relationships ===");
  
  // Set Insurance Pool in Prediction Market
  await prediction.setInsurancePool(insuranceAddress);
  console.log("Insurance Pool set in Prediction Market");
  
  // Set Node Pool in Token
  await tft.setNodePool(nodePartnerAddress);
  console.log("Node Pool set in Token");
  
  // Set Market Maker Pool in Token
  await tft.setMarketMakerPool(marketMakerAddress);
  console.log("Market Maker Pool set in Token");
  
  // Set Insurance Pool in Token
  await tft.setInsurancePool(insuranceAddress);
  console.log("Insurance Pool set in Token");
  
  // Set Prediction Market in Market Maker
  await marketMaker.setPredictionMarket(predictionAddress);
  console.log("Prediction Market set in Market Maker");
  
  // Summary
  console.log("\n========================================");
  console.log("       DEPLOYMENT SUMMARY");
  console.log("========================================");
  console.log("Network:", hre.network.name);
  console.log("Deployer:", deployer.address);
  console.log("----------------------------------------");
  console.log("TradeFutureToken:", tftAddress);
  console.log("PredictionMarket:", predictionAddress);
  console.log("InsurancePool:   ", insuranceAddress);
  console.log("NodePartner:     ", nodePartnerAddress);
  console.log("MarketMaker:     ", marketMakerAddress);
  console.log("----------------------------------------");
  console.log("USDT:            ", CONFIG.USDT);
  console.log("Round Duration:  ", CONFIG.ROUND_DURATION, "seconds");
  console.log("Insurance %:     ", CONFIG.INSURANCE_PERCENTAGE, "%");
  console.log("========================================\n");
  
  // Save deployment info
  const fs = require("fs");
  const deploymentInfo = {
    network: hre.network.name,
    deployer: deployer.address,
    contracts: {
      TradeFutureToken: tftAddress,
      PredictionMarket: predictionAddress,
      InsurancePool: insuranceAddress,
      NodePartner: nodePartnerAddress,
      MarketMaker: marketMakerAddress,
    },
    config: {
      USDT: CONFIG.USDT,
      roundDuration: CONFIG.ROUND_DURATION,
      insurancePercentage: CONFIG.INSURANCE_PERCENTAGE,
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
