// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Reinvestment
 * @dev VIP Reinvestment Mechanism
 * 
 * Rules:
 * - When cumulative level rewards reach 200 USDT
 * - 100 USDT must be reinvested as VIP (same distribution as activation fee)
 * - Remaining 100 USDT can be freely used
 * - 48-hour deadline to complete reinvestment
 * - If not completed, all promotional benefits are paused
 */

interface IBEP20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract Reinvestment {
    // Reinvestment status
    enum ReinvestStatus { PENDING, COMPLETED, EXPIRED, PAUSED }
    
    // Reinvestment record
    struct ReinvestmentRecord {
        uint256 id;
        address user;
        uint256 cumulativeLevelRewards; // Total level rewards accumulated
        uint256 reinvestAmount; // Amount to reinvest (100 USDT)
        uint256 triggerTime; // When reinvestment was triggered
        uint256 deadline; // 48 hours from trigger
        ReinvestStatus status;
        bool notified; // Whether user has been notified
    }
    
    // Constants
    uint256 public constant REINVEST_THRESHOLD = 200 * 10**6; // 200 USDT (6 decimals)
    uint256 public constant REINVEST_AMOUNT = 100 * 10**6; // 100 USDT
    uint256 public constant REINVEST_DEADLINE = 48 hours;
    
    // Fee distribution (same as VIP activation)
    uint256 public constant NODE_DIVIDEND_BPS = 300; // 3%
    uint256 public constant OPS_BPS = 100; // 1%
    uint256 public constant MARKET_MAKER_BPS = 100; // 1%
    uint256 public constant AUTO_BURN_BPS = 500; // 5%
    uint256 public constant LEVEL_REWARD_BPS = 2000; // 20%
    uint256 public constant DIRECT_REFERRAL_BPS = 5000; // 50%
    uint256 public constant ACTIVATOR_RETURN_BPS = 2000; // 20%
    
    // State
    uint256 public totalReinvestments;
    
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
    mapping(address => uint256) public cumulativeLevelRewards; // User's cumulative level rewards
    mapping(address => uint256) public lastReinvestId; // User's latest reinvestment record ID
    mapping(address => bool) public isPaused; // Whether user's benefits are paused
    mapping(address => uint256) public totalLevelRewardsEarned; // Total level rewards ever earned
    mapping(uint256 => ReinvestmentRecord) public reinvestments;
    mapping(address => uint256[]) public userReinvestments;
    
    // Events
    event ReinvestmentTriggered(
        uint256 indexed recordId,
        address indexed user,
        uint256 cumulativeRewards,
        uint256 deadline
    );
    event ReinvestmentCompleted(
        uint256 indexed recordId,
        address indexed user,
        uint256 amount
    );
    event ReinvestmentExpired(uint256 indexed recordId, address indexed user);
    event BenefitsPaused(address indexed user);
    event BenefitsResumed(address indexed user);
    event LevelRewardReceived(address indexed user, uint256 amount, uint256 cumulativeTotal);
    
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
    
    // ============ Core Functions ============
    
    /**
     * @dev Record level reward received and check if reinvestment is needed
     * @param user The user who received the level reward
     * @param amount The amount of level reward received
     */
    function recordLevelReward(address user, uint256 amount) external {
        require(msg.sender == owner, "Only owner");
        
        // Update cumulative totals
        cumulativeLevelRewards[user] += amount;
        totalLevelRewardsEarned[user] += amount;
        
        emit LevelRewardReceived(user, amount, cumulativeLevelRewards[user]);
        
        // Check if reinvestment threshold is reached
        _checkAndTriggerReinvestment(user);
    }
    
    /**
     * @dev Check if user needs to reinvest and trigger if necessary
     */
    function _checkAndTriggerReinvestment(address user) internal {
        // Skip if already paused or has pending reinvestment
        if (isPaused[user]) return;
        
        // Check if there's a pending reinvestment
        uint256 latestId = lastReinvestId[user];
        if (latestId > 0) {
            ReinvestmentRecord storage record = reinvestments[latestId];
            if (record.status == ReinvestStatus.PENDING) {
                return; // Already has pending reinvestment
            }
        }
        
        // Check if threshold is reached
        if (cumulativeLevelRewards[user] >= REINVEST_THRESHOLD) {
            _triggerReinvestment(user);
        }
    }
    
    /**
     * @dev Trigger reinvestment requirement
     */
    function _triggerReinvestment(address user) internal {
        uint256 recordId = totalReinvestments++;
        
        reinvestments[recordId] = ReinvestmentRecord({
            id: recordId,
            user: user,
            cumulativeLevelRewards: cumulativeLevelRewards[user],
            reinvestAmount: REINVEST_AMOUNT,
            triggerTime: block.timestamp,
            deadline: block.timestamp + REINVEST_DEADLINE,
            status: ReinvestStatus.PENDING,
            notified: false
        });
        
        lastReinvestId[user] = recordId;
        userReinvestments[user].push(recordId);
        
        emit ReinvestmentTriggered(
            recordId,
            user,
            cumulativeLevelRewards[user],
            block.timestamp + REINVEST_DEADLINE
        );
    }
    
    /**
     * @dev Execute reinvestment (called by user after approval)
     * @param referrer The user's referrer address
     */
    function executeReinvestment(address referrer) external {
        uint256 recordId = lastReinvestId[msg.sender];
        require(recordId > 0, "No pending reinvestment");
        
        ReinvestmentRecord storage record = reinvestments[recordId];
        require(record.status == ReinvestStatus.PENDING, "Not pending");
        require(block.timestamp <= record.deadline, "Deadline passed");
        
        // Transfer 100 USDT from user
        require(
            usdtToken.transferFrom(msg.sender, address(this), REINVEST_AMOUNT),
            "Transfer failed"
        );
        
        // Mark as completed
        record.status = ReinvestStatus.COMPLETED;
        
        // Reset cumulative counter (subtract reinvested amount)
        cumulativeLevelRewards[msg.sender] -= REINVEST_AMOUNT;
        
        // Distribute the reinvestment amount (same as VIP activation)
        _distributeReinvestment(msg.sender, referrer);
        
        emit ReinvestmentCompleted(recordId, msg.sender, REINVEST_AMOUNT);
    }
    
    /**
     * @dev Distribute reinvestment amount (same as VIP activation fee distribution)
     */
    function _distributeReinvestment(address user, address referrer) internal {
        uint256 amount = REINVEST_AMOUNT;
        
        // Calculate distributions
        uint256 nodeAmount = amount * NODE_DIVIDEND_BPS / 10000; // 3 USDT
        uint256 opsAmount = amount * OPS_BPS / 10000; // 1 USDT
        uint256 mmAmount = amount * MARKET_MAKER_BPS / 10000; // 1 USDT
        uint256 burnAmount = amount * AUTO_BURN_BPS / 10000; // 5 USDT
        uint256 levelRewardTotal = amount * LEVEL_REWARD_BPS / 10000; // 20 USDT
        uint256 directReward = amount * DIRECT_REFERRAL_BPS / 10000; // 50 USDT
        uint256 activatorReturn = amount * ACTIVATOR_RETURN_BPS / 10000; // 20 USDT
        
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
            usdtToken.transfer(burnAddress, burnAmount);
        }
        
        // Direct referral reward (50 USDT)
        if (referrer != address(0)) {
            usdtToken.transfer(referrer, directReward);
        }
        
        // Activator return (20 USDT)
        usdtToken.transfer(user, activatorReturn);
        
        // Level rewards (20 USDT total, 1 USDT per level up to 20 levels)
        _distributeLevelRewards(user, levelRewardTotal);
    }
    
    /**
     * @dev Distribute level rewards up the referral chain
     */
    function _distributeLevelRewards(address user, uint256 totalAmount) internal {
        // In production, this would walk up the referral chain
        // For now, we'll just send to operations if no chain is available
        if (totalAmount > 0) {
            usdtToken.transfer(operationsWallet, totalAmount);
        }
    }
    
    /**
     * @dev Check and expire overdue reinvestments
     */
    function checkExpiredReinvestments() external {
        // This would be called by a keeper or during user interactions
        // to check and expire overdue reinvestments
    }
    
    /**
     * @dev Pause user benefits if reinvestment deadline passed
     * @param user The user to check
     */
    function checkAndPauseUser(address user) external {
        uint256 recordId = lastReinvestId[user];
        if (recordId == 0) return;
        
        ReinvestmentRecord storage record = reinvestments[recordId];
        
        if (record.status == ReinvestStatus.PENDING && block.timestamp > record.deadline) {
            record.status = ReinvestStatus.EXPIRED;
            isPaused[user] = true;
            
            emit ReinvestmentExpired(recordId, user);
            emit BenefitsPaused(user);
        }
    }
    
    /**
     * @dev Resume user benefits after they complete reinvestment
     */
    function resumeBenefits() external {
        require(isPaused[msg.sender], "Not paused");
        
        uint256 recordId = lastReinvestId[msg.sender];
        ReinvestmentRecord storage record = reinvestments[recordId];
        
        require(record.status == ReinvestStatus.COMPLETED, "No completed reinvestment");
        
        isPaused[msg.sender] = false;
        
        emit BenefitsResumed(msg.sender);
    }
    
    // ============ View Functions ============
    
    /**
     * @dev Get user's reinvestment status
     */
    function getUserReinvestStatus(address user) external view returns (
        bool needsReinvestment,
        uint256 cumulativeRewards,
        uint256 reinvestAmount,
        uint256 deadline,
        uint256 timeRemaining,
        ReinvestStatus status,
        bool isBenefitsPaused
    ) {
        uint256 recordId = lastReinvestId[user];
        
        if (recordId == 0) {
            // Check if threshold would be reached
            needsReinvestment = cumulativeLevelRewards[user] >= REINVEST_THRESHOLD;
            return (
                needsReinvestment,
                cumulativeLevelRewards[user],
                0,
                0,
                0,
                ReinvestStatus.PENDING,
                isPaused[user]
            );
        }
        
        ReinvestmentRecord storage record = reinvestments[recordId];
        
        uint256 timeRem = 0;
        if (record.status == ReinvestStatus.PENDING && block.timestamp <= record.deadline) {
            timeRem = record.deadline - block.timestamp;
        }
        
        return (
            record.status == ReinvestStatus.PENDING,
            cumulativeLevelRewards[user],
            record.reinvestAmount,
            record.deadline,
            timeRem,
            record.status,
            isPaused[user]
        );
    }
    
    /**
     * @dev Get user's total level rewards earned
     */
    function getTotalLevelRewardsEarned(address user) external view returns (uint256) {
        return totalLevelRewardsEarned[user];
    }
    
    /**
     * @dev Get user's reinvestment history
     */
    function getUserReinvestments(address user) external view returns (uint256[] memory) {
        return userReinvestments[user];
    }
    
    /**
     * @dev Check if user's benefits are paused
     */
    function isUserPaused(address user) external view returns (bool) {
        return isPaused[user];
    }
    
    // ============ Admin Functions ============
    
    /**
     * @dev Mark reinvestment as notified
     */
    function markAsNotified(uint256 recordId) external {
        require(msg.sender == owner, "Only owner");
        reinvestments[recordId].notified = true;
    }
    
    /**
     * @dev Manually pause user benefits (for emergencies)
     */
    function pauseUserBenefits(address user) external {
        require(msg.sender == owner, "Only owner");
        isPaused[user] = true;
        emit BenefitsPaused(user);
    }
    
    /**
     * @dev Manually resume user benefits (for emergencies)
     */
    function resumeUserBenefits(address user) external {
        require(msg.sender == owner, "Only owner");
        isPaused[user] = false;
        emit BenefitsResumed(user);
    }
    
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
