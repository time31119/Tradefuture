// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IInsurancePool {
    function notifyDeposit(uint256 amount) external;
}

/**
 * @title PredictionMarket
 * @notice 5-minute BTC price prediction market
 * 
 * Each round lasts 5 minutes. Users predict if BTC price will go UP or DOWN.
 * Winners split the losing side's bets (minus fees).
 * 20% of each bet goes to the Insurance Pool (buying TFT).
 * 
 * Insurance Pool mechanism:
 * - 20% of each bet amount is used to buy TFT at market price
 * - TFT is sent to Insurance Pool
 * - If a user loses, they receive insurance payout from the pool
 */
contract PredictionMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // Token addresses
    IERC20 public immutable usdt;      // USDT for betting
    IERC20 public immutable tft;       // TFT for insurance pool
    
    // Insurance pool address
    address public insurancePool;
    
    // Oracle address (for price settlement)
    address public oracle;
    
    // Round duration: 5 minutes
    uint256 public constant ROUND_DURATION = 300; // 5 minutes in seconds
    
    // Fee rate: 2% (200 basis points)
    uint256 public constant FEE_RATE = 200;
    
    // Insurance rate: 20% (2000 basis points)
    uint256 public constant INSURANCE_RATE = 2000;
    
    // Minimum bet amount: 1 USDT (6 decimals)
    uint256 public constant MIN_BET_AMOUNT = 1e6;
    
    // Round structure
    struct Round {
        uint256 roundId;
        uint256 startTime;
        uint256 endTime;
        uint256 startPrice;      // BTC price at round start (8 decimals)
        uint256 endPrice;        // BTC price at round end (8 decimals)
        uint256 totalUpBets;     // Total USDT bet on UP
        uint256 totalDownBets;   // Total USDT bet on DOWN
        uint256 totalInsurance;  // Total USDT sent to insurance pool
        bool settled;
        bool cancelled;
        Direction winningDirection;
    }
    
    struct Bet {
        address user;
        uint256 roundId;
        Direction direction;
        uint256 amount;          // USDT amount
        uint256 insuranceAmount; // TFT amount received as insurance
        bool claimed;
        uint256 claimAmount;     // USDT amount claimed
    }
    
    enum Direction { None, Up, Down }
    
    // State
    uint256 public currentRoundId;
    uint256 public currentRoundStartTime;
    uint256 public currentRoundStartPrice;
    
    // Round data
    mapping(uint256 => Round) public rounds;
    
    // User bets: roundId => user => Bet
    mapping(uint256 => mapping(address => Bet)) public bets;
    
    // User prediction count per round
    mapping(uint256 => mapping(address => bool)) public hasBet;
    
    // VIP users (unlimited predictions)
    mapping(address => bool) public vipUsers;
    
    // Non-VIP prediction limit per round
    uint256 public maxPredictionsPerRound = 1;
    
    // User prediction count
    mapping(uint256 => mapping(address => uint256)) public predictionCount;
    
    // Events
    event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 startPrice);
    event BetPlaced(address indexed user, uint256 indexed roundId, Direction direction, uint256 amount, uint256 insuranceAmount);
    event RoundSettled(uint256 indexed roundId, uint256 endPrice, Direction winningDirection);
    event BetClaimed(address indexed user, uint256 indexed roundId, uint256 amount);
    event RoundCancelled(uint256 indexed roundId);
    event OracleUpdated(address newOracle);
    event InsurancePoolUpdated(address newPool);
    event VIPStatusChanged(address indexed user, bool isVIP);
    
    constructor(
        address _usdt,
        address _tft,
        address _insurancePool,
        address _oracle
    ) Ownable(msg.sender) {
        require(_usdt != address(0), "Invalid USDT address");
        require(_tft != address(0), "Invalid TFT address");
        require(_insurancePool != address(0), "Invalid insurance pool");
        require(_oracle != address(0), "Invalid oracle");
        
        usdt = IERC20(_usdt);
        tft = IERC20(_tft);
        insurancePool = _insurancePool;
        oracle = _oracle;
        
        // Start first round
        _startNewRound();
    }
    
    modifier onlyOracle() {
        require(msg.sender == oracle, "Only oracle");
        _;
    }
    
    /**
     * @notice Start a new prediction round
     */
    function _startNewRound() internal {
        currentRoundId++;
        currentRoundStartTime = block.timestamp;
        
        rounds[currentRoundId] = Round({
            roundId: currentRoundId,
            startTime: block.timestamp,
            endTime: block.timestamp + ROUND_DURATION,
            startPrice: 0, // Will be set by oracle
            endPrice: 0,
            totalUpBets: 0,
            totalDownBets: 0,
            totalInsurance: 0,
            settled: false,
            cancelled: false,
            winningDirection: Direction.None
        });
    }
    
    /**
     * @notice Oracle sets the start price for current round
     */
    function setRoundStartPrice(uint256 _price) external onlyOracle {
        require(currentRoundId > 0, "No active round");
        require(rounds[currentRoundId].startPrice == 0, "Price already set");
        
        rounds[currentRoundId].startPrice = _price;
        emit RoundStarted(currentRoundId, currentRoundStartTime, _price);
    }
    
    /**
     * @notice Place a bet on the current round
     */
    function placeBet(Direction _direction, uint256 _amount) external nonReentrant {
        require(_direction != Direction.None, "Invalid direction");
        require(_amount >= MIN_BET_AMOUNT, "Below minimum bet");
        require(currentRoundId > 0, "No active round");
        require(block.timestamp < rounds[currentRoundId].endTime, "Round ended");
        require(rounds[currentRoundId].startPrice > 0, "Round not started");
        
        // Check prediction limit for non-VIP users
        if (!vipUsers[msg.sender]) {
            require(
                predictionCount[currentRoundId][msg.sender] < maxPredictionsPerRound,
                "Prediction limit reached"
            );
        }
        
        // Calculate insurance amount (20% goes to insurance pool)
        uint256 insuranceAmount = (_amount * INSURANCE_RATE) / 10000;
        uint256 betAmount = _amount - insuranceAmount;
        
        // Transfer USDT from user
        usdt.safeTransferFrom(msg.sender, address(this), _amount);
        
        // Record bet
        if (bets[currentRoundId][msg.sender].user == address(0)) {
            bets[currentRoundId][msg.sender] = Bet({
                user: msg.sender,
                roundId: currentRoundId,
                direction: _direction,
                amount: betAmount,
                insuranceAmount: 0,
                claimed: false,
                claimAmount: 0
            });
        } else {
            // Add to existing bet
            bets[currentRoundId][msg.sender].amount += betAmount;
        }
        
        // Update round totals
        if (_direction == Direction.Up) {
            rounds[currentRoundId].totalUpBets += betAmount;
        } else {
            rounds[currentRoundId].totalDownBets += betAmount;
        }
        
        rounds[currentRoundId].totalInsurance += insuranceAmount;
        predictionCount[currentRoundId][msg.sender]++;
        hasBet[currentRoundId][msg.sender] = true;
        
        // Send insurance amount to insurance pool
        if (insuranceAmount > 0) {
            usdt.safeTransfer(insurancePool, insuranceAmount);
            IInsurancePool(insurancePool).notifyDeposit(insuranceAmount);
        }
        
        emit BetPlaced(msg.sender, currentRoundId, _direction, betAmount, insuranceAmount);
    }
    
    /**
     * @notice Oracle settles the round with end price
     */
    function settleRound(uint256 _endPrice) external onlyOracle {
        require(currentRoundId > 0, "No active round");
        require(!rounds[currentRoundId].settled, "Already settled");
        require(block.timestamp >= rounds[currentRoundId].endTime, "Round not ended");
        require(rounds[currentRoundId].startPrice > 0, "No start price");
        
        Round storage round = rounds[currentRoundId];
        round.endPrice = _endPrice;
        round.settled = true;
        
        // Determine winner
        if (_endPrice > round.startPrice) {
            round.winningDirection = Direction.Up;
        } else if (_endPrice < round.startPrice) {
            round.winningDirection = Direction.Down;
        } else {
            // Price unchanged - cancel round, refund all
            round.cancelled = true;
            round.winningDirection = Direction.None;
            emit RoundCancelled(currentRoundId);
        }
        
        emit RoundSettled(currentRoundId, _endPrice, round.winningDirection);
        
        // Start new round
        _startNewRound();
    }
    
    /**
     * @notice Claim winnings for a settled round
     */
    function claimBet(uint256 _roundId) external nonReentrant {
        require(_roundId > 0 && _roundId < currentRoundId, "Invalid round");
        
        Round storage round = rounds[_roundId];
        require(round.settled, "Round not settled");
        require(!round.cancelled, "Round cancelled");
        
        Bet storage bet = bets[_roundId][msg.sender];
        require(bet.user == msg.sender, "No bet found");
        require(!bet.claimed, "Already claimed");
        
        uint256 claimAmount = 0;
        
        if (bet.direction == round.winningDirection) {
            // Winner - calculate payout
            uint256 totalWinningBets = bet.direction == Direction.Up 
                ? round.totalUpBets 
                : round.totalDownBets;
            uint256 totalLosingBets = bet.direction == Direction.Up 
                ? round.totalDownBets 
                : round.totalUpBets;
            
            // Payout = bet amount + (bet amount / total winning) * losing * (1 - fee)
            uint256 profitShare = (bet.amount * totalLosingBets) / totalWinningBets;
            uint256 fee = (profitShare * FEE_RATE) / 10000;
            claimAmount = bet.amount + profitShare - fee;
        } else {
            // Loser - no payout (insurance already received)
            claimAmount = 0;
        }
        
        bet.claimed = true;
        bet.claimAmount = claimAmount;
        
        if (claimAmount > 0) {
            usdt.safeTransfer(msg.sender, claimAmount);
        }
        
        emit BetClaimed(msg.sender, _roundId, claimAmount);
    }
    
    /**
     * @notice Refund for cancelled round
     */
    function claimRefund(uint256 _roundId) external nonReentrant {
        require(_roundId > 0, "Invalid round");
        
        Round storage round = rounds[_roundId];
        require(round.cancelled, "Round not cancelled");
        
        Bet storage bet = bets[_roundId][msg.sender];
        require(bet.user == msg.sender, "No bet found");
        require(!bet.claimed, "Already claimed");
        
        uint256 refundAmount = bet.amount;
        bet.claimed = true;
        bet.claimAmount = refundAmount;
        
        if (refundAmount > 0) {
            usdt.safeTransfer(msg.sender, refundAmount);
        }
        
        emit BetClaimed(msg.sender, _roundId, refundAmount);
    }
    
    /**
     * @notice Update oracle address
     */
    function setOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "Invalid oracle");
        oracle = _oracle;
        emit OracleUpdated(_oracle);
    }
    
    /**
     * @notice Update insurance pool address
     */
    function setInsurancePool(address _pool) external onlyOwner {
        require(_pool != address(0), "Invalid pool");
        insurancePool = _pool;
        emit InsurancePoolUpdated(_pool);
    }
    
    /**
     * @notice Set VIP status for a user
     */
    function setVIP(address _user, bool _isVIP) external onlyOwner {
        vipUsers[_user] = _isVIP;
        emit VIPStatusChanged(_user, _isVIP);
    }
    
    /**
     * @notice Set max predictions per round for non-VIP users
     */
    function setMaxPredictionsPerRound(uint256 _max) external onlyOwner {
        maxPredictionsPerRound = _max;
    }
    
    /**
     * @notice Get current round info
     */
    function getCurrentRound() external view returns (
        uint256 roundId,
        uint256 startTime,
        uint256 endTime,
        uint256 startPrice,
        uint256 totalUpBets,
        uint256 totalDownBets,
        bool settled
    ) {
        Round storage round = rounds[currentRoundId];
        return (
            round.roundId,
            round.startTime,
            round.endTime,
            round.startPrice,
            round.totalUpBets,
            round.totalDownBets,
            round.settled
        );
    }
    
    /**
     * @notice Get user's bet for a round
     */
    function getUserBet(uint256 _roundId, address _user) external view returns (
        Direction direction,
        uint256 amount,
        bool claimed,
        uint256 claimAmount
    ) {
        Bet storage bet = bets[_roundId][_user];
        return (bet.direction, bet.amount, bet.claimed, bet.claimAmount);
    }
    
    /**
     * @notice Get time remaining in current round
     */
    function getTimeRemaining() external view returns (uint256) {
        if (block.timestamp >= rounds[currentRoundId].endTime) {
            return 0;
        }
        return rounds[currentRoundId].endTime - block.timestamp;
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
