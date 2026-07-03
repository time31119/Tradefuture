// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PredictionMarket
 * @dev BTC Price Prediction Market with 5-minute cycles
 * 
 * Rules:
 * - 5-minute prediction cycles
 * - Winners take 80% of the pool
 * - 20% goes to insurance pool (buy TFT)
 * - Insurance payout: 40% of bet amount in TFT
 * - Regular accounts: 1 prediction per cycle
 * - VIP accounts: unlimited predictions
 */

interface IBEP20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IPriceOracle {
    function getLatestPrice() external view returns (uint256);
    function getPriceAt(uint256 timestamp) external view returns (uint256);
}

contract PredictionMarket {
    // Prediction direction
    enum Direction { UP, DOWN }
    
    // Prediction status
    enum PredictionStatus { ACTIVE, RESOLVED, CANCELLED }
    
    // Prediction struct
    struct Prediction {
        uint256 id;
        address user;
        uint256 cycleId;
        Direction direction;
        uint256 amount;
        uint256 entryPrice;
        bool isVIP;
        bool claimed;
        uint256 timestamp;
    }
    
    // Cycle struct
    struct Cycle {
        uint256 id;
        uint256 startTime;
        uint256 endTime;
        uint256 startPrice;
        uint256 endPrice;
        uint256 totalUpAmount;
        uint256 totalDownAmount;
        uint256 insuranceContribution; // 20% of total pool
        PredictionStatus status;
        Direction winner;
    }
    
    // Constants
    uint256 public constant CYCLE_DURATION = 5 minutes;
    uint256 public constant WINNER_SHARE_BPS = 8000; // 80%
    uint256 public constant INSURANCE_SHARE_BPS = 2000; // 20%
    uint256 public constant INSURANCE_PAYOUT_BPS = 4000; // 40% of bet amount
    uint256 public constant MIN_BET_AMOUNT = 10 * 10**6; // 10 USDT (6 decimals)
    
    // State
    uint256 public currentCycleId;
    uint256 public totalPredictions;
    uint256 public totalInsurancePool; // In TFT tokens
    
    // Contracts
    address public owner;
    IBEP20 public usdtToken;
    IBEP20 public tftToken;
    IPriceOracle public priceOracle;
    
    // Mappings
    mapping(uint256 => Cycle) public cycles;
    mapping(uint256 => Prediction[]) public cyclePredictions;
    mapping(address => uint256[]) public userPredictions;
    mapping(address => mapping(uint256 => bool)) public hasPredictedInCycle;
    mapping(address => bool) public isVIP;
    mapping(address => uint256) public insuranceClaims;
    
    // Events
    event PredictionCreated(
        uint256 indexed predictionId,
        address indexed user,
        uint256 indexed cycleId,
        Direction direction,
        uint256 amount,
        uint256 entryPrice
    );
    event CycleStarted(uint256 indexed cycleId, uint256 startTime, uint256 startPrice);
    event CycleEnded(uint256 indexed cycleId, Direction winner, uint256 endPrice);
    event PredictionClaimed(uint256 indexed predictionId, address indexed user, uint256 amount);
    event InsuranceClaimed(address indexed user, uint256 amount);
    event VIPStatusChanged(address indexed user, bool isVIP);
    
    constructor(
        address _usdtToken,
        address _tftToken,
        address _priceOracle
    ) {
        owner = msg.sender;
        usdtToken = IBEP20(_usdtToken);
        tftToken = IBEP20(_tftToken);
        priceOracle = IPriceOracle(_priceOracle);
        
        // Start first cycle
        _startNewCycle();
    }
    
    // ============ Core Functions ============
    
    function predict(Direction direction, uint256 amount) external {
        require(amount >= MIN_BET_AMOUNT, "Below minimum bet");
        require(cycles[currentCycleId].status == PredictionStatus.ACTIVE, "Cycle not active");
        
        // Check if user can predict in this cycle
        if (!isVIP[msg.sender]) {
            require(!hasPredictedInCycle[msg.sender][currentCycleId], "Already predicted");
        }
        
        // Transfer USDT from user
        require(
            usdtToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        
        // Get current BTC price
        uint256 currentPrice = priceOracle.getLatestPrice();
        
        // Create prediction
        uint256 predictionId = totalPredictions++;
        Prediction memory prediction = Prediction({
            id: predictionId,
            user: msg.sender,
            cycleId: currentCycleId,
            direction: direction,
            amount: amount,
            entryPrice: currentPrice,
            isVIP: isVIP[msg.sender],
            claimed: false,
            timestamp: block.timestamp
        });
        
        // Update cycle totals
        if (direction == Direction.UP) {
            cycles[currentCycleId].totalUpAmount += amount;
        } else {
            cycles[currentCycleId].totalDownAmount += amount;
        }
        
        // Store prediction
        cyclePredictions[currentCycleId].push(prediction);
        userPredictions[msg.sender].push(predictionId);
        hasPredictedInCycle[msg.sender][currentCycleId] = true;
        
        emit PredictionCreated(
            predictionId,
            msg.sender,
            currentCycleId,
            direction,
            amount,
            currentPrice
        );
        
        // Check if cycle should end
        _checkCycleEnd();
    }
    
    function _checkCycleEnd() internal {
        Cycle storage cycle = cycles[currentCycleId];
        
        if (block.timestamp >= cycle.endTime) {
            _endCycle();
        }
    }
    
    function _startNewCycle() internal {
        uint256 cycleId = currentCycleId++;
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + CYCLE_DURATION;
        uint256 startPrice = priceOracle.getLatestPrice();
        
        cycles[cycleId] = Cycle({
            id: cycleId,
            startTime: startTime,
            endTime: endTime,
            startPrice: startPrice,
            endPrice: 0,
            totalUpAmount: 0,
            totalDownAmount: 0,
            insuranceContribution: 0,
            status: PredictionStatus.ACTIVE,
            winner: Direction.UP
        });
        
        emit CycleStarted(cycleId, startTime, startPrice);
    }
    
    function _endCycle() internal {
        Cycle storage cycle = cycles[currentCycleId];
        
        // Get end price
        uint256 endPrice = priceOracle.getLatestPrice();
        cycle.endPrice = endPrice;
        
        // Determine winner
        if (endPrice > cycle.startPrice) {
            cycle.winner = Direction.UP;
        } else if (endPrice < cycle.startPrice) {
            cycle.winner = Direction.DOWN;
        } else {
            // Tie - cancel cycle, return all bets
            cycle.status = PredictionStatus.CANCELLED;
            return;
        }
        
        // Calculate insurance contribution (20% of total pool)
        uint256 totalPool = cycle.totalUpAmount + cycle.totalDownAmount;
        cycle.insuranceContribution = totalPool * INSURANCE_SHARE_BPS / 10000;
        totalInsurancePool += cycle.insuranceContribution;
        
        cycle.status = PredictionStatus.RESOLVED;
        
        emit CycleEnded(currentCycleId, cycle.winner, endPrice);
        
        // Start new cycle
        _startNewCycle();
    }
    
    function claimWinnings(uint256 predictionId) external {
        // Find the prediction
        Prediction storage prediction;
        bool found = false;
        
        for (uint256 i = 0; i < cyclePredictions.length; i++) {
            for (uint256 j = 0; j < cyclePredictions[i].length; j++) {
                if (cyclePredictions[i][j].id == predictionId) {
                    prediction = cyclePredictions[i][j];
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
        
        require(found, "Prediction not found");
        require(prediction.user == msg.sender, "Not your prediction");
        require(!prediction.claimed, "Already claimed");
        
        Cycle storage cycle = cycles[prediction.cycleId];
        require(cycle.status == PredictionStatus.RESOLVED, "Cycle not resolved");
        
        if (cycle.status == PredictionStatus.CANCELLED) {
            // Return full amount for cancelled cycles
            prediction.claimed = true;
            require(usdtToken.transfer(msg.sender, prediction.amount), "Transfer failed");
            return;
        }
        
        // Check if user won
        require(prediction.direction == cycle.winner, "Not a winning prediction");
        
        // Calculate winnings (80% of pool, distributed proportionally)
        uint256 totalPool = cycle.totalUpAmount + cycle.totalDownAmount;
        uint256 winnerPool = prediction.direction == Direction.UP 
            ? cycle.totalUpAmount 
            : cycle.totalDownAmount;
        
        uint256 winnerShare = totalPool * WINNER_SHARE_BPS / 10000;
        uint256 userWinnings = winnerShare * prediction.amount / winnerPool;
        
        prediction.claimed = true;
        require(usdtToken.transfer(msg.sender, userWinnings), "Transfer failed");
        
        emit PredictionClaimed(predictionId, msg.sender, userWinnings);
    }
    
    // ============ Insurance Functions ============
    
    function claimInsurance(uint256 amount) external {
        require(amount > 0, "Amount must be positive");
        
        // Calculate TFT payout (40% of bet amount equivalent)
        uint256 tftPayout = amount * INSURANCE_PAYOUT_BPS / 10000;
        
        require(totalInsurancePool >= tftPayout, "Insufficient insurance pool");
        
        totalInsurancePool -= tftPayout;
        insuranceClaims[msg.sender] += tftPayout;
        
        require(tftToken.transfer(msg.sender, tftPayout), "Transfer failed");
        
        emit InsuranceClaimed(msg.sender, tftPayout);
    }
    
    // ============ VIP Functions ============
    
    function setVIP(address user, bool _isVIP) external {
        require(msg.sender == owner, "Only owner");
        isVIP[user] = _isVIP;
        emit VIPStatusChanged(user, _isVIP);
    }
    
    // ============ View Functions ============
    
    function getCurrentCycle() external view returns (
        uint256 id,
        uint256 startTime,
        uint256 endTime,
        uint256 startPrice,
        uint256 totalUpAmount,
        uint256 totalDownAmount,
        PredictionStatus status
    ) {
        Cycle storage cycle = cycles[currentCycleId];
        return (
            cycle.id,
            cycle.startTime,
            cycle.endTime,
            cycle.startPrice,
            cycle.totalUpAmount,
            cycle.totalDownAmount,
            cycle.status
        );
    }
    
    function getCycleInfo(uint256 cycleId) external view returns (
        uint256 startTime,
        uint256 endTime,
        uint256 startPrice,
        uint256 endPrice,
        uint256 totalUpAmount,
        uint256 totalDownAmount,
        uint256 insuranceContribution,
        PredictionStatus status,
        Direction winner
    ) {
        Cycle storage cycle = cycles[cycleId];
        return (
            cycle.startTime,
            cycle.endTime,
            cycle.startPrice,
            cycle.endPrice,
            cycle.totalUpAmount,
            cycle.totalDownAmount,
            cycle.insuranceContribution,
            cycle.status,
            cycle.winner
        );
    }
    
    function getUserPredictions(address user) external view returns (Prediction[] memory) {
        uint256[] memory predictionIds = userPredictions[user];
        Prediction[] memory predictions = new Prediction[](predictionIds.length);
        
        for (uint256 i = 0; i < predictionIds.length; i++) {
            uint256 predId = predictionIds[i];
            // Find prediction in cycles
            for (uint256 j = 0; j < cyclePredictions.length; j++) {
                for (uint256 k = 0; k < cyclePredictions[j].length; k++) {
                    if (cyclePredictions[j][k].id == predId) {
                        predictions[i] = cyclePredictions[j][k];
                        break;
                    }
                }
            }
        }
        
        return predictions;
    }
    
    function getInsurancePool() external view returns (uint256) {
        return totalInsurancePool;
    }
    
    // ============ Admin Functions ============
    
    function setPriceOracle(address _oracle) external {
        require(msg.sender == owner, "Only owner");
        priceOracle = IPriceOracle(_oracle);
    }
    
    function emergencyWithdraw(address token, uint256 amount) external {
        require(msg.sender == owner, "Only owner");
        require(IBEP20(token).transfer(owner, amount), "Transfer failed");
    }
    
    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "Only owner");
        owner = newOwner;
    }
}
