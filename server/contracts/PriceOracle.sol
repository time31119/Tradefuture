// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PriceOracle
 * @dev Simple price oracle for BTC/USD (for development/testing)
 * In production, use Chainlink or Band Protocol
 */

contract PriceOracle {
    address public owner;
    uint256 public latestPrice;
    uint256 public lastUpdateTime;
    
    // Price update history
    struct PricePoint {
        uint256 price;
        uint256 timestamp;
    }
    
    PricePoint[] public priceHistory;
    
    event PriceUpdated(uint256 price, uint256 timestamp);
    
    constructor(uint256 _initialPrice) {
        owner = msg.sender;
        latestPrice = _initialPrice;
        lastUpdateTime = block.timestamp;
        
        priceHistory.push(PricePoint({
            price: _initialPrice,
            timestamp: block.timestamp
        }));
    }
    
    function getLatestPrice() external view returns (uint256) {
        return latestPrice;
    }
    
    function getPriceAt(uint256 timestamp) external view returns (uint256) {
        // Find closest price point
        if (priceHistory.length == 0) return latestPrice;
        
        for (uint256 i = priceHistory.length - 1; i >= 0; i--) {
            if (priceHistory[i].timestamp <= timestamp) {
                return priceHistory[i].price;
            }
        }
        
        return priceHistory[0].price;
    }
    
    function updatePrice(uint256 _price) external {
        require(msg.sender == owner, "Only owner");
        
        latestPrice = _price;
        lastUpdateTime = block.timestamp;
        
        priceHistory.push(PricePoint({
            price: _price,
            timestamp: block.timestamp
        }));
        
        emit PriceUpdated(_price, block.timestamp);
    }
    
    function getPriceHistory(uint256 count) external view returns (PricePoint[] memory) {
        uint256 length = priceHistory.length;
        if (count > length) count = length;
        
        PricePoint[] memory result = new PricePoint[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = priceHistory[length - 1 - i];
        }
        
        return result;
    }
    
    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "Only owner");
        owner = newOwner;
    }
}
