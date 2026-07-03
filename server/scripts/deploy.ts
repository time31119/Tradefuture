import { ethers } from "hardhat";

/**
 * TradeFuture Contract Deployment Script
 * 
 * Deployment Order:
 * 1. PriceOracle (for development/testing)
 * 2. TFTToken (core token)
 * 3. VIPSystem (VIP membership)
 * 4. NodePartner (node partner system)
 * 5. MarketMaker (market maker system)
 * 6. PredictionMarket (prediction market)
 */

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());
  
  // Configuration
  const config = {
    // Initial BTC price: $65,000 (8 decimals)
    initialBtcPrice: 6500000000000n,
    
    // Wallet addresses (replace with actual addresses)
    operationsWallet: deployer.address, // Replace with actual ops wallet
    nodeDividendPool: deployer.address, // Will be updated after NodePartner deployment
    marketMakerPool: deployer.address, // Will be updated after MarketMaker deployment
    teamWallet: deployer.address, // Replace with actual team wallet
    
    // PancakeSwap addresses (BSC Mainnet)
    // For testnet, use testnet addresses
    pancakeRouter: "0x10ED43C718714eb63d5aA57B78B54704E256024E", // PancakeSwap V2 Router
    usdtAddress: "0x55d398326f99059fF775485246999027B3197955", // BSC-USDT
    
    // For BSC Testnet
    // pancakeRouter: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1",
    // usdtAddress: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
  };
  
  console.log("\n=== Deploying Contracts ===\n");
  
  // 1. Deploy PriceOracle
  console.log("1. Deploying PriceOracle...");
  const PriceOracle = await ethers.getContractFactory("PriceOracle");
  const priceOracle = await PriceOracle.deploy(config.initialBtcPrice);
  await priceOracle.waitForDeployment();
  const priceOracleAddress = await priceOracle.getAddress();
  console.log("   PriceOracle deployed to:", priceOracleAddress);
  
  // 2. Deploy TFTToken
  console.log("2. Deploying TFTToken...");
  const TFTToken = await ethers.getContractFactory("TFTToken");
  const tftToken = await TFTToken.deploy(
    config.operationsWallet,
    config.nodeDividendPool,
    config.marketMakerPool,
    config.teamWallet,
    config.pancakeRouter,
    config.usdtAddress
  );
  await tftToken.waitForDeployment();
  const tftTokenAddress = await tftToken.getAddress();
  console.log("   TFTToken deployed to:", tftTokenAddress);
  
  // 3. Deploy VIPSystem
  console.log("3. Deploying VIPSystem...");
  const VIPSystem = await ethers.getContractFactory("VIPSystem");
  const vipSystem = await VIPSystem.deploy(
    config.usdtAddress,
    tftTokenAddress,
    config.operationsWallet,
    config.nodeDividendPool,
    config.marketMakerPool
  );
  await vipSystem.waitForDeployment();
  const vipSystemAddress = await vipSystem.getAddress();
  console.log("   VIPSystem deployed to:", vipSystemAddress);
  
  // 4. Deploy NodePartner
  console.log("4. Deploying NodePartner...");
  const NodePartner = await ethers.getContractFactory("NodePartner");
  const nodePartner = await NodePartner.deploy(
    tftTokenAddress,
    config.usdtAddress,
    config.pancakeRouter,
    ethers.ZeroAddress // LP pair will be created when liquidity is added
  );
  await nodePartner.waitForDeployment();
  const nodePartnerAddress = await nodePartner.getAddress();
  console.log("   NodePartner deployed to:", nodePartnerAddress);
  
  // 5. Deploy MarketMaker
  console.log("5. Deploying MarketMaker...");
  const MarketMaker = await ethers.getContractFactory("MarketMaker");
  const marketMaker = await MarketMaker.deploy(
    config.usdtAddress,
    tftTokenAddress
  );
  await marketMaker.waitForDeployment();
  const marketMakerAddress = await marketMaker.getAddress();
  console.log("   MarketMaker deployed to:", marketMakerAddress);
  
  // 6. Deploy PredictionMarket
  console.log("6. Deploying PredictionMarket...");
  const PredictionMarket = await ethers.getContractFactory("PredictionMarket");
  const predictionMarket = await PredictionMarket.deploy(
    config.usdtAddress,
    tftTokenAddress,
    priceOracleAddress
  );
  await predictionMarket.waitForDeployment();
  const predictionMarketAddress = await predictionMarket.getAddress();
  console.log("   PredictionMarket deployed to:", predictionMarketAddress);
  
  // Post-deployment configuration
  console.log("\n=== Post-Deployment Configuration ===\n");
  
  // Update NodePartner pool address in TFTToken
  console.log("Updating Node Dividend Pool in TFTToken...");
  await tftToken.setNodeDividendPool(nodePartnerAddress);
  console.log("   Node Dividend Pool set to:", nodePartnerAddress);
  
  // Update Market Maker pool address in TFTToken
  console.log("Updating Market Maker Pool in TFTToken...");
  await tftToken.setMarketMakerPool(marketMakerAddress);
  console.log("   Market Maker Pool set to:", marketMakerAddress);
  
  // Set tax exempt addresses
  console.log("Setting tax exempt addresses...");
  await tftToken.setTaxExempt(predictionMarketAddress, true);
  await tftToken.setTaxExempt(vipSystemAddress, true);
  await tftToken.setTaxExempt(nodePartnerAddress, true);
  await tftToken.setTaxExempt(marketMakerAddress, true);
  console.log("   Tax exempt addresses set");
  
  // Summary
  console.log("\n=== Deployment Summary ===\n");
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Deployer:", deployer.address);
  console.log("");
  console.log("Contract Addresses:");
  console.log("  PriceOracle:     ", priceOracleAddress);
  console.log("  TFTToken:        ", tftTokenAddress);
  console.log("  VIPSystem:       ", vipSystemAddress);
  console.log("  NodePartner:     ", nodePartnerAddress);
  console.log("  MarketMaker:     ", marketMakerAddress);
  console.log("  PredictionMarket:", predictionMarketAddress);
  console.log("");
  console.log("Configuration:");
  console.log("  Operations Wallet:", config.operationsWallet);
  console.log("  Team Wallet:     ", config.teamWallet);
  console.log("  USDT Address:    ", config.usdtAddress);
  console.log("  Pancake Router:  ", config.pancakeRouter);
  console.log("");
  console.log("Next Steps:");
  console.log("  1. Verify contracts on BscScan");
  console.log("  2. Add liquidity to PancakeSwap");
  console.log("  3. Update LP pair address in NodePartner");
  console.log("  4. Transfer remaining TFT to appropriate wallets");
  console.log("  5. Test all contract interactions");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
