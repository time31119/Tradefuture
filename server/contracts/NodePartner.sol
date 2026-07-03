// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title NodePartner
 * @dev Node Partner System for TFT Token
 * 
 * Node Acquisition Methods:
 * 1. Burn TFT: 100,000 TFT = 1 node, 200,000 TFT = 2 nodes
 * 2. Add LP: 50,000 TFT + equivalent USDT = 1 node, 100,000 TFT + equivalent USDT = 2 nodes
 * 3. Gift Node: Referral rewards reach 30,000 USD = 1 node
 * 
 * Node Benefits:
 * - 3% of transaction tax dividends (distributed by node weight)
 * - 3% of VIP activation fee dividends
 */

interface IBEP20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

interface IPancakeRouter {
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external returns (uint amountA, uint amountB, uint liquidity);
    
    function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts);
    function WETH() external pure returns (address);
}

contract NodePartner {
    // Node struct
    struct Node {
        uint256 id;
        address owner;
        uint256 nodeCount;
        uint256 burnAmount; // TFT burned to acquire
        uint256 lpAmount; // LP tokens added
        uint256 giftCount; // Nodes from referral rewards
        uint256 totalNodes; // Total nodes (burn + lp + gift)
        uint256 pendingRewards; // Unclaimed rewards
        uint256 claimedRewards; // Total claimed rewards
        uint256 lastClaimTime;
        uint256 createdAt;
    }
    
    // LP Lock-up struct
    struct LPLock {
        uint256 totalLP; // Total LP tokens locked
        uint256 unlockedLP; // LP tokens unlocked
        uint256 lastUnlockTime;
        uint256 lockPeriods; // Total lock periods (50)
        uint256 unlockPerPeriodBPS; // 2% per period
    }
    
    // Constants
    uint256 public constant BURN_PER_NODE = 100_000 * 10**18; // 100,000 TFT
    uint256 public constant LP_TFT_PER_NODE = 50_000 * 10**18; // 50,000 TFT
    uint256 public constant GIFT_REWARD_THRESHOLD = 30_000 * 10**6; // 30,000 USDT
    uint256 public constant LOCK_PERIODS = 50;
    uint256 public constant UNLOCK_PER_PERIOD_BPS = 200; // 2%
    uint256 public constant UNLOCK_INTERVAL = 30 days;
    
    // Dividend shares
    uint256 public constant NODE_DIVIDEND_BPS = 300; // 3% of tax
    uint256 public constant NODE_VIP_DIVIDEND_BPS = 300; // 3% of VIP fee
    
    // State
    uint256 public totalNodes;
    uint256 public totalWeight; // Total node weight for dividend distribution
    uint256 public totalDividendPool; // Pending dividends
    uint256 public totalLP; // Total LP locked
    uint256 public nextUnlockTime;
    uint256 public nextUnlockAmount; // 1,000 LP
    
    // Contracts
    address public owner;
    IBEP20 public tftToken;
    IBEP20 public usdtToken;
    IPancakeRouter public router;
    address public lpPair; // TFT-USDT LP pair
    
    // Mappings
    mapping(address => Node) public nodes;
    mapping(address => LPLock) public lpLocks;
    mapping(address => uint256) public referralRewards; // Track USD value of referral rewards
    mapping(address => bool) public hasClaimedGiftNode;
    
    // Events
    event NodeAcquired(address indexed user, uint256 nodeCount, string method, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 amount);
    event LPAdded(address indexed user, uint256 lpAmount, uint256 tftAmount);
    event LPWithdrawn(address indexed user, uint256 lpAmount);
    event DividendDistributed(uint256 totalAmount);
    event GiftNodeGranted(address indexed user, uint256 referralRewards);
    
    constructor(
        address _tftToken,
        address _usdtToken,
        address _router,
        address _lpPair
    ) {
        owner = msg.sender;
        tftToken = IBEP20(_tftToken);
        usdtToken = IBEP20(_usdtToken);
        router = IPancakeRouter(_router);
        lpPair = _lpPair;
        
        nextUnlockTime = block.timestamp + UNLOCK_INTERVAL;
        nextUnlockAmount = 1_000 * 10**18; // 1,000 LP
    }
    
    // ============ Node Acquisition ============
    
    /**
     * @dev Acquire nodes by burning TFT
     * @param nodeCount Number of nodes to acquire (1 or 2)
     */
    function acquireByBurn(uint256 nodeCount) external {
        require(nodeCount == 1 || nodeCount == 2, "Invalid node count");
        
        uint256 burnAmount = BURN_PER_NODE * nodeCount;
        
        // Transfer TFT from user
        require(
            tftToken.transferFrom(msg.sender, address(this), burnAmount),
            "Transfer failed"
        );
        
        // Burn the tokens (send to dead address)
        require(
            tftToken.transfer(0x000000000000000000000000000000000000dEaD, burnAmount),
            "Burn failed"
        );
        
        // Update node
        _addNode(msg.sender, nodeCount, burnAmount, 0, "burn");
    }
    
    /**
     * @dev Acquire nodes by adding liquidity
     * @param nodeCount Number of nodes to acquire (1 or 2)
     * @param maxTFTAmount Maximum TFT amount to use
     * @param maxUSDTAmount Maximum USDT amount to use
     */
    function acquireByLP(
        uint256 nodeCount,
        uint256 maxTFTAmount,
        uint256 maxUSDTAmount
    ) external {
        require(nodeCount == 1 || nodeCount == 2, "Invalid node count");
        
        uint256 tftAmount = LP_TFT_PER_NODE * nodeCount;
        
        // Calculate equivalent USDT amount
        address[] memory path = new address[](2);
        path[0] = address(tftToken);
        path[1] = address(usdtToken);
        uint256[] memory amounts = router.getAmountsOut(tftAmount, path);
        uint256 usdtAmount = amounts[1];
        
        require(usdtAmount <= maxUSDTAmount, "USDT amount exceeds max");
        
        // Transfer tokens from user
        require(
            tftToken.transferFrom(msg.sender, address(this), tftAmount),
            "TFT transfer failed"
        );
        require(
            usdtToken.transferFrom(msg.sender, address(this), usdtAmount),
            "USDT transfer failed"
        );
        
        // Approve router
        tftToken.approve(address(router), tftAmount);
        usdtToken.approve(address(router), usdtAmount);
        
        // Add liquidity
        (,, uint256 liquidity) = router.addLiquidity(
            address(tftToken),
            address(usdtToken),
            tftAmount,
            usdtAmount,
            0,
            0,
            address(this),
            block.timestamp
        );
        
        // Update LP lock
        _addLPLock(msg.sender, liquidity);
        
        // Update node
        _addNode(msg.sender, nodeCount, 0, liquidity, "lp");
    }
    
    /**
     * @dev Check and grant gift node based on referral rewards
     */
    function checkAndGrantGiftNode(address user) external {
        require(referralRewards[user] >= GIFT_REWARD_THRESHOLD, "Insufficient referral rewards");
        require(!hasClaimedGiftNode[user], "Already claimed gift node");
        
        hasClaimedGiftNode[user] = true;
        
        _addNode(user, 1, 0, 0, "gift");
        
        emit GiftNodeGranted(user, referralRewards[user]);
    }
    
    function _addNode(
        address user,
        uint256 nodeCount,
        uint256 burnAmount,
        uint256 lpAmount,
        string memory method
    ) internal {
        Node storage node = nodes[user];
        
        if (node.createdAt == 0) {
            node.id = totalNodes++;
            node.owner = user;
            node.createdAt = block.timestamp;
            node.lastClaimTime = block.timestamp;
        }
        
        if (keccak256(bytes(method)) == keccak256(bytes("burn"))) {
            node.burnAmount += burnAmount;
        } else if (keccak256(bytes(method)) == keccak256(bytes("lp"))) {
            node.lpAmount += lpAmount;
        } else if (keccak256(bytes(method)) == keccak256(bytes("gift"))) {
            node.giftCount += nodeCount;
        }
        
        node.nodeCount += nodeCount;
        node.totalNodes = node.burnAmount / BURN_PER_NODE + 
                          node.lpAmount / (LP_TFT_PER_NODE * 2 / 100) + // Approximate LP weight
                          node.giftCount;
        
        totalNodes += nodeCount;
        totalWeight += nodeCount;
        
        emit NodeAcquired(user, nodeCount, method, burnAmount > 0 ? burnAmount : lpAmount);
    }
    
    function _addLPLock(address user, uint256 lpAmount) internal {
        LPLock storage lock = lpLocks[user];
        
        lock.totalLP += lpAmount;
        lock.lockPeriods = LOCK_PERIODS;
        lock.unlockPerPeriodBPS = UNLOCK_PER_PERIOD_BPS;
        
        if (lock.lastUnlockTime == 0) {
            lock.lastUnlockTime = block.timestamp;
        }
        
        totalLP += lpAmount;
        
        emit LPAdded(user, lpAmount, 0);
    }
    
    // ============ LP Management ============
    
    /**
     * @dev Process periodic LP unlock
     */
    function processUnlock() external {
        require(block.timestamp >= nextUnlockTime, "Not time for unlock");
        
        uint256 unlockAmount = totalLP * UNLOCK_PER_PERIOD_BPS / 10000; // 2% of total LP
        
        // Update all LP locks
        // In production, this would be done off-chain or with a more efficient mechanism
        
        nextUnlockTime = block.timestamp + UNLOCK_INTERVAL;
        nextUnlockAmount = (totalLP - unlockAmount) * UNLOCK_PER_PERIOD_BPS / 10000;
    }
    
    /**
     * @dev Withdraw unlocked LP
     * @param amount Amount of LP to withdraw
     */
    function withdrawLP(uint256 amount) external {
        LPLock storage lock = lpLocks[msg.sender];
        
        // Calculate unlocked amount
        uint256 periodsPassed = (block.timestamp - lock.lastUnlockTime) / UNLOCK_INTERVAL;
        uint256 unlockedPercent = periodsPassed * lock.unlockPerPeriodBPS;
        if (unlockedPercent > 10000) unlockedPercent = 10000;
        
        uint256 unlockedAmount = lock.totalLP * unlockedPercent / 10000;
        uint256 withdrawable = unlockedAmount - lock.unlockedLP;
        
        require(amount <= withdrawable, "Exceeds withdrawable amount");
        
        lock.unlockedLP += amount;
        totalLP -= amount;
        
        // Transfer LP tokens to user
        require(
            IBEP20(lpPair).transfer(msg.sender, amount),
            "Transfer failed"
        );
        
        emit LPWithdrawn(msg.sender, amount);
    }
    
    /**
     * @dev Get user's withdrawable LP amount
     */
    function getWithdrawableLP(address user) external view returns (uint256) {
        LPLock storage lock = lpLocks[user];
        
        uint256 periodsPassed = (block.timestamp - lock.lastUnlockTime) / UNLOCK_INTERVAL;
        uint256 unlockedPercent = periodsPassed * lock.unlockPerPeriodBPS;
        if (unlockedPercent > 10000) unlockedPercent = 10000;
        
        uint256 unlockedAmount = lock.totalLP * unlockedPercent / 10000;
        return unlockedAmount - lock.unlockedLP;
    }
    
    // ============ Dividend Functions ============
    
    /**
     * @dev Distribute dividends to node holders
     * @param amount Amount of tokens to distribute
     */
    function distributeDividends(uint256 amount) external {
        require(msg.sender == owner || msg.sender == address(tftToken), "Not authorized");
        
        require(
            tftToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        
        totalDividendPool += amount;
        
        emit DividendDistributed(amount);
    }
    
    /**
     * @dev Claim pending dividends
     */
    function claimRewards() external {
        Node storage node = nodes[msg.sender];
        require(node.totalNodes > 0, "No nodes");
        
        // Calculate pending rewards
        uint256 pendingRewards = _calculatePendingRewards(msg.sender);
        require(pendingRewards > 0, "No rewards to claim");
        
        node.pendingRewards = 0;
        node.claimedRewards += pendingRewards;
        node.lastClaimTime = block.timestamp;
        totalDividendPool -= pendingRewards;
        
        require(
            tftToken.transfer(msg.sender, pendingRewards),
            "Transfer failed"
        );
        
        emit RewardsClaimed(msg.sender, pendingRewards);
    }
    
    function _calculatePendingRewards(address user) internal view returns (uint256) {
        Node storage node = nodes[user];
        if (node.totalNodes == 0 || totalWeight == 0) return 0;
        
        // User's share of dividends
        uint256 userShare = totalDividendPool * node.totalNodes / totalWeight;
        return userShare + node.pendingRewards;
    }
    
    /**
     * @dev Get pending rewards for a user
     */
    function getPendingRewards(address user) external view returns (uint256) {
        return _calculatePendingRewards(user);
    }
    
    // ============ View Functions ============
    
    function getNodeInfo(address user) external view returns (
        uint256 nodeCount,
        uint256 burnAmount,
        uint256 lpAmount,
        uint256 giftCount,
        uint256 totalNodes,
        uint256 pendingRewards,
        uint256 claimedRewards,
        uint256 createdAt
    ) {
        Node storage node = nodes[user];
        return (
            node.nodeCount,
            node.burnAmount,
            node.lpAmount,
            node.giftCount,
            node.totalNodes,
            _calculatePendingRewards(user),
            node.claimedRewards,
            node.createdAt
        );
    }
    
    function getLPLockInfo(address user) external view returns (
        uint256 totalLP,
        uint256 unlockedLP,
        uint256 lockedLP,
        uint256 nextUnlockTime,
        uint256 nextUnlockAmount,
        uint256 withdrawableLP
    ) {
        LPLock storage lock = lpLocks[user];
        
        uint256 periodsPassed = (block.timestamp - lock.lastUnlockTime) / UNLOCK_INTERVAL;
        uint256 unlockedPercent = periodsPassed * lock.unlockPerPeriodBPS;
        if (unlockedPercent > 10000) unlockedPercent = 10000;
        
        uint256 unlockedAmount = lock.totalLP * unlockedPercent / 10000;
        
        return (
            lock.totalLP,
            lock.unlockedLP,
            lock.totalLP - lock.unlockedLP,
            this.nextUnlockTime(),
            this.nextUnlockAmount(),
            unlockedAmount - lock.unlockedLP
        );
    }
    
    function getGlobalInfo() external view returns (
        uint256 totalNodes,
        uint256 totalWeight,
        uint256 totalLP,
        uint256 totalDividendPool,
        uint256 nextUnlockTime,
        uint256 nextUnlockAmount
    ) {
        return (
            this.totalNodes(),
            totalWeight,
            totalLP,
            totalDividendPool,
            this.nextUnlockTime(),
            nextUnlockAmount
        );
    }
    
    // ============ Admin Functions ============
    
    function updateReferralRewards(address user, uint256 amount) external {
        require(msg.sender == owner, "Only owner");
        referralRewards[user] += amount;
    }
    
    function setNextUnlock(uint256 _nextUnlockTime, uint256 _nextUnlockAmount) external {
        require(msg.sender == owner, "Only owner");
        nextUnlockTime = _nextUnlockTime;
        nextUnlockAmount = _nextUnlockAmount;
    }
    
    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "Only owner");
        owner = newOwner;
    }
}
