// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MarketMaker
 * @notice Market Maker contract for earning prediction market dividends
 * 
 * Two ways to become a Market Maker:
 * 1. Direct referral: Refer 10+ direct users + umbrella team prediction volume >= $2000
 * 2. VIP income: Cumulative VIP activation income >= $500
 * 
 * Market Makers receive:
 * - 0.3% of all prediction market volume (personal exclusive)
 * - 1% of transaction fees (shared equally among all market makers)
 * - Share of VIP activation fee (shared equally)
 */
contract MarketMaker is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // Token addresses
    IERC20 public immutable usdt;
    IERC20 public immutable tft;
    
    // Prediction market address
    address public predictionMarket;
    
    // Qualification thresholds
    uint256 public constant MIN_DIRECT_REFERRALS = 10;
    uint256 public constant MIN_TEAM_VOLUME = 2000 * 1e18;  // $2000 in USDT (18 decimals)
    uint256 public constant MIN_VIP_INCOME = 500 * 1e18;    // $500 in USDT
    
    // Revenue distribution rates (basis points)
    uint256 public constant VOLUME_SHARE_RATE = 30;    // 0.3% = 30 bps
    uint256 public constant FEE_SHARE_RATE = 100;      // 1% = 100 bps
    
    // Market Maker structure
    struct MarketMakerInfo {
        address user;
        uint256 qualifiedAt;
        uint256 directReferrals;
        uint256 teamVolume;
        uint256 vipIncome;
        uint256 qualificationType;  // 1 = Direct referral, 2 = VIP income
        bool active;
    }
    
    // State
    mapping(address => MarketMakerInfo) public marketMakers;
    address[] public marketMakerList;
    uint256 public totalMarketMakers;
    
    // Revenue tracking
    uint256 public totalVolumeRevenue;
    uint256 public totalFeeRevenue;
    uint256 public totalVIPRevenue;
    
    mapping(address => uint256) public claimedVolumeRevenue;
    mapping(address => uint256) public claimedFeeRevenue;
    mapping(address => uint256) public claimedVIPRevenue;
    
    // Accumulators for fair distribution
    uint256 public volumeAccumulator;    // Scaled by 1e18
    uint256 public feeAccumulator;       // Scaled by 1e18
    uint256 public vipAccumulator;       // Scaled by 1e18
    
    mapping(address => uint256) public userVolumeDebt;
    mapping(address => uint256) public userFeeDebt;
    mapping(address => uint256) public userVIPDebt;
    
    // Events
    event MarketMakerQualified(address indexed user, uint256 qualificationType, uint256 timestamp);
    event MarketMakerRevoked(address indexed user);
    event VolumeRevenueDistributed(uint256 amount);
    event FeeRevenueDistributed(uint256 amount);
    event VIPRevenueDistributed(uint256 amount);
    event RevenueClaimed(address indexed user, uint256 volumeAmount, uint256 feeAmount, uint256 vipAmount);
    event ReferralUpdated(address indexed user, uint256 directReferrals, uint256 teamVolume);
    event VIPIncomeUpdated(address indexed user, uint256 vipIncome);
    
    constructor(address _usdt, address _tft) Ownable(msg.sender) {
        require(_usdt != address(0), "Invalid USDT");
        require(_tft != address(0), "Invalid TFT");
        
        usdt = IERC20(_usdt);
        tft = IERC20(_tft);
    }
    
    /**
     * @notice Update referral metrics for a user
     * @dev Called by referral system when user's metrics change
     */
    function updateReferralMetrics(
        address _user,
        uint256 _directReferrals,
        uint256 _teamVolume
    ) external onlyOwner {
        MarketMakerInfo storage info = marketMakers[_user];
        
        if (info.user == address(0)) {
            // New entry
            marketMakers[_user] = MarketMakerInfo({
                user: _user,
                qualifiedAt: 0,
                directReferrals: _directReferrals,
                teamVolume: _teamVolume,
                vipIncome: 0,
                qualificationType: 0,
                active: false
            });
            marketMakerList.push(_user);
        } else {
            info.directReferrals = _directReferrals;
            info.teamVolume = _teamVolume;
        }
        
        emit ReferralUpdated(_user, _directReferrals, _teamVolume);
        
        // Check qualification
        _checkQualification(_user);
    }
    
    /**
     * @notice Update VIP income for a user
     * @dev Called by VIP system when user earns VIP activation fees
     */
    function updateVIPIncome(address _user, uint256 _vipIncome) external onlyOwner {
        MarketMakerInfo storage info = marketMakers[_user];
        
        if (info.user == address(0)) {
            marketMakers[_user] = MarketMakerInfo({
                user: _user,
                qualifiedAt: 0,
                directReferrals: 0,
                teamVolume: 0,
                vipIncome: _vipIncome,
                qualificationType: 0,
                active: false
            });
            marketMakerList.push(_user);
        } else {
            info.vipIncome = _vipIncome;
        }
        
        emit VIPIncomeUpdated(_user, _vipIncome);
        
        // Check qualification
        _checkQualification(_user);
    }
    
    /**
     * @notice Check if user qualifies as Market Maker
     */
    function _checkQualification(address _user) internal {
        MarketMakerInfo storage info = marketMakers[_user];
        
        if (info.active) return; // Already qualified
        
        // Method 1: Direct referral qualification
        bool method1 = info.directReferrals >= MIN_DIRECT_REFERRALS && 
                       info.teamVolume >= MIN_TEAM_VOLUME;
        
        // Method 2: VIP income qualification
        bool method2 = info.vipIncome >= MIN_VIP_INCOME;
        
        if (method1 || method2) {
            info.active = true;
            info.qualifiedAt = block.timestamp;
            info.qualificationType = method1 ? 1 : 2;
            totalMarketMakers++;
            
            // Update debt to current accumulator
            userVolumeDebt[_user] = volumeAccumulator;
            userFeeDebt[_user] = feeAccumulator;
            userVIPDebt[_user] = vipAccumulator;
            
            emit MarketMakerQualified(_user, info.qualificationType, block.timestamp);
        }
    }
    
    /**
     * @notice Distribute volume-based revenue
     * @dev Called when prediction market volume occurs
     */
    function distributeVolumeRevenue(uint256 _amount) external onlyOwner nonReentrant {
        require(_amount > 0, "Amount must be > 0");
        require(totalMarketMakers > 0, "No market makers");
        
        usdt.safeTransferFrom(msg.sender, address(this), _amount);
        
        totalVolumeRevenue += _amount;
        
        // Update accumulator (scaled by 1e18 for precision)
        volumeAccumulator += (_amount * 1e18) / totalMarketMakers;
        
        emit VolumeRevenueDistributed(_amount);
    }
    
    /**
     * @notice Distribute fee-based revenue
     */
    function distributeFeeRevenue(uint256 _amount) external onlyOwner nonReentrant {
        require(_amount > 0, "Amount must be > 0");
        require(totalMarketMakers > 0, "No market makers");
        
        usdt.safeTransferFrom(msg.sender, address(this), _amount);
        
        totalFeeRevenue += _amount;
        
        feeAccumulator += (_amount * 1e18) / totalMarketMakers;
        
        emit FeeRevenueDistributed(_amount);
    }
    
    /**
     * @notice Distribute VIP activation revenue
     */
    function distributeVIPRevenue(uint256 _amount) external onlyOwner nonReentrant {
        require(_amount > 0, "Amount must be > 0");
        require(totalMarketMakers > 0, "No market makers");
        
        usdt.safeTransferFrom(msg.sender, address(this), _amount);
        
        totalVIPRevenue += _amount;
        
        vipAccumulator += (_amount * 1e18) / totalMarketMakers;
        
        emit VIPRevenueDistributed(_amount);
    }
    
    /**
     * @notice Claim all pending revenue
     */
    function claimRevenue() external nonReentrant {
        MarketMakerInfo storage info = marketMakers[msg.sender];
        require(info.active, "Not a market maker");
        
        uint256 volumePending = _calculatePending(volumeAccumulator, userVolumeDebt[msg.sender]);
        uint256 feePending = _calculatePending(feeAccumulator, userFeeDebt[msg.sender]);
        uint256 vipPending = _calculatePending(vipAccumulator, userVIPDebt[msg.sender]);
        
        uint256 totalPending = volumePending + feePending + vipPending;
        require(totalPending > 0, "No pending revenue");
        
        // Update debt
        userVolumeDebt[msg.sender] = volumeAccumulator;
        userFeeDebt[msg.sender] = feeAccumulator;
        userVIPDebt[msg.sender] = vipAccumulator;
        
        claimedVolumeRevenue[msg.sender] += volumePending;
        claimedFeeRevenue[msg.sender] += feePending;
        claimedVIPRevenue[msg.sender] += vipPending;
        
        usdt.safeTransfer(msg.sender, totalPending);
        
        emit RevenueClaimed(msg.sender, volumePending, feePending, vipPending);
    }
    
    /**
     * @notice Calculate pending revenue for a user
     */
    function _calculatePending(
        uint256 _accumulator,
        uint256 _debt
    ) internal pure returns (uint256) {
        if (_accumulator < _debt) return 0;
        return (_accumulator - _debt) / 1e18;
    }
    
    /**
     * @notice Get pending revenue for a user
     */
    function getPendingRevenue(address _user) external view returns (
        uint256 volumePending,
        uint256 feePending,
        uint256 vipPending,
        uint256 totalPending
    ) {
        MarketMakerInfo storage info = marketMakers[_user];
        if (!info.active) return (0, 0, 0, 0);
        
        volumePending = _calculatePending(volumeAccumulator, userVolumeDebt[_user]);
        feePending = _calculatePending(feeAccumulator, userFeeDebt[_user]);
        vipPending = _calculatePending(vipAccumulator, userVIPDebt[_user]);
        totalPending = volumePending + feePending + vipPending;
    }
    
    /**
     * @notice Get market maker info
     */
    function getMarketMakerInfo(address _user) external view returns (
        bool isMarketMaker,
        uint256 qualifiedAt,
        uint256 qualificationType,
        uint256 directReferrals,
        uint256 teamVolume,
        uint256 vipIncome
    ) {
        MarketMakerInfo storage info = marketMakers[_user];
        return (
            info.active,
            info.qualifiedAt,
            info.qualificationType,
            info.directReferrals,
            info.teamVolume,
            info.vipIncome
        );
    }
    
    /**
     * @notice Check qualification progress
     */
    function getQualificationProgress(address _user) external view returns (
        bool method1Qualified,
        bool method2Qualified,
        uint256 directReferralsProgress,  // Percentage (0-100)
        uint256 teamVolumeProgress,       // Percentage (0-100)
        uint256 vipIncomeProgress         // Percentage (0-100)
    ) {
        MarketMakerInfo storage info = marketMakers[_user];
        
        method1Qualified = info.directReferrals >= MIN_DIRECT_REFERRALS && 
                          info.teamVolume >= MIN_TEAM_VOLUME;
        method2Qualified = info.vipIncome >= MIN_VIP_INCOME;
        
        directReferralsProgress = (info.directReferrals * 100) / MIN_DIRECT_REFERRALS;
        if (directReferralsProgress > 100) directReferralsProgress = 100;
        
        teamVolumeProgress = (info.teamVolume * 100) / MIN_TEAM_VOLUME;
        if (teamVolumeProgress > 100) teamVolumeProgress = 100;
        
        vipIncomeProgress = (info.vipIncome * 100) / MIN_VIP_INCOME;
        if (vipIncomeProgress > 100) vipIncomeProgress = 100;
    }
    
    /**
     * @notice Set prediction market address
     */
    function setPredictionMarket(address _market) external onlyOwner {
        predictionMarket = _market;
    }
    
    /**
     * @notice Get total market makers count
     */
    function getTotalMarketMakers() external view returns (uint256) {
        return totalMarketMakers;
    }
    
    /**
     * @notice Emergency function to recover tokens
     */
    function recoverTokens(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(owner()).transfer(address(this).balance);
        } else {
            IERC20(token).transfer(owner(), amount);
        }
    }
}
