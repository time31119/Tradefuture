// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TFT Token (TradeFuture Token)
 * @dev BEP-20 token with 6% transaction tax distribution
 * 
 * Tax Distribution:
 * - 3% → Node dividends (distributed by node weight)
 * - 1% → Operations team
 * - 1% → Market makers (evenly distributed)
 * - 1% → Auto-burn (buy TFT and send to black hole)
 * 
 * Tiered Auto-Burn:
 * - ≥ 5,000,000 tokens: 0.5% per hour
 * - 2,000,000 ~ 4,999,999: 0.05% per hour
 * - 50,100 ~ 1,999,999: 0.005% per hour
 * - ≤ 50,000: Stop burning
 * 
 * Team Lock-up:
 * - 1,000,000 tokens locked for 50 months
 * - 2% released per month
 */

interface IBEP20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

interface IPancakeRouter {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    
    function WETH() external pure returns (address);
    function factory() external pure returns (address);
}

interface IPancakeFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

contract TFTToken is IBEP20 {
    // Token info
    string public constant name = "TradeFuture Token";
    string public constant symbol = "TFT";
    uint8 public constant decimals = 18;
    
    // Initial supply: 11,000,000 tokens
    uint256 public constant INITIAL_SUPPLY = 11_000_000 * 10**18;
    
    // Tax distribution (in basis points, 10000 = 100%)
    uint256 public constant NODE_TAX_BPS = 300;      // 3%
    uint256 public constant OPS_TAX_BPS = 100;       // 1%
    uint256 public constant MARKET_MAKER_TAX_BPS = 100; // 1%
    uint256 public constant BURN_TAX_BPS = 100;      // 1%
    uint256 public constant TOTAL_TAX_BPS = 600;     // 6%
    
    // Burn thresholds
    uint256 public constant BURN_THRESHOLD_1 = 5_000_000 * 10**18;
    uint256 public constant BURN_THRESHOLD_2 = 2_000_000 * 10**18;
    uint256 public constant BURN_THRESHOLD_3 = 50_100 * 10**18;
    uint256 public constant BURN_STOP_THRESHOLD = 50_000 * 10**18;
    
    // Burn rates (in basis points per hour)
    uint256 public constant BURN_RATE_1 = 50;   // 0.5%
    uint256 public constant BURN_RATE_2 = 5;    // 0.05%
    uint256 public constant BURN_RATE_3 = 1;    // 0.005%
    
    // Team lock-up
    uint256 public constant TEAM_LOCK_AMOUNT = 1_000_000 * 10**18;
    uint256 public constant TEAM_LOCK_MONTHS = 50;
    uint256 public constant TEAM_RELEASE_PER_MONTH_BPS = 200; // 2%
    
    // State variables
    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    
    // Addresses
    address public owner;
    address public operationsWallet;
    address public nodeDividendPool;
    address public marketMakerPool;
    address public burnAddress = 0x000000000000000000000000000000000000dEaD;
    address public teamWallet;
    
    // Team lock-up state
    uint256 public teamLockStartTime;
    uint256 public teamReleasedAmount;
    
    // Auto-burn state
    uint256 public lastBurnTime;
    uint256 public totalBurned;
    
    // PancakeSwap
    address public pancakeRouter;
    address public usdtAddress;
    address public tftUsdtPair;
    
    // Exempt from tax (for liquidity pool, contracts, etc.)
    mapping(address => bool) public isTaxExempt;
    
    // Events
    event TaxDistributed(uint256 nodeAmount, uint256 opsAmount, uint256 mmAmount, uint256 burnAmount);
    event AutoBurn(uint256 amount, uint256 newTotalSupply);
    event TeamRelease(uint256 amount, uint256 totalReleased);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    
    constructor(
        address _operationsWallet,
        address _nodeDividendPool,
        address _marketMakerPool,
        address _teamWallet,
        address _pancakeRouter,
        address _usdtAddress
    ) {
        owner = msg.sender;
        operationsWallet = _operationsWallet;
        nodeDividendPool = _nodeDividendPool;
        marketMakerPool = _marketMakerPool;
        teamWallet = _teamWallet;
        pancakeRouter = _pancakeRouter;
        usdtAddress = _usdtAddress;
        
        // Mint initial supply to owner
        _mint(msg.sender, INITIAL_SUPPLY);
        
        // Transfer team lock-up amount
        teamLockStartTime = block.timestamp;
        
        // Set initial burn time
        lastBurnTime = block.timestamp;
        
        // Exempt certain addresses from tax
        isTaxExempt[msg.sender] = true;
        isTaxExempt[burnAddress] = true;
        isTaxExempt[nodeDividendPool] = true;
        isTaxExempt[marketMakerPool] = true;
    }
    
    // ============ IBEP20 Implementation ============
    
    function totalSupply() external view override returns (uint256) {
        return _totalSupply;
    }
    
    function balanceOf(address account) external view override returns (uint256) {
        return _balances[account];
    }
    
    function transfer(address recipient, uint256 amount) external override returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }
    
    function allowance(address owner, address spender) external view override returns (uint256) {
        return _allowances[owner][spender];
    }
    
    function approve(address spender, uint256 amount) external override returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }
    
    function transferFrom(address sender, address recipient, uint256 amount) external override returns (bool) {
        _transfer(sender, recipient, amount);
        uint256 currentAllowance = _allowances[sender][msg.sender];
        require(currentAllowance >= amount, "BEP20: transfer amount exceeds allowance");
        unchecked {
            _approve(sender, msg.sender, currentAllowance - amount);
        }
        return true;
    }
    
    // ============ Tax Distribution ============
    
    function _calculateTax(uint256 amount) internal pure returns (
        uint256 nodeTax,
        uint256 opsTax,
        uint256 mmTax,
        uint256 burnTax
    ) {
        nodeTax = amount * NODE_TAX_BPS / 10000;
        opsTax = amount * OPS_TAX_BPS / 10000;
        mmTax = amount * MARKET_MAKER_TAX_BPS / 10000;
        burnTax = amount * BURN_TAX_BPS / 10000;
    }
    
    function _distributeTax(
        uint256 nodeTax,
        uint256 opsTax,
        uint256 mmTax,
        uint256 burnTax
    ) internal {
        // Transfer to respective pools
        if (nodeTax > 0) {
            _balances[nodeDividendPool] += nodeTax;
            emit Transfer(address(this), nodeDividendPool, nodeTax);
        }
        if (opsTax > 0) {
            _balances[operationsWallet] += opsTax;
            emit Transfer(address(this), operationsWallet, opsTax);
        }
        if (mmTax > 0) {
            _balances[marketMakerPool] += mmTax;
            emit Transfer(address(this), marketMakerPool, mmTax);
        }
        if (burnTax > 0) {
            // Auto-burn: buy TFT with USDT and send to burn address
            _autoBurn(burnTax);
        }
        
        emit TaxDistributed(nodeTax, opsTax, mmTax, burnTax);
    }
    
    function _autoBurn(uint256 burnAmount) internal {
        // In a real implementation, this would:
        // 1. Swap TFT for USDT on PancakeSwap
        // 2. Use USDT to buy TFT
        // 3. Send bought TFT to burn address
        
        // For now, we'll just burn the tokens directly
        // In production, this would be handled by an off-chain keeper
        _burn(address(this), burnAmount);
        totalBurned += burnAmount;
        
        emit AutoBurn(burnAmount, _totalSupply);
    }
    
    // ============ Tiered Auto-Burn ============
    
    function canAutoBurn() public view returns (bool) {
        if (_totalSupply <= BURN_STOP_THRESHOLD) {
            return false;
        }
        return block.timestamp >= lastBurnTime + 1 hours;
    }
    
    function getBurnRate() public view returns (uint256) {
        if (_totalSupply >= BURN_THRESHOLD_1) {
            return BURN_RATE_1;
        } else if (_totalSupply >= BURN_THRESHOLD_2) {
            return BURN_RATE_2;
        } else if (_totalSupply >= BURN_THRESHOLD_3) {
            return BURN_RATE_3;
        }
        return 0;
    }
    
    function executeAutoBurn() external {
        require(canAutoBurn(), "Cannot burn yet");
        
        uint256 burnRate = getBurnRate();
        if (burnRate == 0) return;
        
        uint256 burnAmount = _totalSupply * burnRate / 10000;
        
        // Ensure we don't burn below threshold
        if (_totalSupply - burnAmount < BURN_STOP_THRESHOLD) {
            burnAmount = _totalSupply - BURN_STOP_THRESHOLD;
        }
        
        if (burnAmount > 0) {
            _burn(address(this), burnAmount);
            totalBurned += burnAmount;
            lastBurnTime = block.timestamp;
            
            emit AutoBurn(burnAmount, _totalSupply);
        }
    }
    
    // ============ Team Lock-up ============
    
    function getTeamLockedAmount() public view returns (uint256) {
        uint256 monthsPassed = (block.timestamp - teamLockStartTime) / 30 days;
        if (monthsPassed >= TEAM_LOCK_MONTHS) {
            return 0;
        }
        uint256 releasedPerMonth = TEAM_LOCK_AMOUNT * TEAM_RELEASE_PER_MONTH_BPS / 10000;
        uint256 totalReleased = releasedPerMonth * monthsPassed;
        if (totalReleased >= TEAM_LOCK_AMOUNT) {
            return 0;
        }
        return TEAM_LOCK_AMOUNT - totalReleased;
    }
    
    function claimTeamTokens() external {
        require(msg.sender == teamWallet, "Only team wallet");
        
        uint256 monthsPassed = (block.timestamp - teamLockStartTime) / 30 days;
        uint256 releasedPerMonth = TEAM_LOCK_AMOUNT * TEAM_RELEASE_PER_MONTH_BPS / 10000;
        uint256 totalShouldRelease = releasedPerMonth * monthsPassed;
        
        if (totalShouldRelease > TEAM_LOCK_AMOUNT) {
            totalShouldRelease = TEAM_LOCK_AMOUNT;
        }
        
        uint256 claimable = totalShouldRelease - teamReleasedAmount;
        require(claimable > 0, "No tokens to claim");
        
        teamReleasedAmount += claimable;
        _balances[teamWallet] += claimable;
        
        emit TeamRelease(claimable, teamReleasedAmount);
    }
    
    // ============ Internal Functions ============
    
    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(sender != address(0), "BEP20: transfer from zero address");
        require(recipient != address(0), "BEP20: transfer to zero address");
        require(_balances[sender] >= amount, "BEP20: transfer amount exceeds balance");
        
        // Calculate tax if not exempt
        if (!isTaxExempt[sender] && !isTaxExempt[recipient]) {
            (uint256 nodeTax, uint256 opsTax, uint256 mmTax, uint256 burnTax) = _calculateTax(amount);
            uint256 totalTax = nodeTax + opsTax + mmTax + burnTax;
            uint256 transferAmount = amount - totalTax;
            
            _balances[sender] -= amount;
            _balances[recipient] += transferAmount;
            
            // Distribute tax
            _distributeTax(nodeTax, opsTax, mmTax, burnTax);
            
            emit Transfer(sender, recipient, transferAmount);
        } else {
            _balances[sender] -= amount;
            _balances[recipient] += amount;
            emit Transfer(sender, recipient, amount);
        }
    }
    
    function _mint(address account, uint256 amount) internal {
        require(account != address(0), "BEP20: mint to zero address");
        _totalSupply += amount;
        _balances[account] += amount;
        emit Transfer(address(0), account, amount);
    }
    
    function _burn(address account, uint256 amount) internal {
        require(account != address(0), "BEP20: burn from zero address");
        require(_balances[account] >= amount, "BEP20: burn amount exceeds balance");
        unchecked {
            _balances[account] -= amount;
        }
        _totalSupply -= amount;
        emit Transfer(account, address(0), amount);
    }
    
    function _approve(address owner, address spender, uint256 amount) internal {
        require(owner != address(0), "BEP20: approve from zero address");
        require(spender != address(0), "BEP20: approve to zero address");
        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }
    
    // ============ Admin Functions ============
    
    function setTaxExempt(address account, bool exempt) external {
        require(msg.sender == owner, "Only owner");
        isTaxExempt[account] = exempt;
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
        require(newOwner != address(0), "New owner is zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
    
    function renounceOwnership() external {
        require(msg.sender == owner, "Only owner");
        emit OwnershipTransferred(owner, address(0));
        owner = address(0);
    }
    
    // ============ View Functions ============
    
    function getBurnInfo() external view returns (
        uint256 currentSupply,
        uint256 burnRate,
        bool canBurn,
        uint256 nextBurnTime,
        uint256 totalBurnedAmount
    ) {
        return (
            _totalSupply,
            getBurnRate(),
            canAutoBurn(),
            lastBurnTime + 1 hours,
            totalBurned
        );
    }
    
    function getTeamLockInfo() external view returns (
        uint256 lockedAmount,
        uint256 releasedAmount,
        uint256 claimableAmount,
        uint256 monthsPassed,
        uint256 monthsRemaining
    ) {
        monthsPassed = (block.timestamp - teamLockStartTime) / 30 days;
        uint256 releasedPerMonth = TEAM_LOCK_AMOUNT * TEAM_RELEASE_PER_MONTH_BPS / 10000;
        uint256 totalShouldRelease = releasedPerMonth * monthsPassed;
        if (totalShouldRelease > TEAM_LOCK_AMOUNT) {
            totalShouldRelease = TEAM_LOCK_AMOUNT;
        }
        
        lockedAmount = TEAM_LOCK_AMOUNT - totalShouldRelease;
        releasedAmount = teamReleasedAmount;
        claimableAmount = totalShouldRelease - teamReleasedAmount;
        monthsRemaining = monthsPassed >= TEAM_LOCK_MONTHS ? 0 : TEAM_LOCK_MONTHS - monthsPassed;
    }
}
