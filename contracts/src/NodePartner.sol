// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title NodePartner
 * @notice Node Partner contract for earning passive income
 * 
 * Two ways to become a Node Partner:
 * 1. Burn 100,000 TFT → Get 1 Node (permanent)
 * 2. Add 50,000 TFT + equivalent USDT as LP → Get 1 Node (LP locked 30 months, 2% unlocks per period)
 * 
 * Node Partners receive:
 * - Share of node dividend pool (3% of all TFT transactions)
 * - USDT dividends from prediction market fees
 */
contract NodePartner is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // Token addresses
    IERC20 public immutable tft;
    IERC20 public immutable usdt;
    
    // Burn address
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    
    // Node costs
    uint256 public constant BURN_COST = 100_000 * 1e18;  // 100,000 TFT
    uint256 public constant LP_COST = 50_000 * 1e18;     // 50,000 TFT
    
    // LP lockup parameters
    uint256 public constant TOTAL_PERIODS = 50;           // 50 periods
    uint256 public constant PERIOD_DURATION = 30 days;    // 30 days per period
    uint256 public constant UNLOCK_PER_PERIOD = 200;      // 2% per period (200 basis points)
    
    // Node limits
    uint256 public maxNodes = 100;
    uint256 public activeNodes;
    
    // Node structure
    struct Node {
        address owner;
        uint256 nodeType;      // 1 = Burn, 2 = LP
        uint256 createdAt;
        bool active;
    }
    
    // LP lockup structure
    struct LPLockup {
        uint256 totalLP;        // Total LP tokens locked
        uint256 unlockedLP;     // LP tokens already unlocked
        uint256 currentPeriod;  // Current unlock period
        uint256 lastUnlockTime; // Last unlock timestamp
        bool active;
    }
    
    // User data
    mapping(address => uint256) public userNodeCount;
    mapping(address => Node[]) public userNodes;
    mapping(address => LPLockup) public userLPLockup;
    
    // Dividend tracking
    uint256 public totalDividendsDistributed;
    mapping(address => uint256) public userDividends;
    mapping(address => uint256) public userClaimedDividends;
    
    // Events
    event NodeCreated(address indexed user, uint256 nodeType, uint256 timestamp);
    event LPAdded(address indexed user, uint256 tftAmount, uint256 usdtAmount);
    event LPWithdrawn(address indexed user, uint256 lpAmount, uint256 tftAmount, uint256 usdtAmount);
    event DividendDistributed(address indexed user, uint256 amount);
    event DividendClaimed(address indexed user, uint256 amount);
    event MaxNodesUpdated(uint256 newMax);
    
    constructor(address _tft, address _usdt) Ownable(msg.sender) {
        require(_tft != address(0), "Invalid TFT");
        require(_usdt != address(0), "Invalid USDT");
        
        tft = IERC20(_tft);
        usdt = IERC20(_usdt);
    }
    
    /**
     * @notice Create a node by burning TFT
     */
    function createNodeByBurn() external nonReentrant {
        require(activeNodes < maxNodes, "Max nodes reached");
        require(tft.balanceOf(msg.sender) >= BURN_COST, "Insufficient TFT");
        
        // Transfer TFT to burn address
        tft.safeTransferFrom(msg.sender, BURN_ADDRESS, BURN_COST);
        
        // Create node
        userNodes[msg.sender].push(Node({
            owner: msg.sender,
            nodeType: 1,
            createdAt: block.timestamp,
            active: true
        }));
        
        userNodeCount[msg.sender]++;
        activeNodes++;
        
        emit NodeCreated(msg.sender, 1, block.timestamp);
    }
    
    /**
     * @notice Create a node by adding LP
     * @param _tftAmount TFT amount (must be >= LP_COST)
     * @param _usdtAmount USDT amount (equivalent value)
     */
    function createNodeByLP(uint256 _tftAmount, uint256 _usdtAmount) external nonReentrant {
        require(activeNodes < maxNodes, "Max nodes reached");
        require(_tftAmount >= LP_COST, "Insufficient TFT");
        require(_usdtAmount > 0, "USDT amount must be > 0");
        
        // Transfer tokens to this contract
        tft.safeTransferFrom(msg.sender, address(this), _tftAmount);
        usdt.safeTransferFrom(msg.sender, address(this), _usdtAmount);
        
        // Create node
        userNodes[msg.sender].push(Node({
            owner: msg.sender,
            nodeType: 2,
            createdAt: block.timestamp,
            active: true
        }));
        
        // Create LP lockup
        userLPLockup[msg.sender] = LPLockup({
            totalLP: _tftAmount,
            unlockedLP: 0,
            currentPeriod: 0,
            lastUnlockTime: block.timestamp,
            active: true
        });
        
        userNodeCount[msg.sender]++;
        activeNodes++;
        
        emit NodeCreated(msg.sender, 2, block.timestamp);
        emit LPAdded(msg.sender, _tftAmount, _usdtAmount);
    }
    
    /**
     * @notice Withdraw unlocked LP
     */
    function withdrawLP() external nonReentrant {
        LPLockup storage lockup = userLPLockup[msg.sender];
        require(lockup.active, "No active lockup");
        
        // Calculate unlockable amount
        uint256 periodsElapsed = (block.timestamp - lockup.lastUnlockTime) / PERIOD_DURATION;
        if (periodsElapsed > 0) {
            uint256 newPeriod = lockup.currentPeriod + periodsElapsed;
            if (newPeriod > TOTAL_PERIODS) {
                newPeriod = TOTAL_PERIODS;
            }
            
            uint256 unlockableAmount = (lockup.totalLP * newPeriod * UNLOCK_PER_PERIOD) / 10000;
            uint256 newUnlock = unlockableAmount - lockup.unlockedLP;
            
            if (newUnlock > 0) {
                lockup.unlockedLP = unlockableAmount;
                lockup.currentPeriod = newPeriod;
                lockup.lastUnlockTime = block.timestamp;
                
                // Calculate USDT to return (proportional)
                uint256 usdtToReturn = (usdt.balanceOf(address(this)) * newUnlock) / lockup.totalLP;
                
                // Transfer tokens back
                tft.safeTransfer(msg.sender, newUnlock);
                if (usdtToReturn > 0) {
                    usdt.safeTransfer(msg.sender, usdtToReturn);
                }
                
                emit LPWithdrawn(msg.sender, newUnlock, newUnlock, usdtToReturn);
                
                // Check if fully unlocked
                if (newPeriod >= TOTAL_PERIODS) {
                    lockup.active = false;
                }
            }
        }
    }
    
    /**
     * @notice Distribute dividends to node holders
     * @dev Called by owner when dividend pool has funds
     */
    function distributeDividends() external onlyOwner nonReentrant {
        uint256 balance = usdt.balanceOf(address(this));
        require(balance > 0, "No dividends to distribute");
        
        require(activeNodes > 0, "No active nodes");
        
        // Equal distribution to all node holders
        // dividendPerNode = balance / activeNodes
        
        // This is a simplified distribution - in production,
        // you'd want to track which users have claimed
        totalDividendsDistributed += balance;
        
        emit DividendDistributed(address(0), balance);
    }
    
    /**
     * @notice Claim pending dividends
     */
    function claimDividends() external nonReentrant {
        require(userNodeCount[msg.sender] > 0, "No nodes");
        
        // Calculate pending dividends (simplified - in production, use accumulator pattern)
        uint256 pending = _calculatePendingDividends(msg.sender);
        require(pending > 0, "No pending dividends");
        
        userClaimedDividends[msg.sender] += pending;
        
        usdt.safeTransfer(msg.sender, pending);
        
        emit DividendClaimed(msg.sender, pending);
    }
    
    /**
     * @notice Calculate pending dividends for a user
     */
    function _calculatePendingDividends(address _user) internal view returns (uint256) {
        // Simplified calculation - in production, use proper accumulator
        if (activeNodes == 0) return 0;
        
        uint256 totalDividendPool = totalDividendsDistributed;
        uint256 userShare = (totalDividendPool * userNodeCount[_user]) / activeNodes;
        
        return userShare > userClaimedDividends[_user] 
            ? userShare - userClaimedDividends[_user] 
            : 0;
    }
    
    /**
     * @notice Get user's node info
     */
    function getUserNodes(address _user) external view returns (
        uint256 nodeCount,
        uint256 burnNodes,
        uint256 lpNodes,
        uint256 lockedLP,
        uint256 unlockedLP,
        uint256 currentPeriod
    ) {
        nodeCount = userNodeCount[_user];
        
        LPLockup storage lockup = userLPLockup[_user];
        lockedLP = lockup.totalLP - lockup.unlockedLP;
        unlockedLP = lockup.unlockedLP;
        currentPeriod = lockup.currentPeriod;
        
        for (uint256 i = 0; i < userNodes[_user].length; i++) {
            if (userNodes[_user][i].nodeType == 1) {
                burnNodes++;
            } else {
                lpNodes++;
            }
        }
    }
    
    /**
     * @notice Get pending dividends for a user
     */
    function getPendingDividends(address _user) external view returns (uint256) {
        return _calculatePendingDividends(_user);
    }
    
    /**
     * @notice Update max nodes
     */
    function setMaxNodes(uint256 _max) external onlyOwner {
        maxNodes = _max;
        emit MaxNodesUpdated(_max);
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
