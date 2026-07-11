import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { initDatabase, getDb, getTokenMetrics, updateTokenMetrics, recordBurnEvent } from "./db";
import { authenticate, generateToken, optionalAuth } from "./auth";
import { validate, schemas } from "./validation";
import { startScheduledCheck, checkAndGrantRoles, getUserMetrics } from "./autoGrant";

// Initialize database
initDatabase();

// Start scheduled role check (every hour)
startScheduledCheck();

const app = express();
app.set('trust proxy', 1);
const port = process.env.PORT || 9091;

// Helper: Generate invite code from wallet address
function generateInviteCode(address: string): string {
  // Use last 8 chars of address + timestamp-based suffix for uniqueness
  const suffix = address.slice(-8).toUpperCase();
  const prefix = 'TF';
  return `${prefix}${suffix}`;
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: { error: 'Too many requests, please try again later' }
});

// Apply rate limiting to all API routes
app.use('/api/', limiter);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/api/v1/health', (req, res) => {
  console.log('Health check success');
  res.status(200).json({ status: 'ok' });
});

// ==================== Auto Grant Role API ====================

// Get user metrics
app.get('/api/v1/user-metrics/:address', (req, res) => {
  const { address } = req.params;
  const metrics = getUserMetrics(address);
  res.json({ success: true, data: metrics });
});

// Manually trigger role check for a user
app.post('/api/v1/user-metrics/:address/check', (req, res) => {
  const { address } = req.params;
  const result = checkAndGrantRoles(address);
  res.json({ success: true, data: result });
});

// Get auto grant stats
app.get('/api/v1/auto-grant/stats', (req, res) => {
  const db = getDb();
  
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM user_metrics').get() as any;
  const marketMakers = db.prepare('SELECT COUNT(*) as count FROM user_metrics WHERE is_market_maker = 1').get() as any;
  const nodePartners = db.prepare('SELECT COUNT(*) as count FROM user_metrics WHERE node_count > 0').get() as any;
  const recentGrants = db.prepare('SELECT * FROM role_grant_logs ORDER BY granted_at DESC LIMIT 10').all();
  
  res.json({
    success: true,
    data: {
      totalUsers: totalUsers.count,
      marketMakers: marketMakers.count,
      nodePartners: nodePartners.count,
      recentGrants,
    },
  });
});

// Get role grant logs
app.get('/api/v1/role-grant-logs', (req, res) => {
  const { role_type, limit: limitParam } = req.query;
  const limit = parseInt(limitParam as string) || 50;
  
  const db = getDb();
  let query = 'SELECT * FROM role_grant_logs';
  const params: any[] = [];
  
  if (role_type) {
    query += ' WHERE role_type = ?';
    params.push(role_type);
  }
  
  query += ' ORDER BY granted_at DESC LIMIT ?';
  params.push(limit);
  
  const logs = db.prepare(query).all(...params);
  res.json({ success: true, data: logs });
});

// ==================== TFT Pool (Real-Time Price) ====================

// TFT/USDT 流动性池 - 内存存储
let tftPool = {
  tftReserve: 0,
  usdtReserve: 0,
  totalLp: 0,
};

// 获取 TFT 实时价格（基于池子比例）
function getTftPrice(): number {
  if (tftPool.tftReserve > 0 && tftPool.usdtReserve > 0) {
    return tftPool.usdtReserve / tftPool.tftReserve;
  }
  // 池子为空时返回初始价格
  return 0.01;
}

// 添加流动性
function addLiquidity(tftAmount: number, usdtAmount: number): number {
  let lpMinted = 0;
  
  if (tftPool.totalLp === 0) {
    // 首次添加流动性
    lpMinted = Math.sqrt(tftAmount * usdtAmount);
  } else {
    // 后续添加流动性 - 按比例计算
    const tftRatio = tftAmount / tftPool.tftReserve;
    const usdtRatio = usdtAmount / tftPool.usdtReserve;
    const ratio = Math.min(tftRatio, usdtRatio);
    lpMinted = tftPool.totalLp * ratio;
  }
  
  tftPool.tftReserve += tftAmount;
  tftPool.usdtReserve += usdtAmount;
  tftPool.totalLp += lpMinted;
  
  return lpMinted;
}

// 移除流动性
function removeLiquidity(lpAmount: number): { tftReturned: number; usdtReturned: number } {
  if (lpAmount <= 0 || lpAmount > tftPool.totalLp) {
    return { tftReturned: 0, usdtReturned: 0 };
  }
  
  const share = lpAmount / tftPool.totalLp;
  const tftReturned = tftPool.tftReserve * share;
  const usdtReturned = tftPool.usdtReserve * share;
  
  tftPool.tftReserve -= tftReturned;
  tftPool.usdtReserve -= usdtReturned;
  tftPool.totalLp -= lpAmount;
  
  return { tftReturned, usdtReturned };
}

console.log('[TFT Pool] Initialized with empty pool, default price: $0.01');

// ==================== BTC Price API (Real-Time) ====================

// 实时价格缓存
let cachedPrice: { data: any; timestamp: number } | null = null;
const PRICE_CACHE_MS = 10_000;  // 价格缓存 10 秒
const KLINE_CACHE_MS = 15_000; // K线缓存 15 秒
let cachedKlines: Record<string, { data: any; timestamp: number }> = {};

// 后台价格轮询器 - 每 10 秒更新一次缓存
let backgroundPrice: any = null;
let backgroundPriceTs = 0;
async function backgroundPriceFetcher() {
  try {
    // Primary: Alternative.me (works in this environment)
    const resp = await fetch('https://api.alternative.me/v2/ticker/bitcoin/', {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) throw new Error(`Alternative.me error: ${resp.status}`);
    const json = await resp.json() as any;
    const btc = json?.data?.['1'];
    if (btc?.quotes?.USD?.price) {
      backgroundPrice = {
        price: btc.quotes.USD.price,
        change24h: btc.quotes.USD.percent_change_24h || 0,
        high24h: btc.quotes.USD.price * 1.02, // estimate
        low24h: btc.quotes.USD.price * 0.98,  // estimate
        volume24h: btc.quotes.USD.volume_24h || 0,
        open24h: btc.quotes.USD.price / (1 + (btc.quotes.USD.percent_change_24h || 0) / 100),
      };
      backgroundPriceTs = Date.now();
      return;
    }
    throw new Error('No price data');
  } catch (err) {
    // Keep using cached data silently
  }
}
// 启动后台轮询
backgroundPriceFetcher();
setInterval(backgroundPriceFetcher, 10_000);
console.log('[BTC] Background price fetcher started (Alternative.me, 10s interval)');

// 获取真实 BTC 价格（优先使用后台缓存）
async function fetchRealBTCPrice() {
  // 优先使用后台轮询的最新数据
  if (backgroundPrice && Date.now() - backgroundPriceTs < PRICE_CACHE_MS) {
    return backgroundPrice;
  }
  // 兜底：直接请求 Alternative.me
  try {
    const resp = await fetch('https://api.alternative.me/v2/ticker/bitcoin/', {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) throw new Error(`Alternative.me error: ${resp.status}`);
    const json = await resp.json() as any;
    const btc = json?.data?.['1'];
    if (btc?.quotes?.USD?.price) {
      const data = {
        price: btc.quotes.USD.price,
        change24h: btc.quotes.USD.percent_change_24h || 0,
        high24h: btc.quotes.USD.price * 1.02,
        low24h: btc.quotes.USD.price * 0.98,
        volume24h: btc.quotes.USD.volume_24h || 0,
        open24h: btc.quotes.USD.price / (1 + (btc.quotes.USD.percent_change_24h || 0) / 100),
      };
      backgroundPrice = data;
      backgroundPriceTs = Date.now();
      return data;
    }
    throw new Error('No price data');
  } catch (err) {
    if (backgroundPrice) return backgroundPrice;
    if (cachedPrice) return cachedPrice.data;
    return null;
  }
}

// 获取 K 线数据（锚定真实价格，生成模拟走势）
async function fetchRealKlineData(interval: string = '5m', limit: number = 288) {
  const cacheKey = `${interval}_${limit}`;
  const cached = cachedKlines[cacheKey];
  if (cached && Date.now() - cached.timestamp < KLINE_CACHE_MS) {
    return cached.data;
  }

  const currentPrice = backgroundPrice?.price || 65000;
  const intervalMs: Record<string, number> = {
    '1m': 60000, '5m': 300000, '15m': 900000,
    '1h': 3600000, '4h': 14400000, '1d': 86400000,
  };
  const ms = intervalMs[interval] || 300000;
  const now = Date.now();

  // Volatility based on interval
  const volatilityMap: Record<string, number> = {
    '1m': 0.0003, '5m': 0.0008, '15m': 0.0015,
    '1h': 0.003, '4h': 0.006, '1d': 0.015,
  };
  const vol = volatilityMap[interval] || 0.001;

  // Generate from oldest to newest, ending at current real price
  const data: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  let price = currentPrice * (1 - (Math.random() - 0.5) * vol * limit * 0.3);

  for (let i = limit - 1; i >= 0; i--) {
    const timestamp = now - i * ms;
    const open = price;
    const change = (Math.random() - 0.48) * vol * open;
    let close = open + change;
    if (i === 0) close = currentPrice; // last candle ends at real price
    const high = Math.max(open, close) + Math.random() * vol * open * 0.5;
    const low = Math.min(open, close) - Math.random() * vol * open * 0.5;
    const volume = Math.random() * 50 + 5;

    data.push({
      timestamp,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.round(volume * 100) / 100,
    });
    price = close;
  }

  cachedKlines[cacheKey] = { data, timestamp: Date.now() };
  return data;
}

// GET /api/v1/btc/price - 真实 BTC 价格（Binance 实时）
app.get('/api/v1/btc/price', async (req, res) => {
  const priceData = await fetchRealBTCPrice();
  if (!priceData) {
    return res.status(503).json({ success: false, error: 'Unable to fetch BTC price' });
  }
  res.json({ success: true, data: priceData, timestamp: Date.now(), source: 'realtime' });
});

// GET /api/v1/btc/kline - 真实 K 线数据（Binance）
// interval: 1m, 5m, 15m, 1h, 4h, 1d
// limit: 最大 1000
app.get('/api/v1/btc/kline', async (req, res) => {
  const interval = (req.query.interval as string) || '5m';
  const limit = Math.min(parseInt(req.query.limit as string) || 288, 1000);
  const klineData = await fetchRealKlineData(interval, limit);
  if (!klineData.length) {
    return res.status(503).json({ success: false, error: 'Unable to fetch kline data' });
  }
  res.json({ success: true, data: klineData, interval, source: 'realtime' });
});

// ==================== Dashboard API ====================

// GET /api/v1/dashboard/overview - Dashboard overview data
app.get('/api/v1/dashboard/overview', (req, res) => {
  const walletConnected = req.query.wallet === 'true';

  res.json({
    success: true,
    data: {
      accountValue: walletConnected ? 12345.67 : null,
      pnl24h: walletConnected ? 230.50 : null,
      activePositions: walletConnected ? 3 : null,
      volume24h: 45600,
      insurancePoolBalance: 125678,
      insurancePoolInjection: 234,
    },
  });
});

// ==================== Prediction API ====================

// In-memory prediction store
const predictions: any[] = [
  { id: 1, time: '09:05', direction: 'up', amount: 50, status: 'won', profit: 82.50, round: 1284 },
  { id: 2, time: '09:00', direction: 'down', amount: 30, status: 'pending', profit: 0, round: 1285 },
  { id: 3, time: '08:55', direction: 'up', amount: 100, status: 'lost', profit: -100, round: 1283 },
  { id: 4, time: '08:50', direction: 'up', amount: 75, status: 'claimed', profit: 123.75, round: 1282 },
  { id: 5, time: '08:45', direction: 'down', amount: 200, status: 'won', profit: 340.00, round: 1281 },
  { id: 6, time: '08:40', direction: 'up', amount: 50, status: 'lost', profit: -50, round: 1280 },
  { id: 7, time: '08:35', direction: 'down', amount: 150, status: 'claimed', profit: 255.00, round: 1279 },
  { id: 8, time: '08:30', direction: 'up', amount: 80, status: 'won', profit: 132.00, round: 1278 },
];

// GET /api/v1/predictions - Get user predictions
app.get('/api/v1/predictions', (req, res) => {
  const status = req.query.status as string;
  let filtered = [...predictions];

  if (status && status !== 'all') {
    filtered = filtered.filter(p => p.status === status);
  }

  res.json({
    success: true,
    data: {
      predictions: filtered,
      currentRound: 1285,
      timeLeftSeconds: 222,
      oddsUp: 1.8,
      oddsDown: 2.2,
      participationCount: 1,
      maxParticipation: 1,
      isVIP: false,
      insurancePoolBalance: 125678,
      roundInsuranceAmount: 234,
      usdtBalance: 1000,
    },
  });
});

// POST /api/v1/predictions - Create a new prediction
app.post('/api/v1/predictions', (req, res) => {
  const { direction, amount } = req.body;

  if (!direction || !amount || amount < 1) {
    return res.status(400).json({ success: false, error: 'Invalid parameters' });
  }

  const newPrediction = {
    id: predictions.length + 1,
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    direction,
    amount: parseFloat(amount),
    status: 'pending',
    profit: 0,
    round: 1285,
  };

  predictions.unshift(newPrediction);

  res.json({
    success: true,
    data: newPrediction,
  });
});

// POST /api/v1/predictions/:id/claim - Claim prediction reward
app.post('/api/v1/predictions/:id/claim', (req, res) => {
  const id = parseInt(req.params.id);
  const prediction = predictions.find(p => p.id === id);

  if (!prediction) {
    return res.status(404).json({ success: false, error: 'Prediction not found' });
  }

  if (prediction.status !== 'won') {
    return res.status(400).json({ success: false, error: 'Cannot claim this prediction' });
  }

  prediction.status = 'claimed';

  res.json({
    success: true,
    data: prediction,
  });
});

// ==================== Node API ====================

// GET /api/v1/node/overview - Node partner overview
app.get('/api/v1/node/overview', async (req, res) => {
  // 获取实时TFT价格（来自流动性池）
  const tftPrice = await getTftPrice();

  res.json({
    success: true,
    data: {
      activeNodes: 3,
      maxNodes: 5,
      pendingRewardsUSDT: 234.50,
      pendingRewardsTFT: 56.78,
      totalClaimedRewards: 1890.25,
      lpLocked: 50000,
      lpWithdrawable: 0,
      lpUnlockProgress: { current: 12, total: 50 },
      nextUnlockAmount: 1000,
      nextUnlockDays: 3,
      // 节点获取规则
      burnNodePrice: 100000, // 销毁100000 TFT获得1个节点
      lpNodePrice: 100000, // 添加100000 TFT（自动兑换一半为USDT）获得1个节点
      tftPrice: parseFloat(tftPrice.toFixed(6)), // 当前TFT价格 (USDT) - 动态价格
      lpUnlockPeriods: 50, // LP分50期解锁
      lpUnlockInterval: 30, // 每30天解锁一次
      lpUnlockPercentPerPeriod: 2, // 每次解锁2%
      // 参与状态
      hasBurned: false, // 是否已参与销毁TFT获取节点
      hasAddedLP: false, // 是否已参与添加LP获取节点
      rewards: [
        { id: 1, date: '2026-07-03', amount: 45.20, currency: 'USDT', type: 'node' },
        { id: 2, date: '2026-07-02', amount: 12.50, currency: 'TFT', type: 'lp' },
        { id: 3, date: '2026-07-01', amount: 38.90, currency: 'USDT', type: 'node' },
        { id: 4, date: '2026-06-30', amount: 8.30, currency: 'TFT', type: 'lp' },
        { id: 5, date: '2026-06-29', amount: 52.10, currency: 'USDT', type: 'node' },
      ],
    },
  });
});

// POST /api/v1/node/claim - Claim node rewards
app.post('/api/v1/node/claim', (req, res) => {
  res.json({
    success: true,
    data: {
      claimedUSDT: 234.50,
      claimedTFT: 56.78,
      txHash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
    },
  });
});

// POST /api/v1/node/acquire - Acquire node
app.post('/api/v1/node/acquire', async (req, res) => {
  const { method, tftAmount } = req.body;

  if (!method || !tftAmount) {
    return res.status(400).json({ success: false, error: 'Invalid parameters' });
  }

  // 节点获取规则
  const BURN_NODE_PRICE = 100000; // 销毁100000 TFT获得1个节点

  if (method === 'burn') {
    // 销毁TFT获取节点
    if (tftAmount < BURN_NODE_PRICE) {
      return res.status(400).json({ 
        success: false, 
        error: `销毁数量不足，至少需要 ${BURN_NODE_PRICE} TFT` 
      });
    }
    const nodesAcquired = Math.floor(tftAmount / BURN_NODE_PRICE);
    res.json({
      success: true,
      data: {
        nodesAcquired,
        method: 'burn',
        tftAmount,
        burnAddress: '0x0000000000000000000000000000000000000000',
        message: 'TFT已销毁，转入黑洞地址',
        txHash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
      },
    });
  } else if (method === 'lp') {
    // 添加LP获取节点：用户只需提供TFT，系统自动兑换一半为USDT
    // 流程：输入100K TFT → 50K兑换USDT → 50K TFT + USDT添加LP
    const LP_NODE_TFT_TOTAL = 100000; // 总共需要100K TFT（一半兑换USDT，一半添加LP）
    
    if (tftAmount < LP_NODE_TFT_TOTAL) {
      return res.status(400).json({ 
        success: false, 
        error: `TFT数量不足，至少需要 ${LP_NODE_TFT_TOTAL} TFT（自动兑换一半为USDT）` 
      });
    }
    
    // 获取实时TFT价格
    const btcPrice = await fetchRealBTCPrice();
    const tftPrice = btcPrice / 6500000; // BTC $65000 = TFT $0.01
    
    // 计算兑换逻辑
    const halfTft = Math.floor(tftAmount / 2); // 一半用于兑换USDT
    const lpTftAmount = tftAmount - halfTft; // 另一半用于添加LP
    const usdtFromSwap = halfTft * tftPrice; // 兑换得到的USDT
    
    const nodesAcquired = Math.floor(tftAmount / LP_NODE_TFT_TOTAL);
    
    res.json({
      success: true,
      data: {
        nodesAcquired,
        method: 'lp',
        // 输入
        tftAmount,
        // 自动兑换明细
        swapTftAmount: halfTft, // 用于兑换的TFT
        usdtFromSwap: parseFloat(usdtFromSwap.toFixed(2)), // 兑换得到的USDT
        tftPrice: parseFloat(tftPrice.toFixed(6)), // TFT当前价格
        // LP添加明细
        lpTftAmount, // 添加LP的TFT
        lpUsdtAmount: parseFloat(usdtFromSwap.toFixed(2)), // 添加LP的USDT
        lpTotal: parseFloat((lpTftAmount + usdtFromSwap).toFixed(2)), // LP总价值
        // 锁仓信息
        lpLocked: lpTftAmount, // 锁仓的LP数量（以TFT计）
        unlockPeriods: 50,
        unlockInterval: 30, // 天
        unlockPercentPerPeriod: 2,
        message: `${halfTft} TFT 已兑换为 ${usdtFromSwap.toFixed(2)} USDT，与剩余 ${lpTftAmount} TFT 一起添加LP`,
        txHash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
      },
    });
  } else {
    return res.status(400).json({ success: false, error: 'Invalid method' });
  }
});

// POST /api/v1/node/withdraw-lp - Withdraw LP from node
app.post('/api/v1/node/withdraw-lp', (req, res) => {
  const { lpAmount } = req.body;

  if (!lpAmount || parseFloat(lpAmount) <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid LP amount' });
  }

  res.json({
    success: true,
    data: {
      lpWithdrawn: parseFloat(lpAmount),
      tftReturned: parseFloat(lpAmount) * 0.5,
      usdtReturned: parseFloat(lpAmount) * 0.5,
      txHash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
    },
  });
});

// ==================== Swap API ====================

// GET /api/v1/swap/balances - Get user balances
app.get('/api/v1/swap/balances', (req, res) => {
  res.json({
    success: true,
    data: {
      tftBalance: 12345.67,
      usdtBalance: 8765.43,
      lpBalance: 1234.56,
      tftPrice: 0.50,
      totalLP: 274560,
      poolTFT: 549120,
      poolUSDT: 274560,
    },
  });
});

// GET /api/v1/swap/quote - Get swap quote
app.get('/api/v1/swap/quote', (req, res) => {
  const { fromToken, toToken, amount } = req.query;
  const amountNum = parseFloat(amount as string) || 0;
  const rate = fromToken === 'TFT' ? 0.50 : 2.00;
  const outputAmount = amountNum * rate * (1 - 0.005); // 0.5% fee

  res.json({
    success: true,
    data: {
      inputAmount: amountNum,
      outputAmount: Math.round(outputAmount * 100) / 100,
      rate,
      slippage: 0.5,
      fee: 0.5,
    },
  });
});

// POST /api/v1/swap/execute - Execute swap
app.post('/api/v1/swap/execute', validate(schemas.swapExecute), (req, res) => {
  const { fromToken, toToken, amount } = req.body;

  res.json({
    success: true,
    data: {
      txHash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
      fromToken,
      toToken,
      amount,
    },
  });
});

// POST /api/v1/swap/add-liquidity - Add liquidity
app.post('/api/v1/swap/add-liquidity', (req, res) => {
  const { tftAmount, usdtAmount } = req.body;

  res.json({
    success: true,
    data: {
      lpReceived: (parseFloat(tftAmount || 0) + parseFloat(usdtAmount || 0)) / 2,
      txHash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
    },
  });
});

// POST /api/v1/swap/remove-liquidity - Remove liquidity
app.post('/api/v1/swap/remove-liquidity', (req, res) => {
  const { lpAmount } = req.body;

  res.json({
    success: true,
    data: {
      tftReturned: parseFloat(lpAmount || 0) * 0.5,
      usdtReturned: parseFloat(lpAmount || 0) * 0.25,
      txHash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
    },
  });
});

// ==================== Profile API ====================

// GET /api/v1/profile - Get user profile
app.get('/api/v1/profile', (req, res) => {
  const fullAddress = '0x7a3B4C5D6E7F8A9B0C1D2E3F4A5B6C7D8E9f3e8';
  const inviteCode = generateInviteCode(fullAddress);
  res.json({
    success: true,
    data: {
      address: '0x7a3B...f3e8',
      fullAddress,
      isVIP: true,
      vipExpiry: '2027-01-15',
      vipDaysLeft: 364,
      accountValue: 18234.50,
      inviter: '0x3e...d1a2',
      inviteCode,
      totalReferralReward: 1234.50,
      pendingReferralReward: 56.78,
      directReward: 850.00,
      levelReward: 384.50,
      claimedReward: 1177.72,
      rewardHistory: [
        { id: 1, type: 'direct', amount: 50.00, from: '0x3e...d1a2', date: '2026-06-15' },
        { id: 2, type: 'level', amount: 1.00, from: '0x8f...a2b3', date: '2026-06-14', level: 2 },
        { id: 3, type: 'direct', amount: 50.00, from: '0x9d...c6a7', date: '2026-06-13' },
        { id: 4, type: 'level', amount: 3.00, from: '0x5b...d8e9', date: '2026-06-12', level: 2 },
        { id: 5, type: 'direct', amount: 50.00, from: '0xa2...f3b1', date: '2026-06-10' },
        { id: 6, type: 'level', amount: 2.00, from: '0x74...c9d2', date: '2026-06-09', level: 3 },
        { id: 7, type: 'direct', amount: 50.00, from: '0xe1...b5a8', date: '2026-06-08' },
        { id: 8, type: 'level', amount: 1.00, from: '0x6c...d7f4', date: '2026-06-07', level: 2 },
      ],
      directReferrals: 23,
      teamVolume: 45678.90,
      teamMembers: [
        { id: 1, address: '0x3e...d1a2', level: 1, volume: 5600, contribution: 56.00, isDirect: true, joinDate: '2026-05-12' },
        { id: 2, address: '0x8f...a2b3', level: 2, volume: 3200, contribution: 25.60, isDirect: false, joinDate: '2026-05-15' },
        { id: 3, address: '0x1c...e4f5', level: 1, volume: 8900, contribution: 89.00, isDirect: true, joinDate: '2026-05-18' },
        { id: 4, address: '0x9d...c6a7', level: 3, volume: 12000, contribution: 96.00, isDirect: true, joinDate: '2026-05-20' },
        { id: 5, address: '0x5b...d8e9', level: 2, volume: 4500, contribution: 36.00, isDirect: false, joinDate: '2026-05-22' },
        { id: 6, address: '0xa2...f3b1', level: 1, volume: 7200, contribution: 72.00, isDirect: true, joinDate: '2026-05-25' },
        { id: 7, address: '0x74...c9d2', level: 2, volume: 2800, contribution: 22.40, isDirect: false, joinDate: '2026-05-28' },
        { id: 8, address: '0xe1...b5a8', level: 1, volume: 6100, contribution: 61.00, isDirect: true, joinDate: '2026-06-01' },
        { id: 9, address: '0x6c...d7f4', level: 3, volume: 15000, contribution: 120.00, isDirect: true, joinDate: '2026-06-03' },
        { id: 10, address: '0x28...e2c6', level: 2, volume: 3800, contribution: 30.40, isDirect: false, joinDate: '2026-06-05' },
        { id: 11, address: '0xf3...a8b5', level: 1, volume: 9500, contribution: 95.00, isDirect: true, joinDate: '2026-06-08' },
        { id: 12, address: '0x4a...c1e7', level: 2, volume: 4100, contribution: 32.80, isDirect: false, joinDate: '2026-06-10' },
        { id: 13, address: '0xd5...f9a3', level: 1, volume: 2300, contribution: 23.00, isDirect: true, joinDate: '2026-06-12' },
        { id: 14, address: '0x91...b4d8', level: 4, volume: 18500, contribution: 148.00, isDirect: true, joinDate: '2026-06-15' },
        { id: 15, address: '0x67...e6c2', level: 3, volume: 11200, contribution: 89.60, isDirect: false, joinDate: '2026-06-18' },
      ],
    },
  });
});

// POST /api/v1/profile/activate-vip - Activate VIP
app.post('/api/v1/profile/activate-vip', (req, res) => {
  const { inviterCode } = req.body;

  res.json({
    success: true,
    data: {
      isVIP: true,
      vipExpiry: '2027-07-03',
      vipDaysLeft: 365,
      txHash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
    },
  });
});

// POST /api/v1/profile/bind-inviter - Bind inviter
app.post('/api/v1/profile/bind-inviter', (req, res) => {
  const { inviterCode } = req.body;

  if (!inviterCode) {
    return res.status(400).json({ success: false, error: 'Inviter code is required' });
  }

  res.json({
    success: true,
    data: {
      inviter: '0x3e...d1a2',
      bound: true,
    },
  });
});

// POST /api/v1/profile/claim-referral - Claim referral rewards
app.post('/api/v1/profile/claim-referral', (req, res) => {
  res.json({
    success: true,
    data: {
      claimed: 56.78,
      txHash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
    },
  });
});

// ==================== Wallet API ====================

// POST /api/v1/wallet/connect - Connect wallet with signature verification
app.post('/api/v1/wallet/connect', (req, res) => {
  const { address, signature, message } = req.body;
  
  // In production, verify the signature here
  // For now, we'll generate a deterministic address if not provided
  const walletAddress = address || '0x7a3B4C5D6E7F8A9B0C1D2E3F4A5B6C7D8E9f3e8';
  
  // Get or create user in database
  const db = getDb();
  let user = db.prepare('SELECT * FROM users WHERE address = ?').get(walletAddress) as { id: number; address: string } | undefined;
  
  if (!user) {
    // Create new user
    db.prepare('INSERT INTO users (address) VALUES (?)').run(walletAddress);
    user = db.prepare('SELECT * FROM users WHERE address = ?').get(walletAddress) as { id: number; address: string };
  }
  
  // Generate JWT token
  const token = generateToken(walletAddress, user.id);
  
  res.json({
    success: true,
    data: {
      address: walletAddress,
      shortAddress: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
      chainId: 56,
      chainName: 'BSC Mainnet',
      tftBalance: 12345.67,
      usdtBalance: 8765.43,
      bnbBalance: 1.234,
      token: token,
    },
  });
});

// ==================== Token Economics API ====================

// GET /api/v1/token/info - Token information (real-time data from database)
app.get('/api/v1/token/info', (req, res) => {
  // Get real-time token metrics from database
  const metrics = getTokenMetrics();
  
  // Calculate current supply from initial - burned
  const initialSupply = metrics?.initial_supply || 11000000;
  const totalBurned = metrics?.total_burned || 0;
  const currentSupply = initialSupply - totalBurned;
  
  res.json({
    success: true,
    data: {
      name: 'TradeFuture Token',
      symbol: 'TFT',
      chain: 'BSC (BEP-20)',
      initialSupply: initialSupply,
      currentSupply: currentSupply, // Real-time: initial - burned
      totalBurned: totalBurned, // Real-time from database
      taxRate: 0.06, // 6% transaction tax
      taxDistribution: {
        nodeDividends: 0.03, // 3%
        operations: 0.01, // 1%
        marketMakers: 0.01, // 1%
        autoBurn: 0.01, // 1%
      },
      burnMechanism: {
        tier1: { threshold: 5000000, rate: 0.5, description: '≥ 5,000,000: 0.5%/小时' },
        tier2: { threshold: 2000000, rate: 0.05, description: '2,000,000 ~ 4,999,999: 0.05%/小时' },
        tier3: { threshold: 50100, rate: 0.005, description: '50,100 ~ 1,999,999: 0.005%/小时' },
        stopThreshold: 50000, // 销毁至50,000枚停止
      },
      teamLock: {
        amount: 1000000,
        duration: 50, // months
        releasePerMonth: 2, // 2% per month
        released: 200000,
        locked: 800000,
      },
      tftPrice: 0.01, // USDT
      lastUpdated: metrics?.last_updated_at || new Date().toISOString(),
    },
  });
});

// GET /api/v1/token/burn-info - Burn mechanism info (real-time data)
app.get('/api/v1/token/burn-info', (req, res) => {
  // Get real-time token metrics from database
  const metrics = getTokenMetrics();
  const initialSupply = metrics?.initial_supply || 11000000;
  const totalBurned = metrics?.total_burned || 0;
  const currentSupply = initialSupply - totalBurned;
  
  let currentTier = 1;
  let burnRate = 0;
  
  if (currentSupply >= 5000000) {
    currentTier = 1;
    burnRate = 0.5;
  } else if (currentSupply >= 2000000) {
    currentTier = 2;
    burnRate = 0.05;
  } else if (currentSupply >= 50100) {
    currentTier = 3;
    burnRate = 0.005;
  }
  
  res.json({
    success: true,
    data: {
      currentSupply,
      currentTier,
      burnRate,
      burnPerHour: currentSupply * burnRate / 100,
      burnPerDay: currentSupply * burnRate / 100 * 24,
      totalBurned: 150000,
      targetSupply: 50000,
      nextBurnTime: Date.now() + 3600000, // 1 hour from now
    },
  });
});

// POST /api/v1/token/record-burn - Record a burn event (updates real-time metrics)
app.post('/api/v1/token/record-burn', (req, res) => {
  const { txHash, amount, blockNumber } = req.body;
  
  if (!txHash || !amount || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid burn data' });
  }
  
  // Record the burn event and update metrics
  recordBurnEvent(txHash, amount, blockNumber);
  
  // Get updated metrics
  const metrics = getTokenMetrics();
  
  res.json({
    success: true,
    data: {
      txHash,
      amount,
      newTotalBurned: metrics.total_burned,
      newCurrentSupply: metrics.current_supply,
    },
  });
});

// GET /api/v1/token/burn-history - Get burn history
app.get('/api/v1/token/burn-history', (req, res) => {
  const database = getDb();
  const records = database.prepare(`
    SELECT * FROM burn_records 
    ORDER BY timestamp DESC 
    LIMIT 50
  `).all();
  
  res.json({
    success: true,
    data: records,
  });
});

// GET /api/v1/token/tax-distribution - Tax distribution info
app.get('/api/v1/token/tax-distribution', (req, res) => {
  res.json({
    success: true,
    data: {
      totalTaxRate: 6,
      distribution: [
        { recipient: '节点分红', percentage: 3, description: '按节点权重分配' },
        { recipient: '运营团队', percentage: 1, description: '运营管理费用' },
        { recipient: '做市商分红', percentage: 1, description: '平均分配给做市商' },
        { recipient: '自动销毁', percentage: 1, description: '购买TFT并发送至黑洞地址' },
      ],
      lastDistribution: {
        timestamp: Date.now() - 3600000,
        nodeDividends: 450,
        operations: 150,
        marketMakers: 150,
        autoBurn: 150,
      },
    },
  });
});

// ==================== VIP Economics API ====================

// GET /api/v1/vip/info - VIP system info
app.get('/api/v1/vip/info', (req, res) => {
  res.json({
    success: true,
    data: {
      activationFee: 100, // USDT
      immediateReturn: 20, // USDT equivalent TFT
      feeDistribution: {
        nodeDividends: 3, // 3%
        operations: 1, // 1%
        marketMakers: 1, // 1%
        autoBurn: 5, // 5%
        levelRewards: 20, // 20% - 见点奖励
        directReferral: 50, // 50% - 直推奖励
        activatorReturn: 20, // 20% - 返还激活者
      },
      benefits: {
        predictionLimit: 'unlimited', // VIP可无限次预测
        insurancePayout: 40, // 保险仓赔付比例
      },
      levelRewards: {
        maxLevels: 20,
        rewardPerLevel: 1, // USDT per level
        totalPotential: 20, // USDT total
      },
    },
  });
});

// GET /api/v1/vip/status - Check VIP status
app.get('/api/v1/vip/status', (req, res) => {
  // TODO: Integrate with smart contract
  res.json({
    success: true,
    data: {
      isVIP: false,
      activationFee: 100,
      currency: 'USDT',
    },
  });
});

// POST /api/v1/vip/activate - Activate VIP
app.post('/api/v1/vip/activate', (req, res) => {
  const { referrer } = req.body;
  // TODO: Integrate with smart contract
  res.json({
    success: true,
    message: 'VIP activation transaction submitted',
    data: {
      txHash: '0x' + '0'.repeat(64),
      isVIP: true,
    },
  });
});

// ==================== Node Economics API ====================

// GET /api/v1/node/economics - Node economics info
app.get('/api/v1/node/economics', (req, res) => {
  res.json({
    success: true,
    data: {
      // Direct properties for frontend compatibility
      burnCost: 100000,
      nodesPerBurn: 1,
      lpCost: 50000,
      nodesPerLp: 1,
      giftThreshold: 30000,
      nodesPerGift: 1,
      // LP Lockup Rules
      lpLockupRules: {
        periods: 50,
        unlockIntervalDays: 30,
        unlockPerPeriod: 0.02, // 2%
        totalLocked: 50000,
        nextUnlock: {
          amount: 1000,
          daysUntil: 3,
        },
      },
      // Benefits
      benefits: {
        taxDividend: 0.03, // 3% of transaction tax
        vipActivationDividend: 0.03, // 3% of VIP activation fee
        predictionLimit: 'unlimited',
        insurancePayout: 40,
      },
      // Legacy structure for reference
      acquisitionMethods: [
        {
          method: 'burn',
          description: '销毁TFT获取节点',
          rules: [
            { amount: 100000, nodes: 1, description: '销毁100,000 TFT = 1个节点' },
            { amount: 200000, nodes: 2, description: '销毁200,000 TFT = 2个节点' },
          ],
        },
        {
          method: 'lp',
          description: '添加流动性获取节点',
          rules: [
            { tft: 50000, nodes: 1, description: '50,000 TFT + 等值USDT = 1个节点' },
            { tft: 100000, nodes: 2, description: '100,000 TFT + 等值USDT = 2个节点' },
          ],
        },
        {
          method: 'gift',
          description: '推荐奖励赠送节点',
          rules: [
            { threshold: 30000, nodes: 1, description: '推荐奖励达到30,000 USDT = 1个节点' },
          ],
        },
      ],
      lpLockup: {
        totalPeriods: 50,
        unlockInterval: 30, // days
        unlockPerPeriod: 2, // 2%
        totalLocked: 50000,
        nextUnlock: {
          amount: 1000,
          daysUntil: 3,
        },
      },
      dividends: {
        taxShare: 3, // 3% of transaction tax
        vipFeeShare: 3, // 3% of VIP activation fee
      },
    },
  });
});

// ==================== Market Maker Economics API ====================

// GET /api/v1/market-maker/info - Market maker info
app.get('/api/v1/market-maker/info', (req, res) => {
  res.json({
    success: true,
    data: {
      qualification: {
        criteria1: {
          description: '直推10人，每人≥$200，团队≥$2,000',
          minReferrals: 10,
          minPerPerson: 200,
          minTotal: 2000,
        },
        criteria2: {
          description: '个人VIP收益≥$500',
          minVIPIncome: 500,
        },
      },
      benefits: {
        subordinatePredictionDividend: 0.003, // 0.3% from subordinate predictions (0.003 * 100 = 0.3%)
        taxDividend: 0.01, // 1% of transaction tax (0.01 * 100 = 1%)
        vipActivationDividend: 0.01, // 1% of VIP activation fee (0.01 * 100 = 1%)
      },
    },
  });
});

// ==================== Prediction Market Economics API ====================

// GET /api/v1/prediction/economics - Prediction market info
app.get('/api/v1/prediction/economics', (req, res) => {
  res.json({
    success: true,
    data: {
      cycleDuration: 5, // minutes
      poolDistribution: {
        winnerShare: 80, // 80% to winners
        insuranceShare: 20, // 20% to insurance pool
      },
      insurancePool: {
        payoutRate: 40, // 40% of bet amount in TFT
        currentBalance: 125678,
        todayInjection: 234,
      },
      participation: {
        regular: { limit: 1, description: '普通账户每轮限1次' },
        vip: { limit: 'unlimited', description: 'VIP账户无限次' },
      },
    },
  });
});

// ==================== Reinvestment API ====================

// GET /api/v1/reinvestment/status - Get user's reinvestment status
app.get('/api/v1/reinvestment/status', (req, res) => {
  // Simulated data - in production, this would query the blockchain
  const walletAddress = req.query.wallet as string;
  
  res.json({
    success: true,
    data: {
      // 复投规则
      rules: {
        threshold: 200, // 见点奖励累计达200 USDT触发
        reinvestAmount: 100, // 复投金额100 USDT
        deadlineHours: 48, // 48小时内完成
        remainingAmount: 100, // 剩余可自由支配金额
      },
      // 用户状态
      user: {
        cumulativeLevelRewards: 185.50, // 累计见点奖励
        needsReinvestment: false, // 是否需要复投
        hasPendingReinvestment: false, // 是否有待处理的复投
        isPaused: false, // 是否被暂停权益
        totalReinvestments: 0, // 已完成复投次数
        totalLevelRewardsEarned: 185.50, // 历史总见点奖励
      },
      // 复投分配规则（同VIP激活费）
      distribution: {
        nodeDividends: 3, // 3%
        operations: 1, // 1%
        marketMakers: 1, // 1%
        autoBurn: 5, // 5%
        levelRewards: 20, // 20%
        directReferral: 50, // 50%
        activatorReturn: 20, // 20%
      },
    },
  });
});

// GET /api/v1/reinvestment/pending - Get pending reinvestment details
app.get('/api/v1/reinvestment/pending', (req, res) => {
  // Simulated pending reinvestment
  const hasPending = false; // Set to true to simulate pending state
  
  if (!hasPending) {
    return res.json({
      success: true,
      data: {
        hasPending: false,
        message: '暂无待处理的复投',
      },
    });
  }
  
  const now = Date.now();
  const triggerTime = now - 2 * 60 * 60 * 1000; // 2 hours ago
  const deadline = triggerTime + 48 * 60 * 60 * 1000; // 48 hours from trigger
  
  res.json({
    success: true,
    data: {
      hasPending: true,
      reinvestment: {
        id: 1,
        cumulativeRewards: 215.50,
        reinvestAmount: 100,
        triggerTime,
        deadline,
        timeRemaining: deadline - now,
        timeRemainingFormatted: '47:59:58',
        status: 'pending',
      },
      distribution: {
        nodeDividends: 3,
        operations: 1,
        marketMakers: 1,
        autoBurn: 5,
        levelRewards: 20,
        directReferral: 50,
        activatorReturn: 20,
      },
    },
  });
});

// POST /api/v1/reinvestment/execute - Execute reinvestment
app.post('/api/v1/reinvestment/execute', (req, res) => {
  const { signature, referrer } = req.body;
  
  // In production, verify the signature and execute on-chain
  
  res.json({
    success: true,
    data: {
      txHash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
      reinvestAmount: 100,
      distribution: {
        nodeDividends: 3,
        operations: 1,
        marketMakers: 1,
        autoBurn: 5,
        levelRewards: 20,
        directReferral: 50,
        activatorReturn: 20,
      },
      message: '复投成功！您的推广权益已恢复。',
    },
  });
});

// POST /api/v1/reinvestment/defer - Defer reinvestment (稍后处理)
app.post('/api/v1/reinvestment/defer', (req, res) => {
  res.json({
    success: true,
    data: {
      deferred: true,
      message: '已稍后处理，请在48小时内完成复投。',
      reminderEnabled: true,
    },
  });
});

// GET /api/v1/reinvestment/history - Get reinvestment history
app.get('/api/v1/reinvestment/history', (req, res) => {
  res.json({
    success: true,
    data: {
      history: [
        {
          id: 1,
          date: '2026-06-15',
          amount: 100,
          cumulativeRewards: 215.50,
          status: 'completed',
          txHash: '0x123...abc',
        },
        {
          id: 2,
          date: '2026-05-20',
          amount: 100,
          cumulativeRewards: 208.30,
          status: 'completed',
          txHash: '0x456...def',
        },
      ],
      totalReinvestments: 2,
      totalAmountReinvested: 200,
    },
  });
});

// GET /api/v1/market-maker/status - Get market maker status
app.get('/api/v1/market-maker/status', (req, res) => {
  const { address } = req.query;
  
  // Simulated market maker status
  res.json({
    success: true,
    data: {
      isMarketMaker: false,
      applicationStatus: 'none', // 'none' | 'pending' | 'approved' | 'rejected'
      appliedAt: null,
      reviewedAt: null,
      rejectionReason: null,
    },
  });
});

// GET /api/v1/market-maker/qualification-progress - Get qualification progress
app.get('/api/v1/market-maker/qualification-progress', (req, res) => {
  const { address } = req.query;
  
  // Simulated qualification progress
  res.json({
    success: true,
    data: {
      method1: {
        directReferrals: 3,
        requiredReferrals: 10,
        totalPrediction: 150,
        requiredPrediction: 200,
        teamPrediction: 450,
        requiredTeamPrediction: 2000,
        qualified: false,
      },
      method2: {
        vipIncome: 125.50,
        requiredVipIncome: 500,
        qualified: false,
      },
    },
  });
});

// POST /api/v1/market-maker/apply - Apply for market maker
app.post('/api/v1/market-maker/apply', (req, res) => {
  const { address } = req.body;
  
  if (!address) {
    return res.status(400).json({ success: false, error: 'Address is required' });
  }
  
  // Simulated application
  res.json({
    success: true,
    data: {
      message: '做市商申请已提交，请等待审核',
      applicationStatus: 'pending',
      appliedAt: new Date().toISOString(),
    },
  });
});

// ==================== Prediction Market API ====================
// Uses real BTC price from existing fetchRealBTCPrice() and fetchRealKlineData()

// Pure pool model - platform does NOT participate in betting
// Platform only collects 3% fee, zero risk
// Winner pool: 80% of (pool - fee), distributed proportionally
// Insurance pool: 20% of (pool - fee)
const FEE_RATE = 0.03; // 3% platform fee
const WINNER_SHARE = 0.80; // 80% to winners
const INSURANCE_SHARE = 0.20; // 20% to insurance

// In-memory storage
const predictionRounds: any[] = [];
const predictionBets: any[] = [];
let currentRoundId = 1;

// Initialize or get current round (uses real BTC price)
async function getCurrentRound(): Promise<any> {
  const now = Date.now();
  const active = predictionRounds.find(r => r.status === 'betting' || r.status === 'locked');
  if (active) {
    // Update current price in real-time
    const priceData = await fetchRealBTCPrice();
    if (priceData) {
      active.currentPrice = priceData.price.toString();
    }
    return active;
  }

  // Create new round (5 minutes) with REAL BTC price
  const startTime = now;
  const endTime = now + 5 * 60 * 1000;
  const priceData = await fetchRealBTCPrice();
  const basePrice = priceData ? priceData.price : 0;
  const round = {
    id: predictionRounds.length + 1,
    roundId: `R${String(currentRoundId++).padStart(4, '0')}`,
    status: 'betting',
    startTime,
    endTime,
    basePrice: basePrice.toString(),
    currentPrice: basePrice.toString(),
    closePrice: null as string | null,
    totalAmount: '0',
    upAmount: '0',
    downAmount: '0',
    winnerSide: null as string | null,
    insurancePool: '21000000',
  };
  predictionRounds.push(round);

  // Auto-close after 4 minutes (lock), settle at 5 minutes with REAL price
  setTimeout(async () => {
    round.status = 'locked';
    const closePriceData = await fetchRealBTCPrice();
    if (closePriceData) {
      round.closePrice = closePriceData.price.toString();
      round.winnerSide = closePriceData.price >= parseFloat(round.basePrice) ? 'up' : 'down';
    }
  }, 4 * 60 * 1000);

  setTimeout(() => {
    round.status = 'completed';
  }, 5 * 60 * 1000);

  return round;
}

// GET /api/v1/rounds/current - Get current round with user vouchers
app.get('/api/v1/rounds/current', async (req, res) => {
  const { deviceId } = req.query;
  const current = await getCurrentRound();
  // Ensure real-time price
  const priceData = await fetchRealBTCPrice();
  if (priceData) {
    current.currentPrice = priceData.price.toString();
  }
  const vouchers = predictionBets.filter(
    b => b.roundId === current.roundId && b.deviceId === deviceId && !b.claimed
  );
  res.json({ current, vouchers, btcPrice: priceData?.price || 0 });
});

// GET /api/v1/rounds/history - Get round history
app.get('/api/v1/rounds/history', (req, res) => {
  const { deviceId, limit = '20' } = req.query;
  const completed = predictionRounds
    .filter(r => r.status === 'completed')
    .slice(-parseInt(limit as string))
    .reverse()
    .map(r => ({
      ...r,
      userBet: predictionBets.find(b => b.roundId === r.roundId && b.deviceId === deviceId) || null,
    }));
  res.json({ rounds: completed });
});

// GET /api/v1/rounds/realtime-price - Get real-time BTC price (proxies to Binance via existing function)
app.get('/api/v1/rounds/realtime-price', async (req, res) => {
  const priceData = await fetchRealBTCPrice();
  if (!priceData) {
    return res.status(503).json({ price: 0, error: 'Unable to fetch price' });
  }
  res.json({
    price: priceData.price,
    change24h: priceData.change24h,
    symbol: 'BTCUSDT',
    timestamp: Date.now(),
    source: 'Alternative.me',
  });
});

// GET /api/v1/rounds/price-history - Get price history for chart (real Binance klines)
app.get('/api/v1/rounds/price-history', async (req, res) => {
  const { interval = '5m', limit = '288' } = req.query;
  const numLimit = Math.min(parseInt(limit as string) || 288, 1000);
  const klines = await fetchRealKlineData(interval as string, numLimit);

  const prices = klines.map((k: any) => ({
    time: k.timestamp,
    price: k.close,
    open: k.open,
    high: k.high,
    low: k.low,
    volume: k.volume,
  }));

  res.json({ prices, interval, source: 'realtime', updatedAt: Date.now() });
});

// POST /api/v1/rounds/:roundId/bet - Place a bet
app.post('/api/v1/rounds/:roundId/bet', (req, res) => {
  const { roundId } = req.params;
  const { side, amount, deviceId } = req.body;

  if (!side || !amount || !deviceId) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  const round = predictionRounds.find(r => r.roundId === roundId);
  if (!round) return res.status(404).json({ success: false, error: 'Round not found' });
  if (round.status !== 'betting') return res.status(400).json({ success: false, error: 'Round not accepting bets' });

  const betAmount = parseFloat(amount);
  if (betAmount < 1) return res.status(400).json({ success: false, error: 'Minimum bet is $1' });

  // Update round totals
  const fee = betAmount * 0.03; // 3% fee
  const netAmount = betAmount - fee;
  round.totalAmount = (parseFloat(round.totalAmount) + netAmount).toString();
  if (side === 'up') {
    round.upAmount = (parseFloat(round.upAmount) + netAmount).toString();
  } else {
    round.downAmount = (parseFloat(round.downAmount) + netAmount).toString();
  }

  const bet = {
    id: predictionBets.length + 1,
    roundId,
    deviceId,
    side,
    amount: betAmount.toString(),
    fee: fee.toString(),
    netAmount: netAmount.toString(),
    claimed: false,
    won: false,
    payout: '0',
    createdAt: new Date().toISOString(),
  };
  predictionBets.push(bet);

  res.json({ success: true, bet });
});

// POST /api/v1/rounds/:roundId/claim - Claim winnings (pure pool model)
app.post('/api/v1/rounds/:roundId/claim', (req, res) => {
  const { roundId } = req.params;
  const { deviceId } = req.body;

  const round = predictionRounds.find(r => r.roundId === roundId);
  if (!round || round.status !== 'completed') {
    return res.status(400).json({ success: false, error: 'Round not completed' });
  }

  const bet = predictionBets.find(b => b.roundId === roundId && b.deviceId === deviceId);
  if (!bet) return res.status(404).json({ success: false, error: 'Bet not found' });
  if (bet.claimed) return res.status(400).json({ success: false, error: 'Already claimed' });

  // Check if both sides have bets (pure pool requires both sides)
  const upAmount = parseFloat(round.upAmount);
  const downAmount = parseFloat(round.downAmount);
  const userWon = bet.side === round.winnerSide;
  const betAmount = parseFloat(bet.amount);

  if (upAmount === 0 || downAmount === 0) {
    // One side has no bets - refund all bets (no valid pool)
    bet.won = false;
    bet.refunded = true;
    bet.payout = betAmount.toString(); // Return original bet
    bet.claimed = true;

    return res.json({
      success: true,
      won: false,
      refunded: true,
      payout: bet.payout,
      message: 'Round cancelled: no counterparty bets',
    });
  }

  // Pure pool model: winner pool = 80% of (total pool - fee)
  const totalPool = upAmount + downAmount;
  const fee = totalPool * FEE_RATE;
  const winnerPool = totalPool * (1 - FEE_RATE) * WINNER_SHARE;
  const insurancePool = totalPool * (1 - FEE_RATE) * INSURANCE_SHARE;

  // Store round settlement info
  round.fee = fee.toString();
  round.winnerPool = winnerPool.toString();
  round.insurancePool = insurancePool.toString();

  if (userWon) {
    // Winner gets proportional share of winner pool
    // Share = user's bet / total winning side amount
    const winningSideTotal = bet.side === 'up' ? upAmount : downAmount;
    const userShare = betAmount / winningSideTotal;
    const payout = Math.round(winnerPool * userShare * 100) / 100;
    bet.won = true;
    bet.payout = payout.toString();
    bet.share = (userShare * 100).toFixed(2) + '%';
  } else {
    // Loser gets nothing from pool (pure pool model)
    bet.won = false;
    bet.payout = '0';
  }

  bet.claimed = true;

  res.json({
    success: true,
    won: userWon,
    payout: bet.payout,
    winnerPool: round.winnerPool,
    insurancePool: round.insurancePool,
    userShare: bet.share || '0%',
  });
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
});
