import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { FontAwesome6 } from '@expo/vector-icons';
import { useSafeRouter } from '@/hooks/useSafeRouter';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || '';

const COLORS = {
  primary: '#6366F1',
  primaryDark: '#4F46E5',
  background: '#0F0F1E',
  surface: '#1A1A2E',
  surfaceLight: '#252542',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0C0',
  textMuted: '#6B6B8D',
  border: '#2A2A4A',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
};

interface TokenInfo {
  name: string;
  symbol: string;
  totalSupply: number;
  currentSupply: number;
  burned: number;
  teamLockup: number;
  teamReleased: number;
  taxRate: number;
  taxDistribution: {
    node: number;
    operation: number;
    marketMaker: number;
    burn: number;
  };
}

interface BurnInfo {
  tiers: Array<{
    poolSize: string;
    frequency: string;
    burnRate: string;
    burnAmount: string;
  }>;
  targetSupply: number;
}

interface VIPInfo {
  activationFee: number;
  directReferralReward: number;
  levelReward: number;
  maxLevels: number;
  distribution: {
    node: number;
    operation: number;
    marketMaker: number;
    burn: number;
    levelReward: number;
    directReferral: number;
    returnToUser: number;
  };
}

interface NodeInfo {
  burnCost: number;
  lpCost: number;
  nodesPerBurn: number;
  nodesPerLp: number;
  lpLockupPeriods: number;
  lpUnlockPerPeriod: number;
  unlockIntervalDays: number;
  benefits: {
    taxDividend: number;
    vipActivationDividend: number;
  };
}

interface MarketMakerInfo {
  qualificationMethods: Array<{
    method: string;
    condition: string;
  }>;
  reviewPeriod: string;
  validity: string;
  benefits: {
    subordinatePredictionDividend: number;
    taxDividend: number;
    vipActivationDividend: number;
  };
}

export default function TokenomicsScreen() {
  const router = useSafeRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [burnInfo, setBurnInfo] = useState<BurnInfo | null>(null);
  const [vipInfo, setVipInfo] = useState<VIPInfo | null>(null);
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);
  const [marketMakerInfo, setMarketMakerInfo] = useState<MarketMakerInfo | null>(null);

  const fetchData = async () => {
    try {
      const [tokenRes, burnRes, vipRes, nodeRes, mmRes] = await Promise.all([
        fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/token/info`),
        fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/token/burn-info`),
        fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/vip/info`),
        fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/node/economics`),
        fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/market-maker/info`),
      ]);

      const [tokenData, burnData, vipData, nodeData, mmData] = await Promise.all([
        tokenRes.json(),
        burnRes.json(),
        vipRes.json(),
        nodeRes.json(),
        mmRes.json(),
      ]);

      if (tokenData.success) setTokenInfo(tokenData.data);
      if (burnData.success) setBurnInfo(burnData.data);
      if (vipData.success) setVipInfo(vipData.data);
      if (nodeData.success) setNodeInfo(nodeData.data);
      if (mmData.success) setMarketMakerInfo(mmData.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>加载中...</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <FontAwesome6 name="arrow-left" size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>TFT 代币经济</Text>
            <Text style={styles.headerSubtitle}>TradeFuture Token Economics</Text>
          </View>
        </View>

        {/* Token Overview */}
        {tokenInfo && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FontAwesome6 name="coins" size={20} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>代币概览</Text>
            </View>
            <View style={styles.card}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>代币名称</Text>
                <Text style={styles.infoValue}>{tokenInfo.name} ({tokenInfo.symbol})</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>初始总量</Text>
                <Text style={styles.infoValue}>{tokenInfo.totalSupply.toLocaleString()} 枚</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>当前流通</Text>
                <Text style={styles.infoValue}>{tokenInfo.currentSupply.toLocaleString()} 枚</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>已销毁</Text>
                <Text style={[styles.infoValue, { color: COLORS.danger }]}>
                  {tokenInfo.burned.toLocaleString()} 枚
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>买卖滑点</Text>
                <Text style={[styles.infoValue, { color: COLORS.warning }]}>
                  {(tokenInfo.taxRate * 100).toFixed(0)}%
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Tax Distribution */}
        {tokenInfo && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FontAwesome6 name="chart-pie" size={20} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>6% 滑点分配</Text>
            </View>
            <View style={styles.card}>
              <View style={styles.distributionRow}>
                <View style={styles.distributionIcon}>
                  <FontAwesome6 name="users" size={16} color={COLORS.success} />
                </View>
                <View style={styles.distributionInfo}>
                  <Text style={styles.distributionLabel}>节点分红</Text>
                  <Text style={styles.distributionDesc}>按节点权重等比分配</Text>
                </View>
                <Text style={styles.distributionPercent}>3%</Text>
              </View>
              <View style={styles.distributionRow}>
                <View style={[styles.distributionIcon, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                  <FontAwesome6 name="building" size={16} color={COLORS.primary} />
                </View>
                <View style={styles.distributionInfo}>
                  <Text style={styles.distributionLabel}>运营团队</Text>
                  <Text style={styles.distributionDesc}>平台运营、技术迭代、安全审计</Text>
                </View>
                <Text style={styles.distributionPercent}>1%</Text>
              </View>
              <View style={styles.distributionRow}>
                <View style={[styles.distributionIcon, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                  <FontAwesome6 name="hand-holding-dollar" size={16} color={COLORS.warning} />
                </View>
                <View style={styles.distributionInfo}>
                  <Text style={styles.distributionLabel}>做市商</Text>
                  <Text style={styles.distributionDesc}>平均分配给所有做市商</Text>
                </View>
                <Text style={styles.distributionPercent}>1%</Text>
              </View>
              <View style={styles.distributionRow}>
                <View style={[styles.distributionIcon, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                  <FontAwesome6 name="fire" size={16} color={COLORS.danger} />
                </View>
                <View style={styles.distributionInfo}>
                  <Text style={styles.distributionLabel}>自动销毁</Text>
                  <Text style={styles.distributionDesc}>买入TFT转入黑洞地址</Text>
                </View>
                <Text style={styles.distributionPercent}>1%</Text>
              </View>
            </View>
          </View>
        )}

        {/* Burn Mechanism */}
        {burnInfo && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FontAwesome6 name="fire" size={20} color={COLORS.danger} />
              <Text style={styles.sectionTitle}>阶梯式自动销毁</Text>
            </View>
            <View style={styles.card}>
              {burnInfo.tiers.map((tier, index) => (
                <View key={index} style={styles.tierRow}>
                  <View style={styles.tierInfo}>
                    <Text style={styles.tierPool}>{tier.poolSize}</Text>
                    <Text style={styles.tierFrequency}>{tier.frequency}</Text>
                  </View>
                  <Text style={styles.tierRate}>{tier.burnRate}</Text>
                </View>
              ))}
              <View style={styles.burnTarget}>
                <FontAwesome6 name="bullseye" size={14} color={COLORS.warning} />
                <Text style={styles.burnTargetText}>
                  通缩目标：{burnInfo.targetSupply.toLocaleString()} 枚
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* VIP System */}
        {vipInfo && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FontAwesome6 name="crown" size={20} color={COLORS.warning} />
              <Text style={styles.sectionTitle}>VIP 会员体系</Text>
            </View>
            <View style={styles.card}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>激活费用</Text>
                <Text style={styles.infoValue}>{vipInfo.activationFee} USDT</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>直推奖励</Text>
                <Text style={[styles.infoValue, { color: COLORS.success }]}>
                  {vipInfo.directReferralReward} USDT/人
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>见点奖励</Text>
                <Text style={[styles.infoValue, { color: COLORS.success }]}>
                  {vipInfo.levelReward} USDT/人 × {vipInfo.maxLevels}级
                </Text>
              </View>
            </View>
            <View style={[styles.card, { marginTop: 12 }]}>
              <Text style={styles.subsectionTitle}>激活费分配 (100 USDT)</Text>
              <View style={styles.vipDistribution}>
                <View style={styles.vipDistItem}>
                  <Text style={styles.vipDistPercent}>50%</Text>
                  <Text style={styles.vipDistLabel}>直推奖励</Text>
                </View>
                <View style={styles.vipDistItem}>
                  <Text style={styles.vipDistPercent}>20%</Text>
                  <Text style={styles.vipDistLabel}>见点奖励</Text>
                </View>
                <View style={styles.vipDistItem}>
                  <Text style={styles.vipDistPercent}>20%</Text>
                  <Text style={styles.vipDistLabel}>返还用户</Text>
                </View>
                <View style={styles.vipDistItem}>
                  <Text style={styles.vipDistPercent}>5%</Text>
                  <Text style={styles.vipDistLabel}>自动销毁</Text>
                </View>
                <View style={styles.vipDistItem}>
                  <Text style={styles.vipDistPercent}>3%</Text>
                  <Text style={styles.vipDistLabel}>节点分红</Text>
                </View>
                <View style={styles.vipDistItem}>
                  <Text style={styles.vipDistPercent}>1%</Text>
                  <Text style={styles.vipDistLabel}>运营</Text>
                </View>
                <View style={styles.vipDistItem}>
                  <Text style={styles.vipDistPercent}>1%</Text>
                  <Text style={styles.vipDistLabel}>做市商</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Node Partner */}
        {nodeInfo && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FontAwesome6 name="network-wired" size={20} color={COLORS.success} />
              <Text style={styles.sectionTitle}>节点合伙人</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.subsectionTitle}>获取方式</Text>
              <View style={styles.nodeMethodRow}>
                <FontAwesome6 name="fire" size={14} color={COLORS.danger} />
                <Text style={styles.nodeMethodText}>
                  销毁 {nodeInfo.burnCost.toLocaleString()} TFT = {nodeInfo.nodesPerBurn} 节点
                </Text>
              </View>
              <View style={styles.nodeMethodRow}>
                <FontAwesome6 name="droplet" size={14} color={COLORS.primary} />
                <Text style={styles.nodeMethodText}>
                  LP {nodeInfo.lpCost.toLocaleString()} TFT + 等值USDT = {nodeInfo.nodesPerLp} 节点
                </Text>
              </View>
            </View>
            <View style={[styles.card, { marginTop: 12 }]}>
              <Text style={styles.subsectionTitle}>LP 锁仓规则</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>锁仓周期</Text>
                <Text style={styles.infoValue}>{nodeInfo.lpLockupPeriods} 期</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>每期解锁</Text>
                <Text style={styles.infoValue}>{(nodeInfo.lpUnlockPerPeriod * 100).toFixed(0)}%</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>解锁间隔</Text>
                <Text style={styles.infoValue}>每 {nodeInfo.unlockIntervalDays} 天</Text>
              </View>
            </View>
            <View style={[styles.card, { marginTop: 12 }]}>
              <Text style={styles.subsectionTitle}>节点收益</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>滑点分红</Text>
                <Text style={[styles.infoValue, { color: COLORS.success }]}>
                  {(nodeInfo.benefits.taxDividend * 100).toFixed(0)}%
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>VIP激活费分红</Text>
                <Text style={[styles.infoValue, { color: COLORS.success }]}>
                  {(nodeInfo.benefits.vipActivationDividend * 100).toFixed(0)}% (${(vipInfo?.activationFee || 100) * nodeInfo.benefits.vipActivationDividend})
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Market Maker */}
        {marketMakerInfo && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FontAwesome6 name="chart-line" size={20} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>做市商体系</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.subsectionTitle}>申请条件（满足其一）</Text>
              {marketMakerInfo.qualificationMethods.map((method, index) => (
                <View key={index} style={styles.mmMethodRow}>
                  <View style={styles.mmMethodBadge}>
                    <Text style={styles.mmMethodBadgeText}>方式{index + 1}</Text>
                  </View>
                  <Text style={styles.mmMethodText}>{method.condition}</Text>
                </View>
              ))}
              <View style={styles.mmInfoRow}>
                <Text style={styles.mmInfoLabel}>审核周期</Text>
                <Text style={styles.mmInfoValue}>{marketMakerInfo.reviewPeriod}</Text>
              </View>
              <View style={styles.mmInfoRow}>
                <Text style={styles.mmInfoLabel}>资格有效期</Text>
                <Text style={styles.mmInfoValue}>{marketMakerInfo.validity}</Text>
              </View>
            </View>
            <View style={[styles.card, { marginTop: 12 }]}>
              <Text style={styles.subsectionTitle}>做市商收益</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>伞下预测分红</Text>
                <Text style={[styles.infoValue, { color: COLORS.success }]}>
                  {(marketMakerInfo.benefits.subordinatePredictionDividend * 100).toFixed(1)}%（个人独享）
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>滑点分红</Text>
                <Text style={[styles.infoValue, { color: COLORS.success }]}>
                  {(marketMakerInfo.benefits.taxDividend * 100).toFixed(0)}%（平均分配）
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>VIP激活费分红</Text>
                <Text style={[styles.infoValue, { color: COLORS.success }]}>
                  {(marketMakerInfo.benefits.vipActivationDividend * 100).toFixed(0)}% (${(vipInfo?.activationFee || 100) * marketMakerInfo.benefits.vipActivationDividend}，平均分配）
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Team Lockup */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome6 name="lock" size={20} color={COLORS.textMuted} />
            <Text style={styles.sectionTitle}>团队锁仓</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>锁仓数量</Text>
              <Text style={styles.infoValue}>1,000,000 枚</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>锁仓周期</Text>
              <Text style={styles.infoValue}>50 个月</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>每月释放</Text>
              <Text style={styles.infoValue}>2%</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>TradeFuture - 预测即挖矿，亏损有保障</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    left: 0,
    zIndex: 1,
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  subsectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  distributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  distributionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  distributionInfo: {
    flex: 1,
  },
  distributionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  distributionDesc: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  distributionPercent: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
  tierRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tierInfo: {
    flex: 1,
  },
  tierPool: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  tierFrequency: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  tierRate: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.danger,
  },
  burnTarget: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 6,
  },
  burnTargetText: {
    fontSize: 13,
    color: COLORS.warning,
    fontWeight: '600',
  },
  vipDistribution: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  vipDistItem: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    minWidth: 70,
  },
  vipDistPercent: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
  vipDistLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  nodeMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  nodeMethodText: {
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  mmMethodRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    gap: 8,
  },
  mmMethodBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  mmMethodBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  mmMethodText: {
    fontSize: 12,
    color: COLORS.textPrimary,
    flex: 1,
  },
  mmInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  mmInfoLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  mmInfoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  footerText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
});
