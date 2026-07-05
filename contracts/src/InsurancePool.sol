// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title InsurancePool
 * @notice Insurance pool that receives 20% of prediction bets
 * 
 * Mechanism:
 * - Receives USDT from prediction market (20% of each bet)
 * - Uses USDT to buy TFT from the market (via DEX or fixed price)
 * - TFT is held in the pool as insurance reserve
 * - When users lose predictions, they can claim insurance from the pool
 * - Insurance payout is in TFT tokens
 * 
 * The pool maintains a TFT/USDT ratio to determine insurance value.
 */
contract InsurancePool is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // Token addresses
    IERC20 public immutable usdt;
    IERC20 public immutable tft;
    
    // Prediction market address (authorized to deposit)
    address public predictionMarket;
    
    // TFT price in USDT (8 decimals, e.g., 0.01 USDT = 1000000)
    uint256 public tftPrice = 1000000; // 0.01 USDT per TFT
    
    // Pool statistics
    uint256 public totalUSDTDeposited;
    uint256 public totalTFTBought;
    uint256 public totalTFTDistributed;
    uint256 public totalUSDTDistributed;
    
    // Current round insurance amount
    uint256 public currentRoundInsurance;
    
    // User insurance claims
    mapping(address => uint256) public userClaims;
    
    // Events
    event USDTDeposited(address indexed from, uint256 amount);
    event TFTBought(uint256 usdtAmount, uint256 tftAmount, uint256 price);
    event InsuranceClaimed(address indexed user, uint256 tftAmount, uint256 usdtValue);
    event InsurancePaidToUser(address indexed user, uint256 tftAmount, uint256 usdtValue);
    event TFTPriceUpdated(uint256 newPrice);
    event PredictionMarketUpdated(address market);
    event RoundInsuranceReset(uint256 roundId);
    
    constructor(
        address _usdt,
        address _tft,
        address _predictionMarket
    ) Ownable(msg.sender) {
        require(_usdt != address(0), "Invalid USDT");
        require(_tft != address(0), "Invalid TFT");
        require(_predictionMarket != address(0), "Invalid market");
        
        usdt = IERC20(_usdt);
        tft = IERC20(_tft);
        predictionMarket = _predictionMarket;
    }
    
    modifier onlyPredictionMarket() {
        require(msg.sender == predictionMarket, "Only prediction market");
        _;
    }
    
    /**
     * @notice Deposit USDT from prediction market
     */
    function deposit(uint256 _amount) external onlyPredictionMarket nonReentrant {
        require(_amount > 0, "Amount must be > 0");
        
        usdt.safeTransferFrom(msg.sender, address(this), _amount);
        totalUSDTDeposited += _amount;
        currentRoundInsurance += _amount;
        
        emit USDTDeposited(msg.sender, _amount);
    }
    
    /**
     * @notice Notify the pool that USDT has been transferred directly
     * @dev Called by prediction market after transferring USDT directly
     */
    function notifyDeposit(uint256 _amount) external onlyPredictionMarket {
        require(_amount > 0, "Amount must be > 0");
        totalUSDTDeposited += _amount;
        currentRoundInsurance += _amount;
        emit USDTDeposited(msg.sender, _amount);
    }
    
    /**
     * @notice Buy TFT with pool's USDT (simulated - in production would use DEX)
     * @dev In production, this would interact with PancakeSwap or similar DEX
     */
    function buyTFT(uint256 _usdtAmount) external onlyOwner nonReentrant {
        require(_usdtAmount <= usdt.balanceOf(address(this)), "Insufficient USDT");
        
        // Calculate TFT amount based on current price
        // tftPrice is in 8 decimals (0.01 USDT = 1000000)
        // TFT has 18 decimals
        uint256 tftAmount = (_usdtAmount * 1e18) / (tftPrice * 1e10);
        
        require(tft.balanceOf(address(this)) >= tftAmount, "Insufficient TFT in pool");
        
        totalTFTBought += tftAmount;
        
        emit TFTBought(_usdtAmount, tftAmount, tftPrice);
    }
    
    /**
     * @notice Deposit TFT directly into the pool
     */
    function depositTFT(uint256 _amount) external onlyOwner nonReentrant {
        require(_amount > 0, "Amount must be > 0");
        tft.safeTransferFrom(msg.sender, address(this), _amount);
        totalTFTBought += _amount;
        
        emit TFTBought(0, _amount, tftPrice);
    }
    
    /**
     * @notice Claim insurance payout for a losing user
     * @dev Insurance is paid in TFT tokens
     */
    function claimInsurance(uint256 _usdtValue) external nonReentrant {
        require(_usdtValue > 0, "Amount must be > 0");
        
        // Calculate TFT amount based on current price
        uint256 tftAmount = (_usdtValue * 1e18) / (tftPrice * 1e10);
        
        require(tft.balanceOf(address(this)) >= tftAmount, "Insufficient TFT in pool");
        
        totalTFTDistributed += tftAmount;
        totalUSDTDistributed += _usdtValue;
        userClaims[msg.sender] += tftAmount;
        
        tft.safeTransfer(msg.sender, tftAmount);
        
        emit InsuranceClaimed(msg.sender, tftAmount, _usdtValue);
    }
    
    /**
     * @notice Pay insurance to a user (called by PredictionMarket when user loses)
     * @param _user The user to receive insurance
     * @param _usdtValue The USDT value of the insurance (40% of bet amount)
     */
    function payInsuranceToUser(address _user, uint256 _usdtValue) external onlyPredictionMarket nonReentrant {
        require(_user != address(0), "Invalid user");
        require(_usdtValue > 0, "Amount must be > 0");
        
        // Calculate TFT amount based on current price
        uint256 tftAmount = (_usdtValue * 1e18) / (tftPrice * 1e10);
        
        require(tft.balanceOf(address(this)) >= tftAmount, "Insufficient TFT in pool");
        
        totalTFTDistributed += tftAmount;
        totalUSDTDistributed += _usdtValue;
        userClaims[_user] += tftAmount;
        
        tft.safeTransfer(_user, tftAmount);
        
        emit InsurancePaidToUser(_user, tftAmount, _usdtValue);
    }
    
    /**
     * @notice Update TFT price (called by owner or oracle)
     * @param _newPrice New price in 8 decimals (0.01 USDT = 1000000)
     */
    function setTFTPrice(uint256 _newPrice) external onlyOwner {
        require(_newPrice > 0, "Price must be > 0");
        tftPrice = _newPrice;
        emit TFTPriceUpdated(_newPrice);
    }
    
    /**
     * @notice Update prediction market address
     */
    function setPredictionMarket(address _market) external onlyOwner {
        require(_market != address(0), "Invalid market");
        predictionMarket = _market;
        emit PredictionMarketUpdated(_market);
    }
    
    /**
     * @notice Reset current round insurance counter
     */
    function resetRoundInsurance() external onlyPredictionMarket {
        currentRoundInsurance = 0;
    }
    
    /**
     * @notice Get pool statistics
     */
    function getPoolStats() external view returns (
        uint256 usdtBalance,
        uint256 tftBalance,
        uint256 totalDeposited,
        uint256 totalBought,
        uint256 totalDistributed,
        uint256 currentRound
    ) {
        return (
            usdt.balanceOf(address(this)),
            tft.balanceOf(address(this)),
            totalUSDTDeposited,
            totalTFTBought,
            totalTFTDistributed,
            currentRoundInsurance
        );
    }
    
    /**
     * @notice Calculate TFT amount for a given USDT value
     */
    function calculateTFTForUSDT(uint256 _usdtAmount) external view returns (uint256) {
        return (_usdtAmount * 1e18) / (tftPrice * 1e10);
    }
    
    /**
     * @notice Calculate USDT value for a given TFT amount
     */
    function calculateUSDTForTFT(uint256 _tftAmount) external view returns (uint256) {
        return (_tftAmount * tftPrice * 1e10) / 1e18;
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
