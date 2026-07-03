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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useWallet } from '@/contexts/WalletContext';
import { useFocusEffect } from 'expo-router';
import { COLORS } from '@/utils/theme';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';

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
  rewards: Array<{
    id: number;
    date: string;
    amount: number;
    currency: string;
    type: string;
  }>;
}

export default function NodeScreen() {
  const { isConnected } = useWallet();
  const [data, setData] = useState<NodeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tftAmount, setTftAmount] = useState('5000');
  const [acquireMethod, setAcquireMethod] = useState<'burn' | 'lp'>('burn');
  const [claiming, setClaiming] = useState(false);

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
        Alert.alert('成功', `已领取 ${result.data.claimedUSDT} USDT + ${result.data.claimedTFT} TFT`);
        fetchData();
      }
    } catch (error) {
      console.error('Claim error:', error);
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
    }
  };

  const estimatedNodes = Math.floor((parseFloat(tftAmount) || 0) / 5000);

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
    <Screen backgroundColor={COLORS.background} statusBarStyle="light" safeAreaEdges={['left', 'right']}>
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
            <View>
              <Text style={styles.claimLabel}>待领USDT</Text>
              <Text style={styles.claimValue}>${data?.pendingRewardsUSDT?.toFixed(2) || '0.00'}</Text>
            </View>
            <View>
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
                <Text style={styles.claimBtnText}>
                  {!isConnected ? '连接钱包' : '一键领取所有收益'}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Acquire Node */}
        <View style={styles.acquireSection}>
          <Text style={styles.sectionTitle}>获取节点</Text>

          {/* Method Tabs */}
          <View style={styles.methodTabs}>
            <TouchableOpacity
              style={[styles.methodTab, acquireMethod === 'burn' && styles.methodTabActive]}
              onPress={() => setAcquireMethod('burn')}
            >
              <Text style={[styles.methodTabText, acquireMethod === 'burn' && styles.methodTabTextActive]}>
                销毁TFT
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.methodTab, acquireMethod === 'lp' && styles.methodTabActive]}
              onPress={() => setAcquireMethod('lp')}
            >
              <Text style={[styles.methodTabText, acquireMethod === 'lp' && styles.methodTabTextActive]}>
                添加LP
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.acquireCard}>
            {acquireMethod === 'burn' ? (
              <>
                <Text style={styles.acquireDesc}>销毁 5000 TFT 获得 1 个节点</Text>
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
                <Text style={styles.estimateText}>
                  Estimated: {estimatedNodes} 个节点
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
                    <Text style={styles.acquireBtnText}>
                      {!isConnected ? '连接钱包' : '授权并销毁'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.acquireDesc}>添加等值TFT+USDT LP获得节点</Text>
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
                  <Text style={styles.lpEquivText}>≈ 2500 USDT (自动计算)</Text>
                </View>
                <Text style={styles.estimateText}>
                  Estimated: {estimatedNodes} 个节点
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
            <Text style={styles.sectionTitle}>LP管理</Text>
            <View style={styles.lpCard}>
              <View style={styles.lpRow}>
                <Text style={styles.lpLabel}>总锁仓LP</Text>
                <Text style={styles.lpValue}>{data.lpLocked.toLocaleString()} LP</Text>
              </View>
              <View style={styles.lpRow}>
                <Text style={styles.lpLabel}>可撤回</Text>
                <Text style={[styles.lpValue, { color: data.lpWithdrawable > 0 ? COLORS.success : COLORS.textSecondary }]}>
                  {data.lpWithdrawable.toFixed(2)} LP
                </Text>
              </View>
              <View style={styles.lpRow}>
                <Text style={styles.lpLabel}>解锁进度</Text>
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
                <Text style={styles.lpNextText}>
                  下次解锁: {data.nextUnlockAmount} LP ({data.nextUnlockDays}天后)
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.withdrawBtn, data.lpWithdrawable <= 0 && styles.withdrawBtnDisabled]}
                disabled={data.lpWithdrawable <= 0}
              >
                <Text style={[styles.withdrawBtnText, data.lpWithdrawable <= 0 && styles.withdrawBtnTextDisabled]}>
                  撤回LP
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Reward History */}
        <View style={styles.rewardSection}>
          <Text style={styles.sectionTitle}>最近分红</Text>
          {data?.rewards.map((reward) => (
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
                    {reward.type === 'node' ? '节点分红' : 'LP分红'}
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
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statHeader}>
        <FontAwesome6 name={icon as any} size={12} color={color} />
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 56, paddingBottom: 100, paddingHorizontal: 16 },
  header: { marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
  subtitle: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  // Stats Grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: {
    width: '48%',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexGrow: 1,
  },
  statHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' },
  statValue: { fontSize: 18, fontWeight: '700', fontFamily: 'monospace' },
  // Claim Card
  claimCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  claimInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  claimLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 4 },
  claimValue: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary, fontFamily: 'monospace' },
  claimBtn: { borderRadius: 10, overflow: 'hidden' },
  claimBtnDisabled: { opacity: 0.6 },
  claimGradient: { paddingVertical: 14, alignItems: 'center', borderRadius: 10 },
  claimBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.background, letterSpacing: 0.5 },
  // Acquire Section
  acquireSection: { marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 12 },
  methodTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  methodTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  methodTabActive: { borderColor: COLORS.primary, backgroundColor: 'rgba(245,166,35,0.1)' },
  methodTabText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  methodTabTextActive: { color: COLORS.primary },
  acquireCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  acquireDesc: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 12 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  acquireInput: { flex: 1, padding: 14, fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, fontFamily: 'monospace' },
  inputSuffix: { paddingRight: 14, fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  lpEquivalent: { marginBottom: 8 },
  lpEquivText: { fontSize: 12, color: COLORS.textSecondary },
  estimateText: { fontSize: 13, color: COLORS.primary, fontWeight: '600', marginBottom: 14 },
  acquireBtn: { borderRadius: 10, overflow: 'hidden' },
  acquireBtnDisabled: { opacity: 0.6 },
  acquireBtnGradient: { paddingVertical: 14, alignItems: 'center', borderRadius: 10 },
  acquireBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.background, letterSpacing: 0.5 },
  // LP Section
  lpSection: { marginBottom: 16 },
  lpCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  lpRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  lpLabel: { fontSize: 13, color: COLORS.textSecondary },
  lpValue: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary, fontFamily: 'monospace' },
  progressBar: {
    height: 6,
    backgroundColor: COLORS.background,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: { height: '100%', borderRadius: 3 },
  lpNextUnlock: { marginBottom: 12 },
  lpNextText: { fontSize: 12, color: COLORS.textSecondary },
  withdrawBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  withdrawBtnDisabled: { borderColor: COLORS.border },
  withdrawBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  withdrawBtnTextDisabled: { color: COLORS.textSecondary },
  // Rewards
  rewardSection: { marginBottom: 20 },
  rewardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  rewardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rewardIcon: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  rewardDate: { fontSize: 12, color: COLORS.textSecondary, fontFamily: 'monospace' },
  rewardType: { fontSize: 12, color: COLORS.textPrimary, fontWeight: '500' },
  rewardAmount: { fontSize: 14, fontWeight: '700', fontFamily: 'monospace' },
});
