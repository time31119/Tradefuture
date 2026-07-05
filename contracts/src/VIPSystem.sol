// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title VIPSystem
 * @notice VIP会员系统 - 激活费分配、推荐奖励、复投机制
 * 
 * VIP激活费 100 USDT 分配：
 * - 3% (3U) → 节点分红池
 * - 1% (1U) → 运营钱包
 * - 1% (1U) → 做市商池
 * - 5% (5U) → 自动销毁
 * - 20% (20U) → 见点奖励（20级各1U）
 * - 50% (50U) → 直推奖励（直接上级独享）
 * - 20% (20U) → 返还用户（等值TFT即时到账）
 * 
 * 复投机制：
 * - 见点奖励累计达 200 USDT 触发
 * - 其中 100 USDT 复投VIP
 * - 剩余 100 USDT 可自由支配
 */
contract VIPSystem is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ 状态变量 ============
    
    IERC20 public usdt;
    IERC20 public tft;
    
    // 地址分配
    address public nodePool;        // 节点分红池
    address public operationsWallet; // 运营钱包
    address public marketMakerPool;  // 做市商池
    address public burnAddress;      // 销毁地址
    
    // 价格预言机（用于USDT→TFT转换）
    address public priceOracle;
    
    // VIP配置
    uint256 public constant VIP_ACTIVATION_FEE = 100e6; // 100 USDT (6 decimals)
    uint256 public constant DIRECT_REFERRAL_REWARD = 50e6; // 50 USDT
    uint256 public constant SEE_POINT_REWARD = 1e6; // 1 USDT per level
    uint256 public constant MAX_REFERRAL_LEVELS = 20;
    uint256 public constant REINVEST_THRESHOLD = 200e6; // 200 USDT
    uint256 public constant REINVEST_AMOUNT = 100e6; // 100 USDT
    
    // TFT返还比例 (20% of 100 USDT = 20 USDT worth of TFT)
    uint256 public constant RETURN_RATIO = 2000; // 20% (basis points)
    
    // 用户VIP信息
    struct VIPInfo {
        bool isVIP;
        uint256 activatedAt;
        address referrer; // 直接推荐人
        uint256 totalDirectReferrals; // 直推人数
        uint256 totalSeePointEarned; // 累计见点奖励
        uint256 pendingSeePoint; // 待领取见点奖励
        bool reinvestTriggered; // 是否已触发复投
        uint256 lastReinvestTime; // 上次复投时间
    }
    
    mapping(address => VIPInfo) public vipUsers;
    mapping(address => address[]) public referrals; // 用户推荐的下级列表
    
    // 待领取的直推奖励
    mapping(address => uint256) public pendingDirectRewards;
    
    // 统计
    uint256 public totalVIPs;
    uint256 public totalDirectRewardsDistributed;
    uint256 public totalSeePointRewardsDistributed;
    uint256 public totalReinvestments;
    
    // TFT价格（USDT per TFT, 6 decimals to match USDT）
    // 例如: 0.01 USDT = 10000 (1e4)
    uint256 public tftPriceInUSDT = 1e4; // 默认 0.01 USDT (in 6 decimals)
    
    // ============ 事件 ============
    
    event VIPActivated(address indexed user, address indexed referrer, uint256 tftReturned);
    event DirectRewardClaimed(address indexed user, uint256 amount);
    event SeePointRewardDistributed(address indexed user, uint256 level, uint256 amount);
    event SeePointRewardClaimed(address indexed user, uint256 amount);
    event ReinvestmentTriggered(address indexed user, uint256 reinvestAmount, uint256 withdrawableAmount);
    event ReferralRegistered(address indexed user, address indexed referrer, uint256 level);
    event TFTPriceUpdated(uint256 newPrice);
    
    // ============ 构造函数 ============
    
    constructor(
        address _usdt,
        address _tft,
        address _nodePool,
        address _operationsWallet,
        address _marketMakerPool,
        address _priceOracle
    ) Ownable(msg.sender) {
        usdt = IERC20(_usdt);
        tft = IERC20(_tft);
        nodePool = _nodePool;
        operationsWallet = _operationsWallet;
        marketMakerPool = _marketMakerPool;
        burnAddress = address(0x000000000000000000000000000000000000dEaD);
        priceOracle = _priceOracle;
    }
    
    // ============ 外部函数 ============
    
    /**
     * @notice 激活VIP
     * @param referrer 推荐人地址
     */
    function activateVIP(address referrer) external nonReentrant {
        require(!vipUsers[msg.sender].isVIP, "Already VIP");
        require(referrer != msg.sender, "Cannot refer self");
        require(referrer == address(0) || vipUsers[referrer].isVIP, "Referrer must be VIP");
        
        // 转入激活费
        usdt.safeTransferFrom(msg.sender, address(this), VIP_ACTIVATION_FEE);
        
        // 记录VIP信息（先创建，以便见点奖励分配时能访问referrer）
        vipUsers[msg.sender] = VIPInfo({
            isVIP: true,
            activatedAt: block.timestamp,
            referrer: referrer,
            totalDirectReferrals: 0,
            totalSeePointEarned: 0,
            pendingSeePoint: 0,
            reinvestTriggered: false,
            lastReinvestTime: 0
        });
        
        // 分配激活费（现在可以访问vipUsers[msg.sender].referrer）
        _distributeActivationFee(msg.sender, referrer);
        
        // 更新推荐人信息
        if (referrer != address(0)) {
            vipUsers[referrer].totalDirectReferrals++;
            referrals[referrer].push(msg.sender);
            
            // 记录推荐关系
            emit ReferralRegistered(msg.sender, referrer, 1);
        }
        
        totalVIPs++;
        
        emit VIPActivated(msg.sender, referrer, _calculateTFTReturn(VIP_ACTIVATION_FEE));
    }
    
    /**
     * @notice 领取直推奖励
     */
    function claimDirectReward() external nonReentrant {
        uint256 amount = pendingDirectRewards[msg.sender];
        require(amount > 0, "No rewards");
        
        pendingDirectRewards[msg.sender] = 0;
        usdt.safeTransfer(msg.sender, amount);
        
        totalDirectRewardsDistributed += amount;
        emit DirectRewardClaimed(msg.sender, amount);
    }
    
    /**
     * @notice 领取见点奖励
     */
    function claimSeePointReward() external nonReentrant {
        VIPInfo storage info = vipUsers[msg.sender];
        require(info.isVIP, "Not VIP");
        
        uint256 amount = info.pendingSeePoint;
        require(amount > 0, "No rewards");
        
        info.pendingSeePoint = 0;
        usdt.safeTransfer(msg.sender, amount);
        
        totalSeePointRewardsDistributed += amount;
        emit SeePointRewardClaimed(msg.sender, amount);
        
        // 检查是否触发复投
        _checkReinvestment(msg.sender);
    }
    
    /**
     * @notice 手动执行复投
     */
    function reinvest() external nonReentrant {
        VIPInfo storage info = vipUsers[msg.sender];
        require(info.isVIP, "Not VIP");
        require(info.totalSeePointEarned >= REINVEST_THRESHOLD, "Threshold not reached");
        require(!info.reinvestTriggered || block.timestamp >= info.lastReinvestTime + 48 hours, "Cooldown");
        
        _executeReinvestment(msg.sender);
    }
    
    // ============ 管理函数 ============
    
    /**
     * @notice 更新TFT价格
     */
    function setTFTPrice(uint256 _price) external onlyOwner {
        require(_price > 0, "Invalid price");
        tftPriceInUSDT = _price;
        emit TFTPriceUpdated(_price);
    }
    
    /**
     * @notice 更新地址配置
     */
    function updateAddresses(
        address _nodePool,
        address _operationsWallet,
        address _marketMakerPool
    ) external onlyOwner {
        nodePool = _nodePool;
        operationsWallet = _operationsWallet;
        marketMakerPool = _marketMakerPool;
    }
    
    /**
     * @notice 更新价格预言机
     */
    function setPriceOracle(address _oracle) external onlyOwner {
        priceOracle = _oracle;
    }
    
    // ============ 内部函数 ============
    
    /**
     * @notice 分配激活费
     */
    function _distributeActivationFee(address user, address referrer) internal {
        uint256 fee = VIP_ACTIVATION_FEE;
        
        // 3% → 节点分红池 (3 USDT)
        uint256 nodeShare = fee * 300 / 10000;
        if (nodeShare > 0 && nodePool != address(0)) {
            usdt.safeTransfer(nodePool, nodeShare);
        }
        
        // 1% → 运营钱包 (1 USDT)
        uint256 opsShare = fee * 100 / 10000;
        if (opsShare > 0 && operationsWallet != address(0)) {
            usdt.safeTransfer(operationsWallet, opsShare);
        }
        
        // 1% → 做市商池 (1 USDT)
        uint256 mmShare = fee * 100 / 10000;
        if (mmShare > 0 && marketMakerPool != address(0)) {
            usdt.safeTransfer(marketMakerPool, mmShare);
        }
        
        // 5% → 自动销毁 (5 USDT)
        uint256 burnShare = fee * 500 / 10000;
        if (burnShare > 0) {
            usdt.safeTransfer(burnAddress, burnShare);
        }
        
        // 50% → 直推奖励 (50 USDT)
        uint256 directReward = fee * 5000 / 10000;
        if (directReward > 0 && referrer != address(0)) {
            pendingDirectRewards[referrer] += directReward;
        }
        
        // 20% → 见点奖励 (20 USDT, 20级各1U)
        uint256 seePointTotal = fee * 2000 / 10000;
        _distributeSeePointRewards(user, seePointTotal);
        
        // 20% → 返还用户TFT (20 USDT worth)
        uint256 returnAmount = fee * RETURN_RATIO / 10000;
        uint256 tftAmount = _calculateTFTReturn(returnAmount);
        if (tftAmount > 0) {
            tft.safeTransfer(user, tftAmount);
        }
    }
    
    /**
     * @notice 分配见点奖励（20级）
     */
    function _distributeSeePointRewards(address user, uint256 totalAmount) internal {
        address current = vipUsers[user].referrer;
        uint256 level = 1;
        uint256 distributed = 0;
        
        while (current != address(0) && level <= MAX_REFERRAL_LEVELS && distributed < totalAmount) {
            uint256 reward = SEE_POINT_REWARD; // 1 USDT per level
            
            if (distributed + reward > totalAmount) {
                reward = totalAmount - distributed;
            }
            
            vipUsers[current].pendingSeePoint += reward;
            vipUsers[current].totalSeePointEarned += reward;
            
            emit SeePointRewardDistributed(current, level, reward);
            
            // 移动到上一级
            current = vipUsers[current].referrer;
            level++;
            distributed += reward;
        }
    }
    
    /**
     * @notice 检查复投条件
     */
    function _checkReinvestment(address user) internal {
        VIPInfo storage info = vipUsers[user];
        
        if (info.totalSeePointEarned >= REINVEST_THRESHOLD && !info.reinvestTriggered) {
            _executeReinvestment(user);
        }
    }
    
    /**
     * @notice 执行复投
     */
    function _executeReinvestment(address user) internal {
        VIPInfo storage info = vipUsers[user];
        
        uint256 reinvestAmount = REINVEST_AMOUNT; // 100 USDT
        uint256 withdrawableAmount = info.totalSeePointEarned - REINVEST_AMOUNT;
        
        // 重置状态
        info.reinvestTriggered = true;
        info.lastReinvestTime = block.timestamp;
        info.totalSeePointEarned = withdrawableAmount; // 剩余可领取
        
        // 复投部分按激活费规则分配
        // 注意：复投不产生新的推荐奖励，只产生分红
        uint256 nodeShare = reinvestAmount * 300 / 10000;
        if (nodeShare > 0 && nodePool != address(0)) {
            usdt.safeTransfer(nodePool, nodeShare);
        }
        
        uint256 opsShare = reinvestAmount * 100 / 10000;
        if (opsShare > 0 && operationsWallet != address(0)) {
            usdt.safeTransfer(operationsWallet, opsShare);
        }
        
        uint256 mmShare = reinvestAmount * 100 / 10000;
        if (mmShare > 0 && marketMakerPool != address(0)) {
            usdt.safeTransfer(marketMakerPool, mmShare);
        }
        
        uint256 burnShare = reinvestAmount * 500 / 10000;
        if (burnShare > 0) {
            usdt.safeTransfer(burnAddress, burnShare);
        }
        
        // 复投部分不产生推荐奖励和TFT返还
        
        totalReinvestments++;
        
        emit ReinvestmentTriggered(user, reinvestAmount, withdrawableAmount);
    }
    
    /**
     * @notice 计算USDT对应的TFT数量
     */
    function _calculateTFTReturn(uint256 usdtAmount) internal view returns (uint256) {
        // usdtAmount is in 6 decimals (e.g., 20 USDT = 20e6 = 20,000,000)
        // tftPriceInUSDT is price of 1 TFT in USDT, in 6 decimals (e.g., 0.01 USDT = 1e4 = 10,000)
        // Result should be in 18 decimals (TFT)
        // Formula: tftAmount = (usdtAmount / tftPriceInUSDT) * 1e18
        return (usdtAmount * 1e18) / tftPriceInUSDT;
    }
    
    // ============ 查询函数 ============
    
    /**
     * @notice 获取用户VIP基本信息
     */
    function getVIPInfo(address user) external view returns (
        bool isVIP,
        uint256 activatedAt,
        address referrer,
        uint256 totalDirectReferrals,
        uint256 totalSeePointEarned,
        uint256 pendingSeePoint
    ) {
        VIPInfo storage info = vipUsers[user];
        return (
            info.isVIP,
            info.activatedAt,
            info.referrer,
            info.totalDirectReferrals,
            info.totalSeePointEarned,
            info.pendingSeePoint
        );
    }
    
    /**
     * @notice 获取用户VIP奖励信息
     */
    function getVIPRewards(address user) external view returns (
        uint256 pendingDirectReward,
        bool reinvestTriggered,
        uint256 lastReinvestTime,
        bool reinvestAvailable
    ) {
        VIPInfo storage info = vipUsers[user];
        reinvestAvailable = info.isVIP && 
            info.totalSeePointEarned >= REINVEST_THRESHOLD && 
            (!info.reinvestTriggered || block.timestamp >= info.lastReinvestTime + 48 hours);
        return (
            pendingDirectRewards[user],
            info.reinvestTriggered,
            info.lastReinvestTime,
            reinvestAvailable
        );
    }
    
    /**
     * @notice 获取用户推荐链
     */
    function getReferralChain(address user) external view returns (address[] memory chain) {
        uint256 count = 0;
        address current = vipUsers[user].referrer;
        
        // 计算链长度
        while (current != address(0) && count < MAX_REFERRAL_LEVELS) {
            count++;
            current = vipUsers[current].referrer;
        }
        
        chain = new address[](count);
        current = vipUsers[user].referrer;
        
        for (uint256 i = 0; i < count; i++) {
            chain[i] = current;
            current = vipUsers[current].referrer;
        }
        
        return chain;
    }
    
    /**
     * @notice 获取用户的直接下级列表
     */
    function getDirectReferrals(address user) external view returns (address[] memory) {
        return referrals[user];
    }
    
    /**
     * @notice 计算可领取的TFT数量
     */
    function calculateTFTReturn(uint256 usdtAmount) external view returns (uint256) {
        return _calculateTFTReturn(usdtAmount);
    }
    
    /**
     * @notice 检查是否可以复投
     */
    function canReinvest(address user) external view returns (bool) {
        VIPInfo storage info = vipUsers[user];
        if (!info.isVIP) return false;
        if (info.totalSeePointEarned < REINVEST_THRESHOLD) return false;
        if (info.reinvestTriggered && block.timestamp < info.lastReinvestTime + 48 hours) return false;
        return true;
    }
}
