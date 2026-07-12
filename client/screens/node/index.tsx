import React, { useState, useCallback, useEffect } from 'react';
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
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { COLORS } from '@/utils/theme';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || '';

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
  // 节点获取规则
  burnNodePrice: number; // 销毁100000 TFT获得1个节点
  lpNodePrice: number; // 添加50000 TFT + 等值USDT获得1个节点
  tftPrice: number; // 当前TFT价格
  lpUnlockPeriods: number; // LP分50期解锁
  lpUnlockInterval: number; // 每30天解锁一次
  lpUnlockPercentPerPeriod: number; // 每次解锁2%
  // 参与状态
  hasBurned: boolean; // 是否已参与销毁TFT获取节点
  hasAddedLP: boolean; // 是否已参与添加LP获取节点
  rewards: Reward[];
}

type RewardFilter = 'all' | 'node' | 'lp';

export default function NodeScreen() {
  const router = useSafeRouter();
  const { isConnected, connect } = useWallet();
  const [data, setData] = useState<NodeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tftAmount, setTftAmount] = useState('100000');
  const [acquireMethod, setAcquireMethod] = useState<'burn' | 'lp'>('burn');
  const [claiming, setClaiming] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [rewardFilter, setRewardFilter] = useState<RewardFilter>('all');
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [showLPConfirmModal, setShowLPConfirmModal] = useState(false);

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
      // Refresh price every 30 seconds
      const interval = setInterval(fetchData, 30000);
      return () => clearInterval(interval);
    }, [fetchData])
  );

  const handleClaimRewards = async () => {
    if (!isConnected) {
      connect();
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
      connect();
      return;
    }

    // 检查是否已参与过
    if (acquireMethod === 'burn' && data?.hasBurned) {
      Alert.alert('无法参与', '您已参与过销毁TFT获取节点，同一账户只能参与一次');
      return;
    }
    if (acquireMethod === 'lp' && data?.hasAddedLP) {
      Alert.alert('无法参与', '您已参与过添加LP获取节点，同一账户只能参与一次');
      return;
    }

    const amount = parseFloat(tftAmount);
    const minAmount = acquireMethod === 'burn' ? (data?.burnNodePrice || 100000) : (data?.lpNodePrice || 50000);
    
    if (!amount || amount < minAmount) {
      if (acquireMethod === 'burn') {
        Alert.alert('金额无效', `至少需要 ${minAmount.toLocaleString()} TFT`);
      } else {
        Alert.alert('金额无效', `至少需要 ${minAmount.toLocaleString()} TFT + 等值USDT`);
      }
      return;
    }

    // 对于LP方式，显示确认弹窗
    if (acquireMethod === 'lp') {
      setShowLPConfirmModal(true);
      return;
    }

    // 销毁方式直接执行
    await executeAcquireNode();
  };

  const executeAcquireNode = async () => {
    const amount = parseFloat(tftAmount);
    setShowLPConfirmModal(false);
    
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
        if (acquireMethod === 'burn') {
          Alert.alert('销毁成功', `成功销毁 ${amount.toLocaleString()} TFT，获得 ${result.data.nodesAcquired} 个节点！\nTFT已转入黑洞地址，总量减少`);
        } else {
          const usdtEquiv = (amount * (data?.tftPrice || 1)).toFixed(2);
          Alert.alert('添加LP成功', `成功添加 ${amount.toLocaleString()} TFT + ${parseFloat(usdtEquiv).toLocaleString()} USDT LP，获得 ${result.data.nodesAcquired} 个节点！\nLP已锁仓，分50期解锁，每30天解锁2%`);
        }
        fetchData();
      } else {
        Alert.alert('错误', result.error || '获取节点失败，请重试');
      }
    } catch (error) {
      console.error('Acquire node error:', error);
      Alert.alert('错误', '获取节点失败，请重试');
    }
  };

  const handleWithdrawLP = async () => {
    if (!isConnected) {
      connect();
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

  const burnNodePrice = data?.burnNodePrice || 100000;
  const lpNodePrice = data?.lpNodePrice || 100000;
  const estimatedNodes = acquireMethod === 'burn' 
    ? Math.floor((parseFloat(tftAmount) || 0) / burnNodePrice)
    : Math.floor((parseFloat(tftAmount) || 0) / lpNodePrice);

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
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <FontAwesome6 name="arrow-left" size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.title}>节点合伙人</Text>
            <Text style={styles.subtitle}>获取协议收益分红</Text>
          </View>
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
            style={[styles.claimBtn, claiming && styles.claimBtnDisabled]}
            onPress={handleClaimRewards}
            disabled={claiming}
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
              onPress={() => {
                setAcquireMethod('burn');
                setTftAmount('100000');
              }}
            >
              <FontAwesome6 name="fire" size={12} color={acquireMethod === 'burn' ? COLORS.primary : COLORS.textSecondary} />
              <Text style={[styles.methodTabText, acquireMethod === 'burn' && styles.methodTabTextActive]}>
                销毁TFT
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.methodTab, acquireMethod === 'lp' && styles.methodTabActive]}
              onPress={() => {
                setAcquireMethod('lp');
                setTftAmount('100000');
              }}
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
                  <Text style={styles.acquireDesc}>销毁 TFT 立即获得节点</Text>
                </View>
                <View style={styles.ruleBox}>
                  <FontAwesome6 name="circle-info" size={12} color={COLORS.primary} />
                  <Text style={styles.ruleText}>
                    销毁的TFT将转入黑洞地址，永久减少流通量。拥有节点可获得美元和TFT分红。每个账户限参与一次。
                  </Text>
                </View>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.acquireInput}
                    value={tftAmount}
                    onChangeText={(text) => {
                      setTftAmount(text);
                      if (acquireMethod === 'burn') {
                        // 销毁模式默认值为100000
                      }
                    }}
                    placeholder="100000"
                    placeholderTextColor={COLORS.textSecondary}
                    keyboardType="numeric"
                  />
                  <Text style={styles.inputSuffix}>TFT</Text>
                </View>
                <View style={styles.quickAmounts}>
                  {[100000, 200000, 500000, 1000000].map((amount) => (
                    <TouchableOpacity
                      key={amount}
                      style={styles.quickAmountBtn}
                      onPress={() => {
                        setTftAmount(amount.toString());
                        if (acquireMethod === 'burn') {
                          // 更新默认值
                        }
                      }}
                    >
                      <Text style={styles.quickAmountText}>{amount >= 1000000 ? `${amount / 1000000}M` : amount >= 1000 ? `${amount / 1000}K` : amount}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.estimateText}>
                  预计获得: <Text style={styles.estimateValue}>{estimatedNodes}</Text> 个节点
                </Text>
                {/* Transaction Summary */}
                <View style={styles.txSummaryBox}>
                  <View style={styles.txSummaryHeader}>
                    <FontAwesome6 name="fire" size={12} color={COLORS.danger} />
                    <Text style={styles.txSummaryTitle}>交易摘要</Text>
                  </View>
                  <View style={styles.txSummaryContent}>
                    <View style={styles.txSummaryRow}>
                      <Text style={styles.txSummaryLabel}>销毁数量</Text>
                      <Text style={styles.txSummaryValue}>{Number(tftAmount).toLocaleString() || '0'} TFT</Text>
                    </View>
                    <View style={styles.txSummaryRow}>
                      <Text style={styles.txSummaryLabel}>获得节点</Text>
                      <Text style={styles.txSummaryHighlight}>{estimatedNodes} 个</Text>
                    </View>
                    <View style={styles.txSummaryRow}>
                      <Text style={styles.txSummaryLabel}>节点类型</Text>
                      <Text style={styles.txSummaryValue}>永久节点 (立即解锁)</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.acquireBtn, data?.hasBurned && styles.acquireBtnDisabled]}
                  onPress={handleAcquireNode}
                  disabled={!!data?.hasBurned}
                >
                  <LinearGradient
                    colors={isConnected && !data?.hasBurned ? COLORS.GRADIENT_PRIMARY : ['#333', '#444']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.acquireBtnGradient}
                  >
                    <FontAwesome6 name="fire" size={14} color={COLORS.background} />
                    <Text style={styles.acquireBtnText}>
                      {!isConnected ? '连接钱包' : data?.hasBurned ? '已参与过' : '授权并销毁'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.acquireDescRow}>
                  <FontAwesome6 name="droplet" size={14} color={COLORS.success} />
                  <Text style={styles.acquireDesc}>输入 TFT，自动兑换 USDT 添加流动性</Text>
                </View>
                <View style={styles.ruleBox}>
                  <FontAwesome6 name="circle-info" size={12} color={COLORS.primary} />
                  <Text style={styles.ruleText}>
                    系统自动将一半 TFT 兑换为 USDT，与另一半 TFT 一起添加流动性。LP凭证锁仓50期（每期30天，解锁2%）。
                  </Text>
                </View>
                {/* TFT Price Display */}
                <View style={styles.lpPriceBox}>
                  <View style={styles.lpPriceRow}>
                    <Text style={styles.lpPriceLabel}>当前TFT价格</Text>
                    <Text style={styles.lpPriceValue}>1 TFT ≈ {(data?.tftPrice || 0.001).toFixed(4)} USDT</Text>
                  </View>
                  <View style={styles.lpPriceRow}>
                    <Text style={styles.lpPriceLabel}>流程</Text>
                    <Text style={styles.lpPriceExample}>
                      100K TFT → 50K兑换USDT + 50K添加LP = 1 节点
                    </Text>
                  </View>
                </View>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.acquireInput}
                    value={tftAmount}
                    onChangeText={setTftAmount}
                    placeholder="100000"
                    placeholderTextColor={COLORS.textSecondary}
                    keyboardType="numeric"
                  />
                  <Text style={styles.inputSuffix}>TFT</Text>
                </View>
                {/* Auto Swap Breakdown - Transaction Summary */}
                {parseFloat(tftAmount) >= 100000 && (
                  <View style={styles.txSummaryBox}>
                    <View style={styles.txSummaryHeader}>
                      <FontAwesome6 name="arrow-right-arrow-left" size={12} color={COLORS.primary} />
                      <Text style={styles.txSummaryTitle}>交易明细</Text>
                    </View>
                    <View style={styles.txSummaryContent}>
                      <View style={styles.txStep}>
                        <View style={styles.txStepIcon}>
                          <Text style={styles.txStepNum}>1</Text>
                        </View>
                        <View style={styles.txStepContent}>
                          <Text style={styles.txStepLabel}>兑换USDT</Text>
                          <Text style={styles.txStepValue}>{Math.floor(parseFloat(tftAmount) / 2).toLocaleString()} TFT → {(parseFloat(tftAmount) / 2 * (data?.tftPrice || 0.01)).toFixed(2)} USDT</Text>
                        </View>
                      </View>
                      <View style={styles.txStep}>
                        <View style={styles.txStepIcon}>
                          <Text style={styles.txStepNum}>2</Text>
                        </View>
                        <View style={styles.txStepContent}>
                          <Text style={styles.txStepLabel}>添加流动性</Text>
                          <Text style={styles.txStepValue}>{Math.floor(parseFloat(tftAmount) / 2).toLocaleString()} TFT + {(parseFloat(tftAmount) / 2 * (data?.tftPrice || 0.01)).toFixed(2)} USDT</Text>
                        </View>
                      </View>
                      <View style={styles.txStep}>
                        <View style={[styles.txStepIcon, styles.txStepIconSuccess]}>
                          <FontAwesome6 name="check" size={10} color={COLORS.success} />
                        </View>
                        <View style={styles.txStepContent}>
                          <Text style={styles.txStepLabel}>获得节点</Text>
                          <Text style={[styles.txStepValue, styles.txStepValueSuccess]}>{Math.floor((parseFloat(tftAmount) || 0) / 100000)} 个</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.txSummaryFooter}>
                      <Text style={styles.txFooterLabel}>当前TFT价格</Text>
                      <Text style={styles.txFooterValue}>${(data?.tftPrice || 0.01).toFixed(4)}</Text>
                    </View>
                  </View>
                )}
                <View style={styles.quickAmounts}>
                  {[100000, 200000, 500000, 1000000].map((amount) => (
                    <TouchableOpacity
                      key={amount}
                      style={styles.quickAmountBtn}
                      onPress={() => setTftAmount(amount.toString())}
                    >
                      <Text style={styles.quickAmountText}>{amount >= 1000000 ? `${amount / 1000000}M` : amount >= 1000 ? `${amount / 1000}K` : amount}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.estimateText}>
                  预计获得: <Text style={styles.estimateValue}>{estimatedNodes}</Text> 个节点
                </Text>
                <TouchableOpacity
                  style={[styles.acquireBtn, data?.hasAddedLP && styles.acquireBtnDisabled]}
                  onPress={handleAcquireNode}
                  disabled={!!data?.hasAddedLP}
                >
                  <LinearGradient
                    colors={isConnected && !data?.hasAddedLP ? COLORS.GRADIENT_PRIMARY : ['#333', '#444']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.acquireBtnGradient}
                  >
                    <FontAwesome6 name="droplet" size={14} color={COLORS.background} />
                    <Text style={styles.acquireBtnText}>
                      {!isConnected ? '连接钱包' : data?.hasAddedLP ? '已参与过' : '授权并添加LP'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* LP Management - Only show if user has added LP */}
        {data && data.hasAddedLP && (
          <View style={styles.lpSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconBox}>
                <FontAwesome6 name="water" size={14} color={COLORS.success} />
              </View>
              <Text style={styles.sectionTitle}>LP管理</Text>
              <View style={styles.lpBadge}>
                <Text style={styles.lpBadgeText}>锁仓中</Text>
              </View>
            </View>
            
            <View style={styles.lpCard}>
              {/* LP Stats Grid */}
              <View style={styles.lpStatsGrid}>
                <View style={styles.lpStatItem}>
                  <Text style={styles.lpStatLabel}>总锁仓LP</Text>
                  <Text style={styles.lpStatValue}>{data.lpLocked.toLocaleString()}</Text>
                  <Text style={styles.lpStatUnit}>LP</Text>
                </View>
                <View style={styles.lpStatDivider} />
                <View style={styles.lpStatItem}>
                  <Text style={styles.lpStatLabel}>可撤回</Text>
                  <Text style={[styles.lpStatValue, { color: data.lpWithdrawable > 0 ? COLORS.success : COLORS.textSecondary }]}>
                    {data.lpWithdrawable.toFixed(2)}
                  </Text>
                  <Text style={styles.lpStatUnit}>LP</Text>
                </View>
              </View>

              {/* Unlock Progress Section */}
              <View style={styles.unlockSection}>
                <View style={styles.unlockHeader}>
                  <Text style={styles.unlockTitle}>解锁进度</Text>
                  <Text style={styles.unlockPercent}>
                    {data.lpUnlockProgress.total > 0
                      ? ((data.lpUnlockProgress.current / data.lpUnlockProgress.total) * 100).toFixed(0)
                      : '0'}%
                  </Text>
                </View>
                
                {/* Progress Bar */}
                <View style={styles.progressBar}>
                  <View style={styles.progressBg} />
                  <LinearGradient
                    colors={COLORS.GRADIENT_PRIMARY}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[
                      styles.progressFill,
                      { width: data.lpUnlockProgress.total > 0
                        ? `${(data.lpUnlockProgress.current / data.lpUnlockProgress.total) * 100}%`
                        : '0%' }
                    ]}
                  />
                </View>
                
                <View style={styles.unlockInfo}>
                  <Text style={styles.unlockInfoText}>
                    第 {data.lpUnlockProgress.current}/{data.lpUnlockProgress.total} 期
                  </Text>
                  <Text style={styles.unlockInfoText}>
                    每期解锁 {data.lpUnlockPercentPerPeriod}%
                  </Text>
                </View>
              </View>

              {/* Next Unlock Info */}
              <View style={styles.nextUnlockBox}>
                <View style={styles.nextUnlockLeft}>
                  <View style={styles.nextUnlockIcon}>
                    <FontAwesome6 name="clock" size={14} color={COLORS.primary} />
                  </View>
                  <View>
                    <Text style={styles.nextUnlockTitle}>下次解锁</Text>
                    <Text style={styles.nextUnlockTime}>{data.nextUnlockDays} 天后</Text>
                  </View>
                </View>
                <View style={styles.nextUnlockRight}>
                  <Text style={styles.nextUnlockAmount}>{data.nextUnlockAmount} LP</Text>
                </View>
              </View>

              {/* Withdraw Button */}
              <TouchableOpacity
                style={[styles.withdrawBtn, data.lpWithdrawable <= 0 && styles.withdrawBtnDisabled]}
                onPress={() => {
                  if (!isConnected) {
                    connect();
                    return;
                  }
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

      {/* LP Confirmation Modal */}
      <Modal
        visible={showLPConfirmModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLPConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>确认添加LP</Text>
              <TouchableOpacity onPress={() => setShowLPConfirmModal(false)}>
                <FontAwesome6 name="xmark" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.lpConfirmBox}>
                <View style={styles.lpConfirmRow}>
                  <Text style={styles.lpConfirmLabel}>TFT数量</Text>
                  <Text style={styles.lpConfirmValue}>{Math.floor(parseFloat(tftAmount) / 2).toLocaleString()} TFT</Text>
                </View>
                <View style={styles.lpConfirmRow}>
                  <Text style={styles.lpConfirmLabel}>USDT等值</Text>
                  <Text style={styles.lpConfirmValue}>
                    + {(Math.floor(parseFloat(tftAmount) / 2) * (data?.tftPrice || 0.01)).toFixed(2)} USDT
                  </Text>
                </View>
                <View style={styles.lpConfirmDivider} />
                <View style={styles.lpConfirmRow}>
                  <Text style={styles.lpConfirmLabel}>获得节点</Text>
                  <Text style={[styles.lpConfirmValue, { color: COLORS.success }]}>
                    {Math.floor((parseFloat(tftAmount) || 0) / 100000)} 个
                  </Text>
                </View>
              </View>

              <View style={styles.lpLockInfoBox}>
                <View style={styles.lpLockInfoHeader}>
                  <FontAwesome6 name="lock" size={12} color={COLORS.primary} />
                  <Text style={styles.lpLockInfoTitle}>锁仓规则</Text>
                </View>
                <View style={styles.lpLockInfoRow}>
                  <Text style={styles.lpLockInfoText}>锁仓期限</Text>
                  <Text style={styles.lpLockInfoValue}>50期 (约1500天)</Text>
                </View>
                <View style={styles.lpLockInfoRow}>
                  <Text style={styles.lpLockInfoText}>解锁频率</Text>
                  <Text style={styles.lpLockInfoValue}>每30天解锁2%</Text>
                </View>
                <View style={styles.lpLockInfoRow}>
                  <Text style={styles.lpLockInfoText}>首次解锁</Text>
                  <Text style={styles.lpLockInfoValue}>30天后</Text>
                </View>
              </View>

              <View style={styles.lpWarningBox}>
                <FontAwesome6 name="triangle-exclamation" size={12} color={COLORS.primary} />
                <Text style={styles.lpWarningText}>
                  添加LP后，流动性凭证将被锁仓。请确认您了解锁仓规则。
                </Text>
              </View>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowLPConfirmModal(false)}
              >
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={executeAcquireNode}
              >
                <LinearGradient
                  colors={COLORS.GRADIENT_PRIMARY}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.modalConfirmGradient}
                >
                  <Text style={styles.modalConfirmText}>确认添加</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, position: 'relative' },
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
  headerContent: { flex: 1, alignItems: 'center' },
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
  sectionIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${COLORS.success}20`,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  acquireDescRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  acquireDesc: { fontSize: 13, color: COLORS.textSecondary },
  ruleBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: `${COLORS.primary}10`,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
  },
  ruleText: { flex: 1, fontSize: 11, color: COLORS.textSecondary, lineHeight: 16 },
  // LP Price Box
  lpPriceBox: {
    backgroundColor: `${COLORS.success}10`,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: `${COLORS.success}30`,
  },
  lpPriceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lpPriceLabel: { fontSize: 12, color: COLORS.textSecondary },
  lpPriceValue: { fontSize: 14, color: COLORS.success, fontWeight: '600' },
  lpPriceExample: { fontSize: 12, color: COLORS.textPrimary },
  // LP Details Box
  lpDetailsBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  lpDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  lpDetailLabel: { fontSize: 12, color: COLORS.textSecondary },
  lpDetailValue: { fontSize: 12, color: COLORS.textPrimary, fontWeight: '500' },
  lpDetailDivider: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 6, marginTop: 2 },
  lpDetailHighlight: { fontSize: 16, fontWeight: '700', color: COLORS.primary },
  // Transaction Summary Box
  txSummaryBox: {
    backgroundColor: 'rgba(240, 185, 11, 0.05)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(240, 185, 11, 0.2)',
  },
  txSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 6,
  },
  txSummaryTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  txSummaryContent: {
    gap: 10,
  },
  txSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  txSummaryLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  txSummaryValue: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  txSummaryHighlight: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.success,
  },
  txStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  txStepIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(240, 185, 11, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  txStepIconSuccess: {
    backgroundColor: 'rgba(0, 200, 83, 0.15)',
  },
  txStepNum: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
  },
  txStepContent: {
    flex: 1,
  },
  txStepLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  txStepValue: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  txStepValueSuccess: {
    color: COLORS.success,
    fontWeight: '700',
  },
  txSummaryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240, 185, 11, 0.15)',
  },
  txFooterLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  txFooterValue: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },
  // LP Confirm Modal
  lpConfirmBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  lpConfirmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  lpConfirmLabel: { fontSize: 13, color: COLORS.textSecondary },
  lpConfirmValue: { fontSize: 14, color: COLORS.textPrimary, fontWeight: '600' },
  lpConfirmDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 8 },
  // LP Lock Info
  lpLockInfoBox: {
    backgroundColor: `${COLORS.primary}10`,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
  },
  lpLockInfoHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  lpLockInfoTitle: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  lpLockInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  lpLockInfoText: { fontSize: 12, color: COLORS.textSecondary },
  lpLockInfoValue: { fontSize: 12, color: COLORS.textPrimary, fontWeight: '500' },
  // LP Warning
  lpWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: `${COLORS.primary}15`,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
  },
  lpWarningText: { flex: 1, fontSize: 11, color: COLORS.primary, lineHeight: 16 },
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
  lpBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: `${COLORS.success}20`,
  },
  lpBadgeText: { fontSize: 10, color: COLORS.success, fontWeight: '600' },
  lpStatsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.background,
    borderRadius: 12,
  },
  lpStatItem: { flex: 1, alignItems: 'center' },
  lpStatDivider: { width: 1, height: 30, backgroundColor: COLORS.border },
  lpStatLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 4 },
  lpStatValue: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  lpStatUnit: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2 },
  unlockSection: { marginBottom: 16 },
  unlockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  unlockTitle: { fontSize: 13, color: COLORS.textSecondary },
  unlockPercent: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
    position: 'relative',
  },
  progressBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.background,
    borderRadius: 4,
  },
  progressFill: { height: '100%', borderRadius: 4 },
  unlockInfo: { flexDirection: 'row', justifyContent: 'space-between' },
  unlockInfoText: { fontSize: 11, color: COLORS.textSecondary },
  nextUnlockBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: `${COLORS.primary}10`,
    borderRadius: 12,
    marginBottom: 14,
  },
  nextUnlockLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nextUnlockIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${COLORS.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextUnlockTitle: { fontSize: 11, color: COLORS.textSecondary },
  nextUnlockTime: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  nextUnlockRight: { alignItems: 'flex-end' },
  nextUnlockAmount: { fontSize: 16, fontWeight: '700', color: COLORS.primary },
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
