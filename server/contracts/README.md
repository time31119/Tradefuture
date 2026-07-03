# TradeFuture Smart Contracts

BSC (BEP-20) smart contracts for the TradeFuture decentralized BTC prediction market.

## Contract Overview

| Contract | Description |
|----------|-------------|
| `TFTToken.sol` | BEP-20 token with 6% transaction tax distribution and tiered auto-burn |
| `PredictionMarket.sol` | BTC price prediction market with 5-minute cycles |
| `NodePartner.sol` | Node partner system with burn/LP acquisition and dividend distribution |
| `MarketMaker.sol` | Market maker system with subordinate prediction rewards |
| `VIPSystem.sol` | VIP membership with activation fee distribution |
| `PriceOracle.sol` | Price oracle for BTC/USD (for development) |

## Token Economics

### TFT Token
- **Name**: TradeFuture Token
- **Symbol**: TFT
- **Chain**: BSC (BEP-20)
- **Initial Supply**: 11,000,000 tokens
- **Transaction Tax**: 6%

### 6% Tax Distribution
| Recipient | Percentage |
|-----------|------------|
| Node Dividends | 3% |
| Operations Team | 1% |
| Market Makers | 1% |
| Auto-Burn | 1% |

### Tiered Auto-Burn
| Total Supply | Burn Rate |
|--------------|-----------|
| ≥ 5,000,000 | 0.5% per hour |
| 2,000,000 ~ 4,999,999 | 0.05% per hour |
| 50,100 ~ 1,999,999 | 0.005% per hour |
| ≤ 50,000 | Stop burning |

### Team Lock-up
- **Amount**: 1,000,000 tokens
- **Duration**: 50 months
- **Release**: 2% per month

## Deployment

### Prerequisites
- Node.js 18+
- Hardhat
- BSC Testnet/Mainnet RPC URL
- Deployer wallet with BNB

### Installation

```bash
cd server
pnpm add -D hardhat @nomicfoundation/hardhat-toolbox
```

### Configuration

Create `.env` file:
```env
PRIVATE_KEY=your_deployer_private_key
BSC_TESTNET_RPC=https://data-seed-prebsc-1-s1.binance.org:8545/
BSC_MAINNET_RPC=https://bsc-dataseed.binance.org/
BSCSCAN_API_KEY=your_bscscan_api_key
```

### Deploy to Testnet

```bash
npx hardhat run scripts/deploy.ts --network bscTestnet
```

### Deploy to Mainnet

```bash
npx hardhat run scripts/deploy.ts --network bscMainnet
```

### Verify Contracts

```bash
npx hardhat verify --network bscTestnet <DEPLOYED_CONTRACT_ADDRESS>
```

## Contract Addresses (After Deployment)

| Contract | Address |
|----------|---------|
| TFT Token | TBD |
| Prediction Market | TBD |
| Node Partner | TBD |
| Market Maker | TBD |
| VIP System | TBD |
| Price Oracle | TBD |

## Key Features

### Prediction Market
- 5-minute prediction cycles
- BTC price up/down predictions
- 80% winner pool / 20% insurance pool
- Insurance payout: 40% of bet amount in TFT
- Regular accounts: 1 prediction per cycle
- VIP accounts: unlimited predictions

### Node Partner
- Burn 100,000 TFT = 1 node
- Add LP: 50,000 TFT + equivalent USDT = 1 node
- Gift node: Referral rewards ≥ $30,000 = 1 node
- LP lock-up: 50 periods, 2% unlocked every 30 days
- Dividends: 3% of tax + 3% of VIP activation fee

### Market Maker
- Qualification: Refer 10 people with ≥$200 each (total ≥$2,000) OR VIP income ≥$500
- Benefits: 0.3% from subordinate predictions + 1% tax + 1% VIP fee

### VIP System
- Activation fee: 100 USDT
- Immediate return: 20 USDT equivalent TFT
- Direct referral: 50 USDT
- Level rewards: 1 USDT per level (up to 20 levels)
- Fee distribution: 3% node / 1% ops / 1% MM / 5% burn / 20% level / 50% direct / 20% return

## Security Considerations

1. **Multi-sig**: Consider using multi-sig for admin functions
2. **Timelock**: Add timelock for critical parameter changes
3. **Audit**: Get contracts audited before mainnet deployment
4. **Testing**: Extensive testing on testnet before mainnet

## License

MIT
