// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TeamVesting
 * @notice 团队锁仓合约
 * 
 * 锁仓规则：
 * - 锁仓数量：1,000,000 TFT
 * - 锁仓周期：50个月
 * - 释放规则：每月释放2%（线性释放）
 * - 首次释放：锁仓开始后1个月
 */
contract TeamVesting is Ownable {
    using SafeERC20 for IERC20;

    // ============ 状态变量 ============
    
    IERC20 public immutable tft;
    
    // 锁仓配置
    uint256 public constant TOTAL_VESTING_AMOUNT = 1_000_000e18; // 1,000,000 TFT
    uint256 public constant VESTING_DURATION = 50 * 30 days; // 50个月（每月按30天计算）
    uint256 public constant RELEASE_PER_MONTH = 20000e18; // 每月释放 20,000 TFT (2%)
    uint256 public constant CLIFF_DURATION = 30 days; // 锁定期1个月
    
    // 受益人信息
    struct Beneficiary {
        uint256 allocatedAmount; // 分配数量
        uint256 releasedAmount;  // 已释放数量
        uint256 startTime;       // 开始时间
        bool isActive;           // 是否激活
    }
    
    mapping(address => Beneficiary) public beneficiaries;
    address[] public beneficiaryList;
    
    // 总锁仓
    uint256 public totalLocked;
    uint256 public totalReleased;
    uint256 public vestingStartTime;
    
    // ============ 事件 ============
    
    event BeneficiaryAdded(address indexed beneficiary, uint256 amount);
    event BeneficiaryRemoved(address indexed beneficiary);
    event TokensReleased(address indexed beneficiary, uint256 amount);
    event VestingStarted(uint256 startTime, uint256 totalAmount);
    
    // ============ 构造函数 ============
    
    constructor(address _tft) Ownable(msg.sender) {
        require(_tft != address(0), "Invalid TFT address");
        tft = IERC20(_tft);
    }
    
    // ============ 管理函数 ============
    
    /**
     * @notice 启动锁仓（转入代币并设置开始时间）
     */
    function startVesting() external onlyOwner {
        require(vestingStartTime == 0, "Already started");
        require(tft.balanceOf(address(this)) >= TOTAL_VESTING_AMOUNT, "Insufficient tokens");
        
        vestingStartTime = block.timestamp;
        totalLocked = TOTAL_VESTING_AMOUNT;
        
        emit VestingStarted(block.timestamp, TOTAL_VESTING_AMOUNT);
    }
    
    /**
     * @notice 添加受益人
     * @param beneficiary 受益人地址
     * @param amount 分配数量
     */
    function addBeneficiary(address beneficiary, uint256 amount) external onlyOwner {
        require(vestingStartTime == 0, "Vesting already started");
        require(beneficiary != address(0), "Invalid address");
        require(amount > 0, "Invalid amount");
        require(!beneficiaries[beneficiary].isActive, "Already exists");
        
        beneficiaries[beneficiary] = Beneficiary({
            allocatedAmount: amount,
            releasedAmount: 0,
            startTime: 0, // Will be set when vesting starts
            isActive: true
        });
        
        beneficiaryList.push(beneficiary);
        
        emit BeneficiaryAdded(beneficiary, amount);
    }
    
    /**
     * @notice 批量添加受益人
     */
    function addBeneficiaries(
        address[] calldata _beneficiaries,
        uint256[] calldata _amounts
    ) external onlyOwner {
        require(vestingStartTime == 0, "Vesting already started");
        require(_beneficiaries.length == _amounts.length, "Length mismatch");
        
        uint256 totalAllocated = 0;
        
        for (uint256 i = 0; i < _beneficiaries.length; i++) {
            address beneficiary = _beneficiaries[i];
            uint256 amount = _amounts[i];
            
            require(beneficiary != address(0), "Invalid address");
            require(amount > 0, "Invalid amount");
            require(!beneficiaries[beneficiary].isActive, "Already exists");
            
            beneficiaries[beneficiary] = Beneficiary({
                allocatedAmount: amount,
                releasedAmount: 0,
                startTime: 0,
                isActive: true
            });
            
            beneficiaryList.push(beneficiary);
            totalAllocated += amount;
            
            emit BeneficiaryAdded(beneficiary, amount);
        }
        
        require(totalAllocated <= TOTAL_VESTING_AMOUNT, "Exceeds total");
    }
    
    /**
     * @notice 移除受益人
     */
    function removeBeneficiary(address beneficiary) external onlyOwner {
        require(vestingStartTime == 0, "Vesting already started");
        require(beneficiaries[beneficiary].isActive, "Not a beneficiary");
        require(beneficiaries[beneficiary].releasedAmount == 0, "Already released");
        
        beneficiaries[beneficiary].isActive = false;
        beneficiaries[beneficiary].allocatedAmount = 0;
        
        // Remove from list
        for (uint256 i = 0; i < beneficiaryList.length; i++) {
            if (beneficiaryList[i] == beneficiary) {
                beneficiaryList[i] = beneficiaryList[beneficiaryList.length - 1];
                beneficiaryList.pop();
                break;
            }
        }
        
        emit BeneficiaryRemoved(beneficiary);
    }
    
    // ============ 释放函数 ============
    
    /**
     * @notice 释放可领取的代币
     */
    function release() external {
        Beneficiary storage beneficiary = beneficiaries[msg.sender];
        require(beneficiary.isActive, "Not a beneficiary");
        require(vestingStartTime > 0, "Vesting not started");
        
        uint256 releasable = _calculateReleasable(msg.sender);
        require(releasable > 0, "Nothing to release");
        
        beneficiary.releasedAmount += releasable;
        totalReleased += releasable;
        
        tft.safeTransfer(msg.sender, releasable);
        
        emit TokensReleased(msg.sender, releasable);
    }
    
    /**
     * @notice 为指定受益人释放代币（任何人可调用）
     */
    function releaseFor(address beneficiary) external {
        Beneficiary storage ben = beneficiaries[beneficiary];
        require(ben.isActive, "Not a beneficiary");
        require(vestingStartTime > 0, "Vesting not started");
        
        uint256 releasable = _calculateReleasable(beneficiary);
        require(releasable > 0, "Nothing to release");
        
        ben.releasedAmount += releasable;
        totalReleased += releasable;
        
        tft.safeTransfer(beneficiary, releasable);
        
        emit TokensReleased(beneficiary, releasable);
    }
    
    // ============ 内部函数 ============
    
    /**
     * @notice 计算可释放数量
     */
    function _calculateReleasable(address beneficiary) internal view returns (uint256) {
        Beneficiary storage ben = beneficiaries[beneficiary];
        
        if (!ben.isActive || vestingStartTime == 0) {
            return 0;
        }
        
        uint256 elapsed = block.timestamp - vestingStartTime;
        
        // 锁定期内不可释放
        if (elapsed < CLIFF_DURATION) {
            return 0;
        }
        
        // 计算已过的月数
        uint256 monthsPassed = elapsed / 30 days;
        
        // 最多50个月
        if (monthsPassed > 50) {
            monthsPassed = 50;
        }
        
        // 应释放总量 = 每月释放量 × 已过月数
        uint256 vestedAmount = monthsPassed * RELEASE_PER_MONTH;
        
        // 不超过分配总量
        if (vestedAmount > ben.allocatedAmount) {
            vestedAmount = ben.allocatedAmount;
        }
        
        // 可释放 = 应释放 - 已释放
        return vestedAmount - ben.releasedAmount;
    }
    
    // ============ 查询函数 ============
    
    /**
     * @notice 获取受益人信息
     */
    function getBeneficiaryInfo(address beneficiary) external view returns (
        uint256 allocatedAmount,
        uint256 releasedAmount,
        uint256 releasableAmount,
        uint256 vestedAmount,
        uint256 monthsPassed
    ) {
        Beneficiary storage ben = beneficiaries[beneficiary];
        
        allocatedAmount = ben.allocatedAmount;
        releasedAmount = ben.releasedAmount;
        releasableAmount = _calculateReleasable(beneficiary);
        
        if (vestingStartTime > 0) {
            uint256 elapsed = block.timestamp - vestingStartTime;
            monthsPassed = elapsed / 30 days;
            if (monthsPassed > 50) monthsPassed = 50;
            
            vestedAmount = monthsPassed * RELEASE_PER_MONTH;
            if (vestedAmount > ben.allocatedAmount) {
                vestedAmount = ben.allocatedAmount;
            }
        }
        
        return (allocatedAmount, releasedAmount, releasableAmount, vestedAmount, monthsPassed);
    }
    
    /**
     * @notice 获取锁仓进度
     */
    function getVestingProgress() external view returns (
        uint256 totalLockedAmount,
        uint256 totalReleasedAmount,
        uint256 remainingAmount,
        uint256 monthsElapsed,
        uint256 monthsRemaining,
        bool isCompleted
    ) {
        totalLockedAmount = totalLocked;
        totalReleasedAmount = totalReleased;
        remainingAmount = totalLocked - totalReleased;
        
        if (vestingStartTime > 0) {
            uint256 elapsed = block.timestamp - vestingStartTime;
            monthsElapsed = elapsed / 30 days;
            if (monthsElapsed > 50) monthsElapsed = 50;
            
            monthsRemaining = 50 - monthsElapsed;
            isCompleted = monthsElapsed >= 50;
        }
        
        return (totalLockedAmount, totalReleasedAmount, remainingAmount, monthsElapsed, monthsRemaining, isCompleted);
    }
    
    /**
     * @notice 获取受益人列表
     */
    function getBeneficiaries() external view returns (address[] memory) {
        return beneficiaryList;
    }
    
    /**
     * @notice 获取受益人数量
     */
    function getBeneficiaryCount() external view returns (uint256) {
        return beneficiaryList.length;
    }
    
    /**
     * @notice 检查是否可以释放
     */
    function isReleasable(address beneficiary) external view returns (bool) {
        return _calculateReleasable(beneficiary) > 0;
    }
}
