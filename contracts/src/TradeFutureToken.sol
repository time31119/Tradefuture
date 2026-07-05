// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TradeFutureToken (TFT)
 * @notice TFT 代币合约 - TradeFuture DApp 核心代币
 *
 * 代币经济：
 * - 总供应量：11,000,000 TFT
 * - 初始分配：10,990,000 给部署者，10,000 自动销毁（0.1%）
 *
 * 交易税：6%（买卖均收取）
 * - 节点分红：3% → nodeDividendWallet（按节点权重分配）
 * - 运营团队：1% → operationsWallet（运营、迭代、审计）
 * - 做市商：  1% → marketMakerWallet（平均分配给做市商）
 * - 自动销毁：1% → 转入黑洞地址
 *
 * 交易控制：
 * - tradingEnabled：交易开关，前期关闭，仅白名单地址可转账
 * - 白名单：节点合约、预测合约等可绕过交易限制
 * - 动态税率：owner 可按阶段调整各项税率
 */
contract TradeFutureToken is ERC20, ERC20Burnable, Ownable, ReentrancyGuard {

    // ========== 常量 ==========

    /// @notice 黑洞地址，用于销毁
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice 最大总税率上限（10%，防止设置过高）
    uint256 public constant MAX_TOTAL_TAX_RATE = 1000; // 10%

    // ========== 税率（基点，100 = 1%）==========

    uint256 public nodeDividendRate = 300;    // 3% 节点分红
    uint256 public operationsRate = 100;      // 1% 运营团队
    uint256 public marketMakerRate = 100;     // 1% 做市商
    uint256 public burnRate = 100;            // 1% 自动销毁

    /// @notice 总税率（快捷读取）
    function totalTaxRate() public view returns (uint256) {
        return nodeDividendRate + operationsRate + marketMakerRate + burnRate;
    }

    // ========== 钱包地址 ==========

    address public nodeDividendWallet;    // 节点分红池
    address public operationsWallet;      // 运营团队
    address public marketMakerWallet;     // 做市商池

    // ========== 交易控制 ==========

    /// @notice 交易开关，前期关闭
    bool public tradingEnabled;

    /// @notice 白名单：允许绕过交易限制（节点合约、预测合约等）
    mapping(address => bool) public whitelist;

    // ========== 事件 ==========

    event TradingEnabled();
    event TradingDisabled();
    event WhitelistUpdated(address indexed account, bool status);
    event TaxRatesUpdated(
        uint256 nodeDividendRate,
        uint256 operationsRate,
        uint256 marketMakerRate,
        uint256 burnRate
    );
    event WalletUpdated(string walletType, address newAddress);
    event TaxDistributed(
        address indexed from,
        uint256 totalTax,
        uint256 nodeDividend,
        uint256 operations,
        uint256 marketMaker,
        uint256 burnAmount
    );

    // ========== 修饰符 ==========

    /// @notice 仅当交易开启或地址在白名单中
    modifier onlyWhenTrading() {
        require(
            tradingEnabled || whitelist[msg.sender] || whitelist[tx.origin],
            "Trading is disabled"
        );
        _;
    }

    // ========== 构造函数 ==========

    /**
     * @param _nodeDividendWallet  节点分红池地址
     * @param _operationsWallet    运营团队地址
     * @param _marketMakerWallet   做市商池地址
     */
    constructor(
        address _nodeDividendWallet,
        address _operationsWallet,
        address _marketMakerWallet
    ) ERC20("TradeFuture Token", "TFT") Ownable(msg.sender) {
        require(_nodeDividendWallet != address(0), "Invalid node wallet");
        require(_operationsWallet != address(0), "Invalid operations wallet");
        require(_marketMakerWallet != address(0), "Invalid market maker wallet");

        nodeDividendWallet = _nodeDividendWallet;
        operationsWallet = _operationsWallet;
        marketMakerWallet = _marketMakerWallet;

        // 初始供应 11,000,000 TFT
        _mint(msg.sender, 11_000_000 * 10 ** decimals());

        // 自动销毁 0.1%（10,000 TFT）
        _burn(msg.sender, 10_000 * 10 ** decimals());

        // 前期关闭交易
        tradingEnabled = false;
    }

    // ========== 交易控制 ==========

    /// @notice 开启交易
    function enableTrading() external onlyOwner {
        tradingEnabled = true;
        emit TradingEnabled();
    }

    /// @notice 关闭交易
    function disableTrading() external onlyOwner {
        tradingEnabled = false;
        emit TradingDisabled();
    }

    /// @notice 设置白名单
    function setWhitelist(address _account, bool _status) external onlyOwner {
        require(_account != address(0), "Invalid address");
        whitelist[_account] = _status;
        emit WhitelistUpdated(_account, _status);
    }

    /// @notice 批量设置白名单
    function setWhitelistBatch(address[] calldata _accounts, bool _status) external onlyOwner {
        for (uint256 i = 0; i < _accounts.length; i++) {
            require(_accounts[i] != address(0), "Invalid address");
            whitelist[_accounts[i]] = _status;
            emit WhitelistUpdated(_accounts[i], _status);
        }
    }

    // ========== 税率管理 ==========

    /**
     * @notice 动态调整税率（仅 owner）
     * @param _nodeDividendRate  节点分红税率（基点）
     * @param _operationsRate    运营税率（基点）
     * @param _marketMakerRate   做市商税率（基点）
     * @param _burnRate          销毁税率（基点）
     */
    function setTaxRates(
        uint256 _nodeDividendRate,
        uint256 _operationsRate,
        uint256 _marketMakerRate,
        uint256 _burnRate
    ) external onlyOwner {
        uint256 total = _nodeDividendRate + _operationsRate + _marketMakerRate + _burnRate;
        require(total <= MAX_TOTAL_TAX_RATE, "Total tax exceeds max");

        nodeDividendRate = _nodeDividendRate;
        operationsRate = _operationsRate;
        marketMakerRate = _marketMakerRate;
        burnRate = _burnRate;

        emit TaxRatesUpdated(_nodeDividendRate, _operationsRate, _marketMakerRate, _burnRate);
    }

    // ========== 钱包管理 ==========

    function updateWallets(
        address _nodeDividendWallet,
        address _operationsWallet,
        address _marketMakerWallet
    ) external onlyOwner {
        if (_nodeDividendWallet != address(0)) {
            nodeDividendWallet = _nodeDividendWallet;
            emit WalletUpdated("nodeDividend", _nodeDividendWallet);
        }
        if (_operationsWallet != address(0)) {
            operationsWallet = _operationsWallet;
            emit WalletUpdated("operations", _operationsWallet);
        }
        if (_marketMakerWallet != address(0)) {
            marketMakerWallet = _marketMakerWallet;
            emit WalletUpdated("marketMaker", _marketMakerWallet);
        }
    }

    // ========== 转账（含税） ==========

    function transfer(address to, uint256 amount) public override onlyWhenTrading nonReentrant returns (bool) {
        _transferWithTax(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override onlyWhenTrading nonReentrant returns (bool) {
        _spendAllowance(from, msg.sender, amount);
        _transferWithTax(from, to, amount);
        return true;
    }

    /**
     * @notice 内部转账 + 税分配
     * 白名单地址之间转账免税；owner 和合约自身免税
     */
    function _transferWithTax(address from, address to, uint256 amount) internal {
        // 免税条件：白名单、owner、合约自身
        bool isExempt = whitelist[from] || whitelist[to] ||
                        from == owner() || to == owner() ||
                        from == address(this) || to == address(this);

        if (isExempt || amount == 0) {
            super._transfer(from, to, amount);
            return;
        }

        // 计算各项税
        uint256 nodeDividend = (amount * nodeDividendRate) / 10000;
        uint256 operations = (amount * operationsRate) / 10000;
        uint256 marketMaker = (amount * marketMakerRate) / 10000;
        uint256 burnAmount = (amount * burnRate) / 10000;
        uint256 totalTax = nodeDividend + operations + marketMaker + burnAmount;

        if (totalTax > 0) {
            // 分配税到各钱包
            if (nodeDividend > 0) super._transfer(from, nodeDividendWallet, nodeDividend);
            if (operations > 0) super._transfer(from, operationsWallet, operations);
            if (marketMaker > 0) super._transfer(from, marketMakerWallet, marketMaker);
            if (burnAmount > 0) super._burn(from, burnAmount);

            // 转账税后金额
            uint256 amountAfterTax = amount - totalTax;
            super._transfer(from, to, amountAfterTax);

            emit TaxDistributed(from, totalTax, nodeDividend, operations, marketMaker, burnAmount);
        } else {
            // 税率为 0，全额转账
            super._transfer(from, to, amount);
        }
    }

    // ========== 查询函数 ==========

    /**
     * @notice 获取指定金额的税费明细
     */
    function getTaxBreakdown(uint256 amount) external view returns (
        uint256 totalTax,
        uint256 nodeDividend,
        uint256 operations,
        uint256 marketMaker,
        uint256 burnAmount,
        uint256 amountAfterTax
    ) {
        nodeDividend = (amount * nodeDividendRate) / 10000;
        operations = (amount * operationsRate) / 10000;
        marketMaker = (amount * marketMakerRate) / 10000;
        burnAmount = (amount * burnRate) / 10000;
        totalTax = nodeDividend + operations + marketMaker + burnAmount;
        amountAfterTax = amount - totalTax;
    }

    /**
     * @notice 检查地址是否可以免交易限制
     */
    function canTransfer(address _account) external view returns (bool) {
        return tradingEnabled || whitelist[_account] || _account == owner();
    }

    // ========== 紧急恢复 ==========

    function recoverTokens(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(owner()).transfer(address(this).balance);
        } else {
            IERC20(token).transfer(owner(), amount);
        }
    }
}
