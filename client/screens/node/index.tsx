import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useWallet } from '@/contexts/WalletContext';
import { useFocusEffect } from 'expo-router';
import { COLORS } from '@/utils/theme';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';

interface Reward {
  id: number;
  date: string;
  amount: number;
  currency: string;
  type: 'node' | 'lp';
}

interface NodeData {
  activeNodes: number;
  maxNodes: number;
  pendingRewardsUSDT: number;
  pendingRewardsTFT: number;
  totalClaimedRewards: number;
  lpLocked: number;
  lpWithdrawable: number;
  lpUnlockProgress: { current: number; total: number };
  nextUnlockAmount: number;
  nextUnlockDays: number;
  nodePrice: number;
  rewards: Reward[];
}

type RewardFilter = 'all' | 'node' | 'lp';

export default function NodeScreen() {
  const { isConnected } = useWallet();
  const [data, setData] = useState<NodeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tftAmount, setTftAmount] = useState('5000');
  const [acquireMethod, setAcquireMethod] = useState<'burn' | 'lp'>('burn');
  const [claiming, setClaiming] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [rewardFilter, setRewardFilter] = useState<RewardFilter>('all');
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/node/overview`);
      const result = await res.json();
      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Fetch node data error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const handleClaimRewards = async () => {
    if (!isConnected) {
      Alert.alert('需要钱包', '请先连接钱包');
      return;
    }
    setClaiming(true);
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/node/claim
       */
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/node/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await res.json();
      if (result.success) {
        Alert.alert('领取成功', `已领取 ${result.data.claimedUSDT} USDT + ${result.data.claimedTFT} TFT`);
        fetchData();
      }
    } catch (error) {
      console.error('Claim error:', error);
      Alert.alert('错误', '领取失败，请重试');
    } finally {
      setClaiming(false);
    }
  };

  const handleAcquireNode = async () => {
    if (!isConnected) {
      Alert.alert('需要钱包', '请先连接钱包');
      return;
    }
    const amount = parseFloat(tftAmount);
    if (!amount || amount < 5000) {
      Alert.alert('金额无效', '至少需要 5000 TFT');
      return;
    }
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/node/acquire
       * Body 参数：method: string, tftAmount: number
       */
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/node/acquire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: acquireMethod, tftAmount: amount }),
      });
      const result = await res.json();
      if (result.success) {
        Alert.alert('成功', `成功获取 ${result.data.nodesAcquired} 个节点！`);
        fetchData();
      }
    } catch (error) {
      console.error('Acquire node error:', error);
      Alert.alert('错误', '获取节点失败，请重试');
    }
  };

  const handleWithdrawLP = async () => {
    if (!isConnected) {
      Alert.alert('需要钱包', '请先连接钱包');
      return;
    }
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      Alert.alert('金额无效', '请输入有效的撤回数量');
      return;
    }
    if (amount > (data?.lpWithdrawable || 0)) {
      Alert.alert('金额超限', '撤回数量超过可撤回额度');
      return;
    }
    setWithdrawing(true);
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/node/withdraw-lp
       * Body 参数：lpAmount: number
       */
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/node/withdraw-lp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lpAmount: amount }),
      });
      const result = await res.json();
      if (result.success) {
        Alert.alert('撤回成功', `已撤回 ${result.data.lpWithdrawn} LP\n获得 ${result.data.tftReturned.toFixed(2)} TFT + ${result.data.usdtReturned.toFixed(2)} USDT`);
        setShowWithdrawModal(false);
        setWithdrawAmount('');
        fetchData();
      }
    } catch (error) {
      console.error('Withdraw LP error:', error);
      Alert.alert('错误', '撤回失败，请重试');
    } finally {
      setWithdrawing(false);
    }
  };

  const estimatedNodes = Math.floor((parseFloat(tftAmount) || 0) / 5000);

  const filteredRewards = data?.rewards.filter((reward) => {
    if (rewardFilter === 'all') return true;
    return reward.type === rewardFilter;
  }) || [];

  if (loading) {
    return (
      <Screen backgroundColor={COLORS.background} statusBarStyle="light">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen backgroundColor={COLORS.background} statusBarStyle="light">
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>节点合伙人</Text>
          <Text style={styles.subtitle}>获取协议收益分红</Text>
        </View>

        {/* Node Stats */}
        <View style={styles.statsGrid}>
          <StatCard label="活跃节点" value={data?.activeNodes?.toString() || '0'} icon="cubes" color={COLORS.primary} />
          <StatCard label="最大节点" value={data?.maxNodes?.toString() || '0'} icon="cubes-stacked" color={COLORS.primaryLight} />
          <StatCard label="待领收益" value={`$${(data?.pendingRewardsUSDT || 0).toFixed(2)}`} icon="gift" color={COLORS.success} />
          <StatCard label="累计已领" value={`$${(data?.totalClaimedRewards || 0).toFixed(2)}`} icon="trophy" color={COLORS.primary} />
        </View>

        {/* Quick Claim */}
        <View style={styles.claimCard}>
          <View style={styles.claimInfo}>
            <View style={styles.claimItem}>
              <Text style={styles.claimLabel}>待领USDT</Text>
              <Text style={styles.claimValue}>${data?.pendingRewardsUSDT?.toFixed(2) || '0.00'}</Text>
            </View>
            <View style={styles.claimDivider} />
            <View style={styles.claimItem}>
              <Text style={styles.claimLabel}>待领TFT</Text>
              <Text style={styles.claimValue}>{data?.pendingRewardsTFT?.toFixed(2) || '0.00'}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.claimBtn, (!isConnected || claiming) && styles.claimBtnDisabled]}
            onPress={handleClaimRewards}
            disabled={!isConnected || claiming}
          >
            <LinearGradient
              colors={isConnected ? COLORS.GRADIENT_PRIMARY : ['#333', '#444']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.claimGradient}
            >
              {claiming ? (
                <ActivityIndicator color={COLORS.background} size="small" />
              ) : (
                <View style={styles.claimBtnContent}>
                  <FontAwesome6 name="hand-holding-dollar" size={16} color={COLORS.background} />
                  <Text style={styles.claimBtnText}>
                    {!isConnected ? '连接钱包' : '一键领取所有收益'}
                  </Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Acquire Node */}
        <View style={styles.acquireSection}>
          <View style={styles.sectionHeader}>
            <FontAwesome6 name="circle-plus" size={16} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>获取节点</Text>
          </View>

          {/* Method Tabs */}
          <View style={styles.methodTabs}>
            <TouchableOpacity
              style={[styles.methodTab, acquireMethod === 'burn' && styles.methodTabActive]}
              onPress={() => setAcquireMethod('burn')}
            >
              <FontAwesome6 name="fire" size={12} color={acquireMethod === 'burn' ? COLORS.primary : COLORS.textSecondary} />
              <Text style={[styles.methodTabText, acquireMethod === 'burn' && styles.methodTabTextActive]}>
                销毁TFT
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.methodTab, acquireMethod === 'lp' && styles.methodTabActive]}
              onPress={() => setAcquireMethod('lp')}
            >
              <FontAwesome6 name="droplet" size={12} color={acquireMethod === 'lp' ? COLORS.primary : COLORS.textSecondary} />
              <Text style={[styles.methodTabText, acquireMethod === 'lp' && styles.methodTabTextActive]}>
                添加LP
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.acquireCard}>
            {acquireMethod === 'burn' ? (
              <>
                <View style={styles.acquireDescRow}>
                  <FontAwesome6 name="fire" size={14} color={COLORS.danger} />
                  <Text style={styles.acquireDesc}>销毁 5000 TFT 获得 1 个节点</Text>
                </View>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.acquireInput}
                    value={tftAmount}
                    onChangeText={setTftAmount}
                    placeholder="5000"
                    placeholderTextColor={COLORS.textSecondary}
                    keyboardType="numeric"
                  />
                  <Text style={styles.inputSuffix}>TFT</Text>
                </View>
                <View style={styles.quickAmounts}>
                  {[5000, 10000, 25000, 50000].map((amount) => (
                    <TouchableOpacity
                      key={amount}
                      style={styles.quickAmountBtn}
                      onPress={() => setTftAmount(amount.toString())}
                    >
                      <Text style={styles.quickAmountText}>{amount >= 10000 ? `${amount / 1000}K` : amount}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.estimateText}>
                  预计获得: <Text style={styles.estimateValue}>{estimatedNodes}</Text> 个节点
                </Text>
                <TouchableOpacity
                  style={[styles.acquireBtn, !isConnected && styles.acquireBtnDisabled]}
                  onPress={handleAcquireNode}
                  disabled={!isConnected}
                >
                  <LinearGradient
                    colors={isConnected ? COLORS.GRADIENT_PRIMARY : ['#333', '#444']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.acquireBtnGradient}
                  >
                    <FontAwesome6 name="fire" size={14} color={COLORS.background} />
                    <Text style={styles.acquireBtnText}>
                      {!isConnected ? '连接钱包' : '授权并销毁'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.acquireDescRow}>
                  <FontAwesome6 name="droplet" size={14} color={COLORS.success} />
                  <Text style={styles.acquireDesc}>添加等值TFT+USDT LP获得节点</Text>
                </View>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.acquireInput}
                    value={tftAmount}
                    onChangeText={setTftAmount}
                    placeholder="5000"
                    placeholderTextColor={COLORS.textSecondary}
                    keyboardType="numeric"
                  />
                  <Text style={styles.inputSuffix}>TFT</Text>
                </View>
                <View style={styles.lpEquivalent}>
                  <FontAwesome6 name="arrow-right" size={10} color={COLORS.textSecondary} />
                  <Text style={styles.lpEquivText}>≈ {Math.floor((parseFloat(tftAmount) || 0) / 2)} USDT (自动计算)</Text>
                </View>
                <Text style={styles.estimateText}>
                  预计获得: <Text style={styles.estimateValue}>{estimatedNodes}</Text> 个节点
                </Text>
                <TouchableOpacity
                  style={[styles.acquireBtn, !isConnected && styles.acquireBtnDisabled]}
                  onPress={handleAcquireNode}
                  disabled={!isConnected}
                >
                  <LinearGradient
                    colors={isConnected ? COLORS.GRADIENT_PRIMARY : ['#333', '#444']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.acquireBtnGradient}
                  >
                    <FontAwesome6 name="droplet" size={14} color={COLORS.background} />
                    <Text style={styles.acquireBtnText}>
                      {!isConnected ? '连接钱包' : '授权并添加LP'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* LP Management */}
        {data && (
          <View style={styles.lpSection}>
            <View style={styles.sectionHeader}>
              <FontAwesome6 name="water" size={16} color={COLORS.success} />
              <Text style={styles.sectionTitle}>LP管理</Text>
            </View>
            <View style={styles.lpCard}>
              <View style={styles.lpRow}>
                <View style={styles.lpRowLeft}>
                  <FontAwesome6 name="lock" size={12} color={COLORS.textSecondary} />
                  <Text style={styles.lpLabel}>总锁仓LP</Text>
                </View>
                <Text style={styles.lpValue}>{data.lpLocked.toLocaleString()} LP</Text>
              </View>
              <View style={styles.lpRow}>
                <View style={styles.lpRowLeft}>
                  <FontAwesome6 name="unlock" size={12} color={COLORS.success} />
                  <Text style={styles.lpLabel}>可撤回</Text>
                </View>
                <Text style={[styles.lpValue, { color: data.lpWithdrawable > 0 ? COLORS.success : COLORS.textSecondary }]}>
                  {data.lpWithdrawable.toFixed(2)} LP
                </Text>
              </View>
              <View style={styles.lpRow}>
                <View style={styles.lpRowLeft}>
                  <FontAwesome6 name="chart-line" size={12} color={COLORS.textSecondary} />
                  <Text style={styles.lpLabel}>解锁进度</Text>
                </View>
                <Text style={styles.lpValue}>{data.lpUnlockProgress.current}/{data.lpUnlockProgress.total} 期</Text>
              </View>

              {/* Progress Bar */}
              <View style={styles.progressBar}>
                <LinearGradient
                  colors={COLORS.GRADIENT_PRIMARY}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[
                    styles.progressFill,
                    { width: `${(data.lpUnlockProgress.current / data.lpUnlockProgress.total) * 100}%` }
                  ]}
                />
              </View>

              <View style={styles.lpNextUnlock}>
                <FontAwesome6 name="clock" size={12} color={COLORS.primary} />
                <Text style={styles.lpNextText}>
                  下次解锁: {data.nextUnlockAmount} LP ({data.nextUnlockDays}天后)
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.withdrawBtn, data.lpWithdrawable <= 0 && styles.withdrawBtnDisabled]}
                onPress={() => {
                  if (data.lpWithdrawable > 0) {
                    setWithdrawAmount(data.lpWithdrawable.toString());
                    setShowWithdrawModal(true);
                  }
                }}
                disabled={data.lpWithdrawable <= 0}
              >
                <FontAwesome6 name="arrow-up-from-bracket" size={14} color={data.lpWithdrawable > 0 ? COLORS.background : COLORS.textSecondary} />
                <Text style={[styles.withdrawBtnText, data.lpWithdrawable <= 0 && styles.withdrawBtnTextDisabled]}>
                  撤回LP
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Reward History */}
        <View style={styles.rewardSection}>
          <View style={styles.sectionHeader}>
            <FontAwesome6 name="clock-rotate-left" size={16} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>分红明细</Text>
          </View>

          {/* Filter Tabs */}
          <View style={styles.filterTabs}>
            <TouchableOpacity
              style={[styles.filterTab, rewardFilter === 'all' && styles.filterTabActive]}
              onPress={() => setRewardFilter('all')}
            >
              <Text style={[styles.filterTabText, rewardFilter === 'all' && styles.filterTabTextActive]}>全部</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterTab, rewardFilter === 'node' && styles.filterTabActive]}
              onPress={() => setRewardFilter('node')}
            >
              <Text style={[styles.filterTabText, rewardFilter === 'node' && styles.filterTabTextActive]}>节点分红</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterTab, rewardFilter === 'lp' && styles.filterTabActive]}
              onPress={() => setRewardFilter('lp')}
            >
              <Text style={[styles.filterTabText, rewardFilter === 'lp' && styles.filterTabTextActive]}>做市商分红</Text>
            </TouchableOpacity>
          </View>

          {filteredRewards.length > 0 ? (
            filteredRewards.map((reward) => (
              <View key={reward.id} style={styles.rewardItem}>
                <View style={styles.rewardLeft}>
                  <View style={[
                    styles.rewardIcon,
                    { backgroundColor: reward.currency === 'USDT' ? 'rgba(0,200,151,0.15)' : 'rgba(245,166,35,0.15)' }
                  ]}>
                    <FontAwesome6
                      name={reward.type === 'node' ? 'cubes' : 'droplet'}
                      size={12}
                      color={reward.currency === 'USDT' ? COLORS.success : COLORS.primary}
                    />
                  </View>
                  <View>
                    <Text style={styles.rewardDate}>{reward.date}</Text>
                    <Text style={styles.rewardType}>
                      {reward.type === 'node' ? '节点分红' : '做市商分红'}
                    </Text>
                  </View>
                </View>
                <Text style={[
                  styles.rewardAmount,
                  { color: reward.currency === 'USDT' ? COLORS.success : COLORS.primary }
                ]}>
                  +{reward.amount} {reward.currency}
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyRewards}>
              <FontAwesome6 name="inbox" size={32} color={COLORS.textSecondary} />
              <Text style={styles.emptyRewardsText}>暂无分红记录</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Withdraw LP Modal */}
      <Modal
        visible={showWithdrawModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWithdrawModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>撤回LP</Text>
              <TouchableOpacity onPress={() => setShowWithdrawModal(false)}>
                <FontAwesome6 name="xmark" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalDesc}>
                可撤回额度: <Text style={styles.modalHighlight}>{data?.lpWithdrawable.toFixed(2)} LP</Text>
              </Text>

              <View style={styles.modalInputRow}>
                <TextInput
                  style={styles.modalInput}
                  value={withdrawAmount}
                  onChangeText={setWithdrawAmount}
                  placeholder="输入撤回数量"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="numeric"
                />
                <Text style={styles.modalInputSuffix}>LP</Text>
              </View>

              <View style={styles.modalQuickAmounts}>
                {[25, 50, 75, 100].map((percent) => (
                  <TouchableOpacity
                    key={percent}
                    style={styles.modalQuickBtn}
                    onPress={() => {
                      const amount = ((data?.lpWithdrawable || 0) * percent / 100).toFixed(2);
                      setWithdrawAmount(amount);
                    }}
                  >
                    <Text style={styles.modalQuickText}>{percent}%</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalEstimate}>
                <Text style={styles.modalEstimateLabel}>预计获得:</Text>
                <Text style={styles.modalEstimateValue}>
                  {((parseFloat(withdrawAmount) || 0) * 0.5).toFixed(2)} TFT + {((parseFloat(withdrawAmount) || 0) * 0.5).toFixed(2)} USDT
                </Text>
              </View>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowWithdrawModal(false)}
              >
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, withdrawing && styles.modalConfirmBtnDisabled]}
                onPress={handleWithdrawLP}
                disabled={withdrawing}
              >
                <LinearGradient
                  colors={COLORS.GRADIENT_PRIMARY}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.modalConfirmGradient}
                >
                  {withdrawing ? (
                    <ActivityIndicator color={COLORS.background} size="small" />
                  ) : (
                    <Text style={styles.modalConfirmText}>确认撤回</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statHeader}>
        <View style={[styles.statIconBg, { backgroundColor: `${color}20` }]}>
          <FontAwesome6 name={icon as any} size={12} color={color} />
        </View>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 56, paddingBottom: 120, paddingHorizontal: 16 },
  header: { marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: 0.5 },
  subtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },

  // Stats Grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  statIconBg: {
    width: 24,
    height: 24,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' },
  statValue: { fontSize: 20, fontWeight: '700' },

  // Claim Card
  claimCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  claimInfo: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: 16 },
  claimItem: { alignItems: 'center' },
  claimDivider: { width: 1, height: 30, backgroundColor: COLORS.border },
  claimLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 4 },
  claimValue: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  claimBtn: { borderRadius: 12, overflow: 'hidden' },
  claimBtnDisabled: { opacity: 0.5 },
  claimGradient: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12 },
  claimBtnContent: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  claimBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.background, textAlign: 'center' },

  // Acquire Section
  acquireSection: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary },
  methodTabs: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  methodTab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  methodTabActive: { borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}10` },
  methodTabText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
  methodTabTextActive: { color: COLORS.primary },
  acquireCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  acquireDescRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  acquireDesc: { fontSize: 13, color: COLORS.textSecondary },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
  },
  acquireInput: { flex: 1, fontSize: 16, color: COLORS.textPrimary, paddingVertical: 12, fontWeight: '600' },
  inputSuffix: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
  quickAmounts: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  quickAmountBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickAmountText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' },
  lpEquivalent: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, paddingLeft: 4 },
  lpEquivText: { fontSize: 12, color: COLORS.textSecondary },
  estimateText: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 14, textAlign: 'center' },
  estimateValue: { color: COLORS.primary, fontWeight: '700' },
  acquireBtn: { borderRadius: 12, overflow: 'hidden' },
  acquireBtnDisabled: { opacity: 0.5 },
  acquireBtnGradient: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  acquireBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.background },

  // LP Section
  lpSection: { marginBottom: 20 },
  lpCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  lpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  lpRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lpLabel: { fontSize: 13, color: COLORS.textSecondary },
  lpValue: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  progressBar: {
    height: 6,
    backgroundColor: COLORS.background,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: { height: '100%', borderRadius: 3 },
  lpNextUnlock: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  lpNextText: { fontSize: 12, color: COLORS.textSecondary },
  withdrawBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  withdrawBtnDisabled: { backgroundColor: COLORS.background },
  withdrawBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.background },
  withdrawBtnTextDisabled: { color: COLORS.textSecondary },

  // Reward Section
  rewardSection: { marginBottom: 20 },
  filterTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterTabActive: { borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}15` },
  filterTabText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' },
  filterTabTextActive: { color: COLORS.primary },
  rewardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rewardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rewardIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  rewardDate: { fontSize: 13, color: COLORS.textPrimary, fontWeight: '500' },
  rewardType: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  rewardAmount: { fontSize: 14, fontWeight: '700' },
  emptyRewards: { alignItems: 'center', paddingVertical: 30 },
  emptyRewardsText: { fontSize: 13, color: COLORS.textSecondary, marginTop: 10 },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  modalBody: { marginBottom: 20 },
  modalDesc: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 14, textAlign: 'center' },
  modalHighlight: { color: COLORS.primary, fontWeight: '700' },
  modalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  modalInput: { flex: 1, fontSize: 18, color: COLORS.textPrimary, paddingVertical: 14, fontWeight: '600' },
  modalInputSuffix: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  modalQuickAmounts: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modalQuickBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalQuickText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
  modalEstimate: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 14,
  },
  modalEstimateLabel: { fontSize: 13, color: COLORS.textSecondary },
  modalEstimateValue: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  modalFooter: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  modalConfirmBtn: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  modalConfirmBtnDisabled: { opacity: 0.6 },
  modalConfirmGradient: { paddingVertical: 14, alignItems: 'center' },
  modalConfirmText: { fontSize: 14, fontWeight: '600', color: COLORS.background },
});
