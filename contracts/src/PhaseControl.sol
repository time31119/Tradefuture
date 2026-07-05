// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PhaseControl
 * @notice Controls the three phases of TradeFuture platform
 * 
 * Phase 1 (ColdStart): Trading disabled, TFT only through nodes and predictions
 * Phase 2 (SemiOpen): Trading open with high sell tax (15%)
 * Phase 3 (FullyOpen): Trading fully open with normal tax (6%)
 * 
 * Phase transitions are based on quantifiable metrics:
 * - TFT holders count
 * - Insurance pool TFT reserve
 * - Prediction market volume
 * - Node partner count
 * - Market maker count
 * - Operating time
 */
contract PhaseControl is Ownable {
    
    enum Phase {
        ColdStart,      // Phase 1: Trading disabled
        SemiOpen,       // Phase 2: High sell tax
        FullyOpen       // Phase 3: Normal trading
    }
    
    // Current phase
    Phase public currentPhase = Phase.ColdStart;
    
    // Launch timestamp
    uint256 public launchTime;
    
    // Phase transition thresholds
    struct PhaseThresholds {
        // Phase 1 -> Phase 2
        uint256 p1ToP2Holders;        // 500
        uint256 p1ToP2InsuranceTFT;   // 100,000 TFT
        uint256 p1ToP2Volume;         // 100,000 USDT
        uint256 p1ToP2Nodes;          // 50
        uint256 p1ToP2MinTime;        // 30 days
        
        // Phase 2 -> Phase 3
        uint256 p2ToP3Holders;        // 2,000
        uint256 p2ToP3TVL;            // 500,000 USDT
        uint256 p2ToP3DailyVolume;    // 10,000 USDT
        uint256 p2ToP3Nodes;          // 200
        uint256 p2ToP3MarketMakers;   // 20
        uint256 p2ToP3MinTime;        // 90 days
    }
    
    PhaseThresholds public thresholds;
    
    // External contract addresses for checking metrics
    address public tftToken;
    address public insurancePool;
    address public predictionMarket;
    address public nodePartner;
    address public marketMaker;
    
    // Tax rates for each phase (in basis points)
    uint256 public constant COLD_START_SELL_TAX = 0;      // Trading disabled
    uint256 public constant SEMI_OPEN_SELL_TAX = 1500;    // 15%
    uint256 public constant FULLY_OPEN_SELL_TAX = 600;    // 6%
    uint256 public constant BUY_TAX = 600;                // 6% always
    
    // Events
    event PhaseTransitioned(Phase oldPhase, Phase newPhase, uint256 timestamp);
    event ThresholdsUpdated(PhaseThresholds newThresholds);
    event ContractAddressesUpdated(address tft, address insurance, address prediction, address node, address market);
    
    constructor(
        address _tftToken,
        address _insurancePool,
        address _predictionMarket,
        address _nodePartner,
        address _marketMaker
    ) Ownable(msg.sender) {
        require(_tftToken != address(0), "Invalid TFT");
        
        tftToken = _tftToken;
        insurancePool = _insurancePool;
        predictionMarket = _predictionMarket;
        nodePartner = _nodePartner;
        marketMaker = _marketMaker;
        
        launchTime = block.timestamp;
        
        // Set default thresholds
        thresholds = PhaseThresholds({
            p1ToP2Holders: 500,
            p1ToP2InsuranceTFT: 100_000e18,
            p1ToP2Volume: 100_000e6,
            p1ToP2Nodes: 50,
            p1ToP2MinTime: 30 days,
            p2ToP3Holders: 2_000,
            p2ToP3TVL: 500_000e6,
            p2ToP3DailyVolume: 10_000e6,
            p2ToP3Nodes: 200,
            p2ToP3MarketMakers: 20,
            p2ToP3MinTime: 90 days
        });
    }
    
    /**
     * @notice Check if can transition from Phase 1 to Phase 2
     */
    function canTransitionToSemiOpen() public view returns (bool) {
        if (currentPhase != Phase.ColdStart) return false;
        
        // Check minimum time
        if (block.timestamp < launchTime + thresholds.p1ToP2MinTime) return false;
        
        // Check metrics (would need to call external contracts)
        // For now, owner can manually transition after verifying metrics
        return true;
    }
    
    /**
     * @notice Check if can transition from Phase 2 to Phase 3
     */
    function canTransitionToFullyOpen() public view returns (bool) {
        if (currentPhase != Phase.SemiOpen) return false;
        
        // Check minimum time
        if (block.timestamp < launchTime + thresholds.p2ToP3MinTime) return false;
        
        // Check metrics (would need to call external contracts)
        // For now, owner can manually transition after verifying metrics
        return true;
    }
    
    /**
     * @notice Transition to SemiOpen phase (Phase 2)
     */
    function transitionToSemiOpen() external onlyOwner {
        require(currentPhase == Phase.ColdStart, "Not in ColdStart phase");
        require(canTransitionToSemiOpen(), "Conditions not met");
        
        Phase oldPhase = currentPhase;
        currentPhase = Phase.SemiOpen;
        
        emit PhaseTransitioned(oldPhase, Phase.SemiOpen, block.timestamp);
    }
    
    /**
     * @notice Transition to FullyOpen phase (Phase 3)
     */
    function transitionToFullyOpen() external onlyOwner {
        require(currentPhase == Phase.SemiOpen, "Not in SemiOpen phase");
        require(canTransitionToFullyOpen(), "Conditions not met");
        
        Phase oldPhase = currentPhase;
        currentPhase = Phase.FullyOpen;
        
        emit PhaseTransitioned(oldPhase, Phase.FullyOpen, block.timestamp);
    }
    
    /**
     * @notice Get current sell tax rate based on phase
     */
    function getCurrentSellTaxRate() external view returns (uint256) {
        if (currentPhase == Phase.ColdStart) {
            return 10000; // 100% - effectively disabled
        } else if (currentPhase == Phase.SemiOpen) {
            return SEMI_OPEN_SELL_TAX; // 15%
        } else {
            return FULLY_OPEN_SELL_TAX; // 6%
        }
    }
    
    /**
     * @notice Get current buy tax rate (always 6%)
     */
    function getCurrentBuyTaxRate() external pure returns (uint256) {
        return BUY_TAX;
    }
    
    /**
     * @notice Check if trading is allowed for non-whitelisted users
     */
    function isTradingAllowed() external view returns (bool) {
        return currentPhase != Phase.ColdStart;
    }
    
    /**
     * @notice Update phase thresholds (owner only)
     */
    function updateThresholds(PhaseThresholds memory _thresholds) external onlyOwner {
        thresholds = _thresholds;
        emit ThresholdsUpdated(_thresholds);
    }
    
    /**
     * @notice Update contract addresses
     */
    function updateContractAddresses(
        address _tftToken,
        address _insurancePool,
        address _predictionMarket,
        address _nodePartner,
        address _marketMaker
    ) external onlyOwner {
        tftToken = _tftToken;
        insurancePool = _insurancePool;
        predictionMarket = _predictionMarket;
        nodePartner = _nodePartner;
        marketMaker = _marketMaker;
        
        emit ContractAddressesUpdated(_tftToken, _insurancePool, _predictionMarket, _nodePartner, _marketMaker);
    }
    
    /**
     * @notice Get phase name as string
     */
    function getPhaseName() external view returns (string memory) {
        if (currentPhase == Phase.ColdStart) {
            return "ColdStart";
        } else if (currentPhase == Phase.SemiOpen) {
            return "SemiOpen";
        } else {
            return "FullyOpen";
        }
    }
    
    /**
     * @notice Get all phase information
     */
    function getPhaseInfo() external view returns (
        Phase phase,
        string memory phaseName,
        uint256 sellTaxRate,
        uint256 buyTaxRate,
        bool tradingAllowed,
        uint256 daysSinceLaunch
    ) {
        phase = currentPhase;
        phaseName = this.getPhaseName();
        sellTaxRate = this.getCurrentSellTaxRate();
        buyTaxRate = BUY_TAX;
        tradingAllowed = currentPhase != Phase.ColdStart;
        daysSinceLaunch = (block.timestamp - launchTime) / 1 days;
    }
}
