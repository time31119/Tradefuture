/**
 * 自动判定系统 - 做市商和节点合伙人自动授予
 * 
 * 做市商条件（满足其一）：
 * 1. 直推10人，每人预测≥$200，伞下总预测≥$2,000
 * 2. 个人VIP收益（直推+见点累计）≥$500
 * 
 * 节点合伙人条件：
 * 1. 销毁TFT：100,000 TFT → 1节点, 200,000 TFT → 2节点
 * 2. 添加LP：50,000 TFT + 等值USDT → 1节点, 100,000 TFT + 等值USDT → 2节点
 * 3. 赠送节点：推荐奖励达 30,000 USD → 1节点
 */

import { updateUserMetrics, logRoleGrant, getDb, type UserMetrics } from './db';

// 做市商条件常量
const MARKET_MAKER_CONSTANTS = {
  DIRECT_REFERRALS_REQUIRED: 10,
  MIN_PREDICTION_PER_REFERRAL: 200,
  TOTAL_REFERRAL_VOLUME_REQUIRED: 2000,
  VIP_EARNINGS_REQUIRED: 500,
};

// 节点合伙人条件常量
const NODE_PARTNER_CONSTANTS = {
  BURN_TFT_PER_NODE: 100000,
  LP_TFT_PER_NODE: 50000,
  GIFT_REFERRAL_EARNINGS_THRESHOLD: 30000,
};

/**
 * 检查用户是否符合做市商条件
 */
export function checkMarketMakerEligibility(userAddress: string): { eligible: boolean; method?: string; details?: string } {
  const metrics = getUserMetrics(userAddress);
  if (!metrics) {
    return { eligible: false };
  }

  // 如果已经是做市商，直接返回
  if (metrics.is_market_maker === 1) {
    return { eligible: false, details: 'Already a market maker' };
  }

  // 方式一：直推10人，每人预测≥$200，伞下总预测≥$2,000
  const method1Eligible = metrics.direct_referrals >= MARKET_MAKER_CONSTANTS.DIRECT_REFERRALS_REQUIRED
    && metrics.total_referral_volume >= MARKET_MAKER_CONSTANTS.TOTAL_REFERRAL_VOLUME_REQUIRED;

  if (method1Eligible) {
    return {
      eligible: true,
      method: 'referral',
      details: `直推${metrics.direct_referrals}人，伞下预测额$${metrics.total_referral_volume.toFixed(2)}`,
    };
  }

  // 方式二：个人VIP收益（直推+见点累计）≥$500
  const totalVipEarnings = metrics.vip_activation_earnings + metrics.level_earnings;
  const method2Eligible = totalVipEarnings >= MARKET_MAKER_CONSTANTS.VIP_EARNINGS_REQUIRED;

  if (method2Eligible) {
    return {
      eligible: true,
      method: 'earnings',
      details: `VIP累计收益$${totalVipEarnings.toFixed(2)}`,
    };
  }

  return { eligible: false };
}

/**
 * 检查用户是否符合节点合伙人条件，返回可获得的节点数
 */
export function checkNodePartnerEligibility(userAddress: string): { nodes: number; details: string[] } {
  const metrics = getUserMetrics(userAddress);
  if (!metrics) {
    return { nodes: 0, details: [] };
  }

  const details: string[] = [];
  let totalNodes = 0;

  // 销毁TFT方案
  const burnNodes = Math.floor(metrics.tft_burned / NODE_PARTNER_CONSTANTS.BURN_TFT_PER_NODE);
  if (burnNodes > 0) {
    totalNodes += burnNodes;
    details.push(`销毁TFT获得${burnNodes}节点（累计销毁${metrics.tft_burned.toFixed(0)} TFT）`);
  }

  // 添加LP方案
  const lpNodes = Math.floor(metrics.lp_added / NODE_PARTNER_CONSTANTS.LP_TFT_PER_NODE);
  if (lpNodes > 0) {
    totalNodes += lpNodes;
    details.push(`添加LP获得${lpNodes}节点（累计添加${metrics.lp_added.toFixed(0)} TFT）`);
  }

  // 赠送节点方案
  if (metrics.referral_earnings >= NODE_PARTNER_CONSTANTS.GIFT_REFERRAL_EARNINGS_THRESHOLD) {
    totalNodes += 1;
    details.push(`推荐奖励达$${metrics.referral_earnings.toFixed(2)}，赠送1节点`);
  }

  // 减去已有的节点数
  const existingNodes = metrics.node_count || 0;
  const newNodes = Math.max(0, totalNodes - existingNodes);

  return { nodes: newNodes, details };
}

/**
 * 授予做市商角色
 */
export function grantMarketMakerRole(userAddress: string, method: string, details: string): boolean {
  const metrics = getUserMetrics(userAddress);
  if (!metrics || metrics.is_market_maker === 1) {
    return false;
  }

  const now = new Date().toISOString();
  updateUserMetrics(userAddress, {
    is_market_maker: 1,
    market_maker_granted_at: now,
    market_maker_method: method,
  });

  logRoleGrant(userAddress, 'market_maker', method, details, true);
  console.log(`[AutoGrant] 用户 ${userAddress} 自动成为做市商，方式: ${method}, 详情: ${details}`);
  return true;
}

/**
 * 授予节点合伙人角色
 */
export function grantNodePartnerRole(userAddress: string, nodes: number, details: string[]): boolean {
  if (nodes <= 0) {
    return false;
  }

  const metrics = getUserMetrics(userAddress);
  if (!metrics) {
    return false;
  }

  const now = new Date().toISOString();
  const newNodeCount = (metrics.node_count || 0) + nodes;
  
  updateUserMetrics(userAddress, {
    node_count: newNodeCount,
    node_granted_at: now,
  });

  logRoleGrant(userAddress, 'node_partner', 'auto', JSON.stringify(details), true);
  console.log(`[AutoGrant] 用户 ${userAddress} 获得${nodes}个节点，总节点数: ${newNodeCount}`);
  return true;
}

/**
 * 综合检查并自动授予角色
 */
export function checkAndGrantRoles(userAddress: string): { marketMakerGranted: boolean; nodesGranted: number } {
  let marketMakerGranted = false;
  let nodesGranted = 0;

  // 检查做市商资格
  const marketMakerResult = checkMarketMakerEligibility(userAddress);
  if (marketMakerResult.eligible && marketMakerResult.method) {
    marketMakerGranted = grantMarketMakerRole(userAddress, marketMakerResult.method, marketMakerResult.details || '');
  }

  // 检查节点合伙人资格
  const nodeResult = checkNodePartnerEligibility(userAddress);
  if (nodeResult.nodes > 0) {
    const granted = grantNodePartnerRole(userAddress, nodeResult.nodes, nodeResult.details);
    if (granted) {
      nodesGranted = nodeResult.nodes;
    }
  }

  return { marketMakerGranted, nodesGranted };
}

/**
 * 获取所有需要检查的用户地址
 */
export function getAllUserAddresses(): string[] {
  const db = getDb();
  const rows = db.prepare('SELECT DISTINCT user_address FROM user_metrics').all() as { user_address: string }[];
  return rows.map(row => row.user_address);
}

/**
 * 获取用户指标
 */
export function getUserMetrics(userAddress: string): UserMetrics | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM user_metrics WHERE user_address = ?').get(userAddress) as UserMetrics | undefined;
  return row || null;
}

/**
 * 定时任务：检查所有用户的角色资格
 */
export function runScheduledCheck(): { checked: number; marketMakersGranted: number; nodesGranted: number } {
  const userAddresses = getAllUserAddresses();
  let marketMakersGranted = 0;
  let nodesGranted = 0;

  for (const address of userAddresses) {
    const result = checkAndGrantRoles(address);
    if (result.marketMakerGranted) marketMakersGranted++;
    nodesGranted += result.nodesGranted;
  }

  console.log(`[ScheduledCheck] 检查完成: ${userAddresses.length}个用户, 新增做市商${marketMakersGranted}个, 新增节点${nodesGranted}个`);
  return { checked: userAddresses.length, marketMakersGranted, nodesGranted };
}

/**
 * 启动定时任务（每小时执行一次）
 */
export function startScheduledCheck(): void {
  // 启动时立即执行一次
  setTimeout(() => {
    console.log('[ScheduledCheck] 启动时执行首次检查');
    runScheduledCheck();
  }, 5000);

  // 每小时执行一次
  setInterval(() => {
    console.log('[ScheduledCheck] 定时检查开始');
    runScheduledCheck();
  }, 60 * 60 * 1000); // 1小时

  console.log('[ScheduledCheck] 定时任务已启动，每小时执行一次');
}
