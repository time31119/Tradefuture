// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AutoBurn
 * @notice 阶梯式自动销毁合约
 * 
 * 销毁规则（根据流动性池规模）：
 * 
 * | 底池规模          | 销毁频率 | 销毁比例 |
 * |-------------------|---------|---------|
 * | ≥ 500万 USDT      | 每小时   | 0.5%    |
 * | 200万 ~ 499.9万   | 每小时   | 0.05%   |
 * | 5.01万 ~ 199.9万  | 每小时   | 0.005%  |
 * | ≤ 5万 USDT        | 停止     | —       |
 * 
 * 通缩目标：最终通缩至 50,000 枚
 */
contract AutoBurn is Ownable {
    using SafeERC20 for IERC20;

    // ============ 状态变量 ============
    
    IERC20 public immutable tft;
    IERC20 public immutable usdt;
    
    // 流动性池地址（PancakeSwap LP Token）
    address public lpToken;
    
    // 销毁地址
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    
    // 通缩目标
    uint256 public constant MIN_SUPPLY = 50_000e18; // 50,000 TFT
    
    // 阶梯配置（以USDT计价的底池规模）
    uint256 public constant TIER_1_THRESHOLD = 5_000_000e6; // 500万 USDT
    uint256 public constant TIER_2_THRESHOLD = 2_000_000e6; // 200万 USDT
    uint256 public constant TIER_3_THRESHOLD = 50_100e6;    // 5.01万 USDT
    uint256 public constant TIER_4_THRESHOLD = 50_000e6;    // 5万 USDT
    
    // 销毁比例（basis points: 10000 = 100%）
    uint256 public constant TIER_1_RATE = 50;   // 0.5% = 50 bps
    uint256 public constant TIER_2_RATE = 5;    // 0.05% = 5 bps
    uint256 public constant TIER_3_RATE = 5;    // 0.005% = 0.5 bps (需要调整)
    
    // 实际上 0.005% = 0.5 bps，但 Solidity 不支持小数，我们用更精确的方式
    // 0.005% = 5 / 100000 = 1 / 20000
    // 我们用 1000000 作为基数
    uint256 public constant RATE_BASE = 1000000; // 1000000 = 100%
    uint256 public constant TIER_1_RATE_PRECISE = 5000;   // 0.5% = 5000/1000000
    uint256 public constant TIER_2_RATE_PRECISE = 500;    // 0.05% = 500/1000000
    uint256 public constant TIER_3_RATE_PRECISE = 50;     // 0.005% = 50/1000000
    
    // 时间配置
    uint256 public constant BURN_INTERVAL = 1 hours; // 每小时执行一次
    
    // 状态
    uint256 public lastBurnTime;
    uint256 public totalBurned;
    uint256 public burnCount;
    
    // 是否启用自动销毁
    bool public autoBurnEnabled = true;
    
    // ============ 事件 ============
    
    event AutoBurnExecuted(uint256 amount, uint256 tier, uint256 poolSize, uint256 timestamp);
    event AutoBurnToggled(bool enabled);
    event LPTokenUpdated(address lpToken);
    
    // ============ 构造函数 ============
    
    constructor(address _tft, address _usdt, address _lpToken) Ownable(msg.sender) {
        require(_tft != address(0), "Invalid TFT address");
        require(_usdt != address(0), "Invalid USDT address");
        
        tft = IERC20(_tft);
        usdt = IERC20(_usdt);
        lpToken = _lpToken;
    }
    
    // ============ 外部函数 ============
    
    /**
     * @notice 执行自动销毁（任何人可调用）
     */
    function executeAutoBurn() external {
        require(autoBurnEnabled, "Auto burn disabled");
        require(block.timestamp >= lastBurnTime + BURN_INTERVAL, "Too early");
        require(tft.totalSupply() > MIN_SUPPLY, "Min supply reached");
        
        // 获取当前底池规模
        uint256 poolSize = _getPoolSize();
        
        // 确定当前阶梯
        (uint256 tier, uint256 rate) = _getCurrentTier(poolSize);
        
        // 如果低于最低阈值，不执行销毁
        if (tier == 0) {
            lastBurnTime = block.timestamp;
            return;
        }
        
        // 计算销毁数量
        uint256 burnAmount = _calculateBurnAmount(rate);
        
        // 确保不低于最小供应量
        uint256 currentSupply = tft.totalSupply();
        if (currentSupply - burnAmount < MIN_SUPPLY) {
            burnAmount = currentSupply - MIN_SUPPLY;
        }
        
        if (burnAmount > 0) {
            // 从合约余额中转出并销毁
            uint256 contractBalance = tft.balanceOf(address(this));
            if (contractBalance >= burnAmount) {
                tft.safeTransfer(BURN_ADDRESS, burnAmount);
                
                totalBurned += burnAmount;
                burnCount++;
                lastBurnTime = block.timestamp;
                
                emit AutoBurnExecuted(burnAmount, tier, poolSize, block.timestamp);
            }
        } else {
            lastBurnTime = block.timestamp;
        }
    }
    
    /**
     * @notice 向销毁合约注入TFT（用于后续销毁）
     */
    function depositForBurn(uint256 amount) external {
        tft.safeTransferFrom(msg.sender, address(this), amount);
    }
    
    /**
     * @notice 手动执行销毁（仅owner）
     */
    function manualBurn(uint256 amount) external onlyOwner {
        uint256 contractBalance = tft.balanceOf(address(this));
        require(contractBalance >= amount, "Insufficient balance");
        
        uint256 currentSupply = tft.totalSupply();
        require(currentSupply - amount >= MIN_SUPPLY, "Below min supply");
        
        tft.safeTransfer(BURN_ADDRESS, amount);
        
        totalBurned += amount;
        burnCount++;
        lastBurnTime = block.timestamp;
        
        emit AutoBurnExecuted(amount, 0, 0, block.timestamp);
    }
    
    // ============ 管理函数 ============
    
    /**
     * @notice 启用/禁用自动销毁
     */
    function setAutoBurnEnabled(bool _enabled) external onlyOwner {
        autoBurnEnabled = _enabled;
        emit AutoBurnToggled(_enabled);
    }
    
    /**
     * @notice 更新LP Token地址
     */
    function setLPToken(address _lpToken) external onlyOwner {
        lpToken = _lpToken;
        emit LPTokenUpdated(_lpToken);
    }
    
    /**
     * @notice 紧急提取代币（仅owner，用于错误转账恢复）
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        require(token != address(tft), "Cannot withdraw TFT");
        IERC20(token).safeTransfer(owner(), amount);
    }
    
    // ============ 内部函数 ============
    
    /**
     * @notice 获取流动性池规模（以USDT计价）
     */
    function _getPoolSize() internal view returns (uint256) {
        if (lpToken == address(0)) {
            return 0;
        }
        
        // 获取合约中的USDT余额作为池规模参考
        // 实际应该查询PancakeSwap的流动性池
        // 这里简化为查询USDT余额
        return usdt.balanceOf(address(this));
    }
    
    /**
     * @notice 获取当前阶梯和销毁比例
     */
    function _getCurrentTier(uint256 poolSize) internal pure returns (uint256 tier, uint256 rate) {
        if (poolSize >= TIER_1_THRESHOLD) {
            return (1, TIER_1_RATE_PRECISE); // 0.5%
        } else if (poolSize >= TIER_2_THRESHOLD) {
            return (2, TIER_2_RATE_PRECISE); // 0.05%
        } else if (poolSize >= TIER_3_THRESHOLD) {
            return (3, TIER_3_RATE_PRECISE); // 0.005%
        } else if (poolSize >= TIER_4_THRESHOLD) {
            return (4, 0); // 停止销毁
        } else {
            return (0, 0); // 低于阈值，不销毁
        }
    }
    
    /**
     * @notice 计算销毁数量
     */
    function _calculateBurnAmount(uint256 rate) internal view returns (uint256) {
        uint256 contractBalance = tft.balanceOf(address(this));
        return (contractBalance * rate) / RATE_BASE;
    }
    
    // ============ 查询函数 ============
    
    /**
     * @notice 获取当前阶梯信息
     */
    function getCurrentTierInfo() external view returns (
        uint256 tier,
        uint256 rate,
        uint256 poolSize,
        uint256 nextTierThreshold,
        uint256 burnAmountIfExecuted
    ) {
        poolSize = _getPoolSize();
        (tier, rate) = _getCurrentTier(poolSize);
        
        // 计算如果现在执行会销毁多少
        if (rate > 0) {
            burnAmountIfExecuted = _calculateBurnAmount(rate);
        }
        
        // 计算下一阶梯阈值
        if (poolSize < TIER_3_THRESHOLD) {
            nextTierThreshold = TIER_3_THRESHOLD;
        } else if (poolSize < TIER_2_THRESHOLD) {
            nextTierThreshold = TIER_2_THRESHOLD;
        } else if (poolSize < TIER_1_THRESHOLD) {
            nextTierThreshold = TIER_1_THRESHOLD;
        }
        
        return (tier, rate, poolSize, nextTierThreshold, burnAmountIfExecuted);
    }
    
    /**
     * @notice 获取销毁统计
     */
    function getBurnStats() external view returns (
        uint256 _totalBurned,
        uint256 _burnCount,
        uint256 _lastBurnTime,
        uint256 _nextBurnTime,
        uint256 _currentSupply,
        uint256 _supplyUntilMin
    ) {
        _totalBurned = totalBurned;
        _burnCount = burnCount;
        _lastBurnTime = lastBurnTime;
        _nextBurnTime = lastBurnTime + BURN_INTERVAL;
        _currentSupply = tft.totalSupply();
        _supplyUntilMin = _currentSupply - MIN_SUPPLY;
        
        return (_totalBurned, _burnCount, _lastBurnTime, _nextBurnTime, _currentSupply, _supplyUntilMin);
    }
    
    /**
     * @notice 检查是否可以执行销毁
     */
    function canExecuteBurn() external view returns (bool) {
        if (!autoBurnEnabled) return false;
        if (block.timestamp < lastBurnTime + BURN_INTERVAL) return false;
        if (tft.totalSupply() <= MIN_SUPPLY) return false;
        
        uint256 poolSize = _getPoolSize();
        (uint256 tier, ) = _getCurrentTier(poolSize);
        
        return tier > 0 && tier < 4;
    }
    
    /**
     * @notice 获取阶梯配置
     */
    function getTierConfig() external pure returns (
        uint256 tier1Threshold,
        uint256 tier2Threshold,
        uint256 tier3Threshold,
        uint256 tier4Threshold,
        uint256 tier1Rate,
        uint256 tier2Rate,
        uint256 tier3Rate
    ) {
        return (
            TIER_1_THRESHOLD,
            TIER_2_THRESHOLD,
            TIER_3_THRESHOLD,
            TIER_4_THRESHOLD,
            TIER_1_RATE_PRECISE,
            TIER_2_RATE_PRECISE,
            TIER_3_RATE_PRECISE
        );
    }
}
