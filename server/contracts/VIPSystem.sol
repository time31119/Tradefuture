// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VIPSystem
 * @dev VIP Membership System for TFT Token
 * 
 * Activation Fee: 100 USDT
 * 
 * Fee Distribution:
 * - 3% → Node dividends
 * - 1% → Operations
 * - 1% → Market makers
 * - 5% → Auto-burn
 * - 20% → Level rewards (见点奖励, up to 20 levels)
 * - 50% → Direct referral reward
 * - 20% → Return to activator
 * 
 * Immediate Benefits:
 * - 20 USDT equivalent TFT returned immediately
 * - 50 USDT equivalent TFT to direct referrer
 * - 1 USDT per level up to 20 levels (level rewards)
 */

interface IBEP20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract VIPSystem {
    // VIP Member struct
    struct VIPMember {
        address user;
        address referrer;
        uint256 activationTime;
        uint256 activationFee;
        bool isVIP;
        uint256 level; // Up to 20 levels
        uint256 totalEarned;
        uint256 directReferrals;
        uint256 teamSize;
    }
    
    // Constants
    uint256 public constant ACTIVATION_FEE = 100 * 10**6; // 100 USDT (6 decimals)
    uint256 public constant IMMEDIATE_RETURN = 20 * 10**6; // 20 USDT
    uint256 public constant DIRECT_REFERRAL_REWARD = 50 * 10**6; // 50 USDT
    uint256 public constant LEVEL_REWARD = 1 * 10**6; // 1 USDT per level
    uint256 public constant MAX_LEVELS = 20;
    
    // Fee distribution (in basis points, 10000 = 100%)
    uint256 public constant NODE_DIVIDEND_BPS = 300; // 3%
    uint256 public constant OPS_BPS = 100; // 1%
    uint256 public constant MARKET_MAKER_BPS = 100; // 1%
    uint256 public constant AUTO_BURN_BPS = 500; // 5%
    uint256 public constant LEVEL_REWARD_BPS = 2000; // 20%
    uint256 public constant DIRECT_REFERRAL_BPS = 5000; // 50%
    uint256 public constant ACTIVATOR_RETURN_BPS = 2000; // 20%
    
    // State
    uint256 public totalVIPMembers;
    uint256 public totalActivationFees;
    
    // Contracts
    address public owner;
    IBEP20 public usdtToken;
    IBEP20 public tftToken;
    
    // Addresses
    address public operationsWallet;
    address public nodeDividendPool;
    address public marketMakerPool;
    address public burnAddress = 0x000000000000000000000000000000000000dEaD;
    
    // Mappings
    mapping(address => VIPMember) public members;
    mapping(address => address[]) public directReferrals;
    mapping(address => uint256) public userLevel;
    
    // Events
    event VIPActivated(address indexed user, address indexed referrer, uint256 fee);
    event DirectReferralReward(address indexed referrer, uint256 amount);
    event LevelReward(address indexed user, uint256 level, uint256 amount);
    event ActivatorReturn(address indexed user, uint256 amount);
    event FeeDistributed(
        uint256 nodeAmount,
        uint256 opsAmount,
        uint256 mmAmount,
        uint256 burnAmount,
        uint256 levelAmount,
        uint256 directAmount,
        uint256 returnAmount
    );
    
    constructor(
        address _usdtToken,
        address _tftToken,
        address _operationsWallet,
        address _nodeDividendPool,
        address _marketMakerPool
    ) {
        owner = msg.sender;
        usdtToken = IBEP20(_usdtToken);
        tftToken = IBEP20(_tftToken);
        operationsWallet = _operationsWallet;
        nodeDividendPool = _nodeDividendPool;
        marketMakerPool = _marketMakerPool;
    }
    
    // ============ VIP Activation ============
    
    /**
     * @dev Activate VIP membership
     * @param referrer Address of the referrer (can be address(0) if no referrer)
     */
    function activateVIP(address referrer) external {
        require(!members[msg.sender].isVIP, "Already VIP");
        require(members[msg.sender].activationTime == 0, "Already activated");
        
        // Transfer activation fee from user
        require(
            usdtToken.transferFrom(msg.sender, address(this), ACTIVATION_FEE),
            "Transfer failed"
        );
        
        // Create VIP member
        members[msg.sender] = VIPMember({
            user: msg.sender,
            referrer: referrer,
            activationTime: block.timestamp,
            activationFee: ACTIVATION_FEE,
            isVIP: true,
            level: 1,
            totalEarned: 0,
            directReferrals: 0,
            teamSize: 0
        });
        
        totalVIPMembers++;
        totalActivationFees += ACTIVATION_FEE;
        
        // Update referrer's stats
        if (referrer != address(0)) {
            directReferrals[referrer].push(msg.sender);
            if (members[referrer].isVIP) {
                members[referrer].directReferrals++;
            }
        }
        
        // Distribute activation fee
        _distributeFee(msg.sender, referrer);
        
        emit VIPActivated(msg.sender, referrer, ACTIVATION_FEE);
    }
    
    function _distributeFee(address user, address referrer) internal {
        uint256 fee = ACTIVATION_FEE;
        
        // Calculate distributions
        uint256 nodeAmount = fee * NODE_DIVIDEND_BPS / 10000; // 3 USDT
        uint256 opsAmount = fee * OPS_BPS / 10000; // 1 USDT
        uint256 mmAmount = fee * MARKET_MAKER_BPS / 10000; // 1 USDT
        uint256 burnAmount = fee * AUTO_BURN_BPS / 10000; // 5 USDT
        uint256 levelRewardTotal = fee * LEVEL_REWARD_BPS / 10000; // 20 USDT
        uint256 directReward = fee * DIRECT_REFERRAL_BPS / 10000; // 50 USDT
        uint256 activatorReturn = fee * ACTIVATOR_RETURN_BPS / 10000; // 20 USDT
        
        // Transfer to respective destinations
        if (nodeAmount > 0) {
            usdtToken.transfer(nodeDividendPool, nodeAmount);
        }
        if (opsAmount > 0) {
            usdtToken.transfer(operationsWallet, opsAmount);
        }
        if (mmAmount > 0) {
            usdtToken.transfer(marketMakerPool, mmAmount);
        }
        if (burnAmount > 0) {
            // Buy TFT with USDT and burn
            // In production, this would swap on PancakeSwap
            usdtToken.transfer(burnAddress, burnAmount);
        }
        
        // Direct referral reward (50 USDT)
        if (referrer != address(0)) {
            usdtToken.transfer(referrer, directReward);
            members[referrer].totalEarned += directReward;
            emit DirectReferralReward(referrer, directReward);
        }
        
        // Activator return (20 USDT in TFT)
        // In production, this would buy TFT with USDT
        usdtToken.transfer(user, activatorReturn);
        emit ActivatorReturn(user, activatorReturn);
        
        // Level rewards (20 USDT total, 1 USDT per level up to 20 levels)
        _distributeLevelRewards(user, levelRewardTotal);
        
        emit FeeDistributed(
            nodeAmount,
            opsAmount,
            mmAmount,
            burnAmount,
            levelRewardTotal,
            directReward,
            activatorReturn
        );
    }
    
    function _distributeLevelRewards(address user, uint256 totalAmount) internal {
        uint256 remainingAmount = totalAmount;
        address current = user;
        uint256 level = 1;
        
        // Walk up the referral chain up to 20 levels
        while (level <= MAX_LEVELS && remainingAmount >= LEVEL_REWARD && current != address(0)) {
            address upline = members[current].referrer;
            
            if (upline != address(0) && members[upline].isVIP) {
                // Transfer 1 USDT to this level
                usdtToken.transfer(upline, LEVEL_REWARD);
                members[upline].totalEarned += LEVEL_REWARD;
                members[upline].teamSize++;
                
                emit LevelReward(upline, level, LEVEL_REWARD);
                
                remainingAmount -= LEVEL_REWARD;
            }
            
            current = upline;
            level++;
        }
        
        // If there's remaining amount (less than 20 levels), send to operations
        if (remainingAmount > 0) {
            usdtToken.transfer(operationsWallet, remainingAmount);
        }
    }
    
    // ============ View Functions ============
    
    function getMemberInfo(address user) external view returns (
        bool isVIP,
        address referrer,
        uint256 activationTime,
        uint256 activationFee,
        uint256 level,
        uint256 totalEarned,
        uint256 directReferrals,
        uint256 teamSize
    ) {
        VIPMember storage member = members[user];
        return (
            member.isVIP,
            member.referrer,
            member.activationTime,
            member.activationFee,
            member.level,
            member.totalEarned,
            member.directReferrals,
            member.teamSize
        );
    }
    
    function getDirectReferrals(address user) external view returns (address[] memory) {
        return directReferrals[user];
    }
    
    function getReferralChain(address user) external view returns (address[] memory chain, uint256 length) {
        // Calculate chain length first
        uint256 count = 0;
        address current = user;
        while (count < MAX_LEVELS && current != address(0)) {
            current = members[current].referrer;
            if (current != address(0)) count++;
        }
        
        chain = new address[](count);
        current = user;
        for (uint256 i = 0; i < count; i++) {
            current = members[current].referrer;
            chain[i] = current;
        }
        
        return (chain, count);
    }
    
    function getTeamStats(address user) external view returns (
        uint256 directCount,
        uint256 teamCount,
        uint256 totalEarned
    ) {
        VIPMember storage member = members[user];
        return (
            member.directReferrals,
            member.teamSize,
            member.totalEarned
        );
    }
    
    function getGlobalStats() external view returns (
        uint256 totalVIPMembers,
        uint256 totalActivationFees
    ) {
        return (totalVIPMembers, totalActivationFees);
    }
    
    // ============ Admin Functions ============
    
    function setOperationsWallet(address _wallet) external {
        require(msg.sender == owner, "Only owner");
        operationsWallet = _wallet;
    }
    
    function setNodeDividendPool(address _pool) external {
        require(msg.sender == owner, "Only owner");
        nodeDividendPool = _pool;
    }
    
    function setMarketMakerPool(address _pool) external {
        require(msg.sender == owner, "Only owner");
        marketMakerPool = _pool;
    }
    
    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "Only owner");
        owner = newOwner;
    }
}
