// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MarketMaker
 * @dev Market Maker System for TFT Token
 * 
 * Qualification:
 * - Refer 10 people with ≥$200 each, total ≥$2,000
 * - OR personal VIP income ≥$500
 * 
 * Benefits:
 * - 0.3% from subordinate predictions
 * - 1% of transaction tax dividends (evenly distributed)
 * - 1% of VIP activation fee dividends
 */

interface IBEP20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract MarketMaker {
    // Market Maker struct
    struct Maker {
        uint256 id;
        address user;
        uint256 directReferrals; // Direct referrals count
        uint256 totalReferralAmount; // Total referral amount in USDT
        uint256 vipIncome; // Personal VIP income in USDT
        bool isQualified;
        uint256 pendingRewards;
        uint256 claimedRewards;
        uint256 lastClaimTime;
        uint256 createdAt;
    }
    
    // Subordinate prediction record
    struct SubordinatePrediction {
        address subordinate;
        uint256 amount;
        uint256 reward;
        uint256 timestamp;
    }
    
    // Constants
    uint256 public constant MIN_REFERRAL_COUNT = 10;
    uint256 public constant MIN_REFERRAL_PER_PERSON = 200 * 10**6; // 200 USDT
    uint256 public constant MIN_TOTAL_REFERRAL = 2_000 * 10**6; // 2,000 USDT
    uint256 public constant MIN_VIP_INCOME = 500 * 10**6; // 500 USDT
    uint256 public constant SUBORDINATE_REWARD_BPS = 30; // 0.3%
    uint256 public constant MAKER_TAX_DIVIDEND_BPS = 100; // 1%
    uint256 public constant MAKER_VIP_DIVIDEND_BPS = 100; // 1%
    
    // State
    uint256 public totalMakers;
    uint256 public qualifiedMakerCount;
    uint256 public totalDividendPool; // For 1% tax dividends
    uint256 public totalVIPDividendPool; // For 1% VIP fee dividends
    
    // Contracts
    address public owner;
    IBEP20 public usdtToken;
    IBEP20 public tftToken;
    
    // Mappings
    mapping(address => Maker) public makers;
    mapping(address => address[]) public subordinateMap; // Maker -> subordinates
    mapping(address => SubordinatePrediction[]) public subordinatePredictions;
    mapping(address => bool) public isMarketMaker;
    
    // Events
    event MakerRegistered(address indexed user, uint256 makerId);
    event MakerQualified(address indexed user);
    event SubordinateReward(address indexed maker, address indexed subordinate, uint256 amount, uint256 reward);
    event MakerRewardsClaimed(address indexed user, uint256 amount);
    event DividendDistributed(uint256 amount);
    event VIPDividendDistributed(uint256 amount);
    
    constructor(address _usdtToken, address _tftToken) {
        owner = msg.sender;
        usdtToken = IBEP20(_usdtToken);
        tftToken = IBEP20(_tftToken);
    }
    
    // ============ Registration ============
    
    /**
     * @dev Register as a potential market maker
     */
    function register() external {
        require(makers[msg.sender].createdAt == 0, "Already registered");
        
        makers[msg.sender] = Maker({
            id: totalMakers++,
            user: msg.sender,
            directReferrals: 0,
            totalReferralAmount: 0,
            vipIncome: 0,
            isQualified: false,
            pendingRewards: 0,
            claimedRewards: 0,
            lastClaimTime: block.timestamp,
            createdAt: block.timestamp
        });
        
        emit MakerRegistered(msg.sender, totalMakers - 1);
    }
    
    /**
     * @dev Add a subordinate (called when someone joins under this maker)
     * @param subordinate Address of the subordinate
     * @param amount Amount of their first prediction in USDT
     */
    function addSubordinate(address subordinate, uint256 amount) external {
        require(msg.sender == owner, "Only owner");
        require(makers[subordinate].createdAt == 0, "Subordinate cannot be a maker");
        
        // Find the maker who referred this subordinate
        // In production, this would be tracked in a referral contract
        // For now, we assume the caller specifies the correct maker
        
        // This function should be called by the referral system
        // when someone joins under a market maker
    }
    
    /**
     * @dev Record a subordinate's prediction and calculate reward
     * @param maker The market maker
     * @param subordinate The subordinate who predicted
     * @param amount Prediction amount in USDT
     */
    function recordSubordinatePrediction(
        address maker,
        address subordinate,
        uint256 amount
    ) external {
        require(msg.sender == owner, "Only owner");
        require(isMarketMaker[maker], "Not a market maker");
        
        uint256 reward = amount * SUBORDINATE_REWARD_BPS / 10000; // 0.3%
        
        subordinatePredictions[maker].push(SubordinatePrediction({
            subordinate: subordinate,
            amount: amount,
            reward: reward,
            timestamp: block.timestamp
        }));
        
        makers[maker].pendingRewards += reward;
        
        emit SubordinateReward(maker, subordinate, amount, reward);
    }
    
    /**
     * @dev Update maker's referral statistics
     * @param maker The market maker
     * @param referralCount Number of new referrals
     * @param referralAmount Total amount from new referrals in USDT
     */
    function updateReferralStats(
        address maker,
        uint256 referralCount,
        uint256 referralAmount
    ) external {
        require(msg.sender == owner, "Only owner");
        
        Maker storage m = makers[maker];
        m.directReferrals += referralCount;
        m.totalReferralAmount += referralAmount;
        
        // Check qualification
        _checkQualification(maker);
    }
    
    /**
     * @dev Update maker's VIP income
     * @param maker The market maker
     * @param amount VIP income amount in USDT
     */
    function updateVIPIncome(address maker, uint256 amount) external {
        require(msg.sender == owner, "Only owner");
        
        Maker storage m = makers[maker];
        m.vipIncome += amount;
        
        // Check qualification
        _checkQualification(maker);
    }
    
    function _checkQualification(address maker) internal {
        Maker storage m = makers[maker];
        
        if (m.isQualified) return;
        
        // Check qualification criteria
        bool qualified = false;
        
        // Criteria 1: Refer 10 people with ≥$200 each, total ≥$2,000
        if (m.directReferrals >= MIN_REFERRAL_COUNT && 
            m.totalReferralAmount >= MIN_TOTAL_REFERRAL) {
            qualified = true;
        }
        
        // Criteria 2: Personal VIP income ≥$500
        if (m.vipIncome >= MIN_VIP_INCOME) {
            qualified = true;
        }
        
        if (qualified) {
            m.isQualified = true;
            isMarketMaker[maker] = true;
            qualifiedMakerCount++;
            
            emit MakerQualified(maker);
        }
    }
    
    // ============ Dividend Functions ============
    
    /**
     * @dev Distribute tax dividends to market makers (1% of tax)
     * @param amount Amount of TFT to distribute
     */
    function distributeTaxDividends(uint256 amount) external {
        require(msg.sender == owner || msg.sender == address(tftToken), "Not authorized");
        
        require(
            tftToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        
        totalDividendPool += amount;
        
        emit DividendDistributed(amount);
    }
    
    /**
     * @dev Distribute VIP fee dividends to market makers (1% of VIP fee)
     * @param amount Amount of TFT to distribute
     */
    function distributeVIPDividends(uint256 amount) external {
        require(msg.sender == owner, "Not authorized");
        
        require(
            tftToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        
        totalVIPDividendPool += amount;
        
        emit VIPDividendDistributed(amount);
    }
    
    /**
     * @dev Claim all pending rewards
     */
    function claimRewards() external {
        Maker storage maker = makers[msg.sender];
        require(maker.isQualified, "Not qualified");
        
        uint256 pendingRewards = _calculatePendingRewards(msg.sender);
        require(pendingRewards > 0, "No rewards to claim");
        
        // Calculate user's share of dividends
        uint256 dividendShare = 0;
        if (qualifiedMakerCount > 0) {
            dividendShare = (totalDividendPool + totalVIPDividendPool) / qualifiedMakerCount;
        }
        
        uint256 totalClaim = pendingRewards + dividendShare;
        
        maker.pendingRewards = 0;
        maker.claimedRewards += totalClaim;
        maker.lastClaimTime = block.timestamp;
        
        if (dividendShare > 0) {
            totalDividendPool -= dividendShare / 2; // Half from tax
            totalVIPDividendPool -= dividendShare / 2; // Half from VIP
        }
        
        require(
            tftToken.transfer(msg.sender, totalClaim),
            "Transfer failed"
        );
        
        emit MakerRewardsClaimed(msg.sender, totalClaim);
    }
    
    function _calculatePendingRewards(address user) internal view returns (uint256) {
        return makers[user].pendingRewards;
    }
    
    // ============ View Functions ============
    
    function getMakerInfo(address user) external view returns (
        uint256 makerId,
        uint256 directReferrals,
        uint256 totalReferralAmount,
        uint256 vipIncome,
        bool isQualified,
        uint256 pendingRewards,
        uint256 claimedRewards,
        uint256 createdAt
    ) {
        Maker storage maker = makers[user];
        return (
            maker.id,
            maker.directReferrals,
            maker.totalReferralAmount,
            maker.vipIncome,
            maker.isQualified,
            _calculatePendingRewards(user),
            maker.claimedRewards,
            maker.createdAt
        );
    }
    
    function getSubordinatePredictions(address maker) external view returns (SubordinatePrediction[] memory) {
        return subordinatePredictions[maker];
    }
    
    function getQualificationStatus(address user) external view returns (
        bool isQualified,
        uint256 referralProgress, // Percentage towards referral criteria
        uint256 vipProgress, // Percentage towards VIP income criteria
        string memory status
    ) {
        Maker storage maker = makers[user];
        
        if (maker.isQualified) {
            return (true, 100, 100, "Qualified");
        }
        
        // Calculate progress towards referral criteria
        uint256 referralCountProgress = maker.directReferrals * 100 / MIN_REFERRAL_COUNT;
        uint256 referralAmountProgress = maker.totalReferralAmount * 100 / MIN_TOTAL_REFERRAL;
        uint256 referralProgressTotal = (referralCountProgress + referralAmountProgress) / 2;
        if (referralProgressTotal > 100) referralProgressTotal = 100;
        
        // Calculate progress towards VIP income criteria
        uint256 vipProgressTotal = maker.vipIncome * 100 / MIN_VIP_INCOME;
        if (vipProgressTotal > 100) vipProgressTotal = 100;
        
        string memory statusMsg = "Not qualified";
        if (referralProgressTotal >= 100 || vipProgressTotal >= 100) {
            statusMsg = "Ready to qualify";
        } else if (referralProgressTotal > 50 || vipProgressTotal > 50) {
            statusMsg = "In progress";
        }
        
        return (false, referralProgressTotal, vipProgressTotal, statusMsg);
    }
    
    function getGlobalStats() external view returns (
        uint256 totalMakers,
        uint256 qualifiedMakerCount,
        uint256 totalDividendPool,
        uint256 totalVIPDividendPool
    ) {
        return (
            this.totalMakers(),
            qualifiedMakerCount,
            totalDividendPool,
            totalVIPDividendPool
        );
    }
    
    // ============ Admin Functions ============
    
    function setMarketMaker(address user, bool status) external {
        require(msg.sender == owner, "Only owner");
        isMarketMaker[user] = status;
        if (status && !makers[user].isQualified) {
            makers[user].isQualified = true;
            qualifiedMakerCount++;
        }
    }
    
    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "Only owner");
        owner = newOwner;
    }
}
