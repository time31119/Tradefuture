import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Modal,
  TextInput,
  Alert,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useWallet } from '@/contexts/WalletContext';
import { useFocusEffect } from 'expo-router';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { COLORS } from '@/utils/theme';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';
const { width } = Dimensions.get('window');

interface OverviewData {
  accountValue: number | null;
  pnl24h: number | null;
  activePositions: number | null;
  volume24h: number;
  insurancePoolBalance: number;
  insurancePoolInjection: number;
}

interface BTCPrice {
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
}

interface KlineItem {
  timestamp: number;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

interface Prediction {
  id: number;
  time: string;
  direction: 'up' | 'down';
  amount: number;
  status: string;
  profit: number;
  round: number;
}

// Overview Card Component with onPress
interface OverviewCardProps {
  label: string;
  value: string;
  icon: string;
  color: string;
  onPress?: () => void;
  valueColor?: string;
}

function OverviewCard({ label, value, icon, color, onPress, valueColor }: OverviewCardProps) {
  return (
    <TouchableOpacity
      style={styles.overviewCard}
      activeOpacity={onPress ? 0.7 : 1}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.overviewCardHeader}>
        <View style={[styles.overviewIconBox, { backgroundColor: color + '1A' }]}>
          <FontAwesome6 name={icon as any} size={14} color={color} />
        </View>
        {onPress && <FontAwesome6 name="chevron-right" size={10} color={COLORS.textSecondary} />}
      </View>
      <Text style={[styles.overviewValue, { color: valueColor || COLORS.textPrimary }]}>{value}</Text>
      <Text style={styles.overviewLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const router = useSafeRouter();
  const { isConnected, wallet, connect } = useWallet();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [btcPrice, setBtcPrice] = useState<BTCPrice | null>(null);
  const [klineData, setKlineData] = useState<KlineItem[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Quick bet modal state
  const [betModalVisible, setBetModalVisible] = useState(false);
  const [betDirection, setBetDirection] = useState<'up' | 'down'>('up');
  const [betAmount, setBetAmount] = useState('100');
  const [betLoading, setBetLoading] = useState(false);

  // Insurance pool modal state
  const [insuranceModalVisible, setInsuranceModalVisible] = useState(false);

  // Claim loading state
  const [claimingId, setClaimingId] = useState<number | null>(null);

  // BTC price auto-refresh interval
  const priceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/dashboard/overview?wallet=${isConnected}`);
      const data = await res.json();
      if (data.success) setOverview(data.data);
    } catch (error) {
      console.error('Fetch overview error:', error);
    }
  }, [isConnected]);

  const fetchPrice = useCallback(async () => {
    try {
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/btc/price`);
      const data = await res.json();
      if (data.success) setBtcPrice(data.data);
    } catch (error) {
      console.error('Fetch price error:', error);
    }
  }, []);

  const fetchKline = useCallback(async () => {
    try {
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/btc/kline?count=20`);
      const data = await res.json();
      if (data.success) setKlineData(data.data);
    } catch (error) {
      console.error('Fetch kline error:', error);
    }
  }, []);

  const fetchPredictions = useCallback(async () => {
    try {
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/predictions`);
      const data = await res.json();
      if (data.success) setPredictions(data.data.predictions.slice(0, 5));
    } catch (error) {
      console.error('Fetch predictions error:', error);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchOverview(), fetchPrice(), fetchKline(), fetchPredictions()]);
    setLoading(false);
  }, [fetchOverview, fetchPrice, fetchKline, fetchPredictions]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  // Auto-refresh BTC price every 30 seconds
  useEffect(() => {
    priceIntervalRef.current = setInterval(() => {
      fetchPrice();
    }, 30000);

    return () => {
      if (priceIntervalRef.current) {
        clearInterval(priceIntervalRef.current);
      }
    };
  }, [fetchPrice]);

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchOverview(), fetchPrice(), fetchKline(), fetchPredictions()]);
    setRefreshing(false);
  }, [fetchOverview, fetchPrice, fetchKline, fetchPredictions]);

  const formatNumber = (num: number, decimals = 2) => {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatCompact = (num: number) => {
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
    return `$${num.toFixed(2)}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'won': return COLORS.success;
      case 'lost': return COLORS.danger;
      case 'pending': return COLORS.primary;
      case 'claimed': return COLORS.textSecondary;
      default: return COLORS.textSecondary;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'won': return '获胜';
      case 'lost': return '失败';
      case 'pending': return '待结算';
      case 'claimed': return '已领取';
      default: return status;
    }
  };

  // Navigation handlers
  const handleCardPress = (type: 'account' | 'pnl' | 'positions' | 'volume') => {
    switch (type) {
      case 'account':
      case 'pnl':
        router.push('/profile');
        break;
      case 'positions':
      case 'volume':
        router.push('/predict');
        break;
    }
  };

  // Quick bet handlers
  const openBetModal = (direction: 'up' | 'down') => {
    if (!isConnected) {
      connect();
      return;
    }
    setBetDirection(direction);
    setBetAmount('100');
    setBetModalVisible(true);
  };

  const handleQuickBet = async () => {
    const amount = parseFloat(betAmount);
    if (!amount || amount < 1) {
      Alert.alert('提示', '最低投注金额为 1 USDT');
      return;
    }

    setBetLoading(true);
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/predictions
       * Body 参数：direction: 'up' | 'down', amount: number
       */
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/predictions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: betDirection, amount }),
      });
      const data = await res.json();

      if (data.success) {
        Alert.alert('提交成功', `${betDirection === 'up' ? '看涨' : '看跌'} $${amount} USDT 已提交`);
        setBetModalVisible(false);
        fetchPredictions();
        fetchOverview();
      } else {
        Alert.alert('提交失败', data.error || '请稍后重试');
      }
    } catch (error) {
      console.error('Quick bet error:', error);
      Alert.alert('错误', '网络错误，请稍后重试');
    } finally {
      setBetLoading(false);
    }
  };

  // Claim handler
  const handleClaim = async (predictionId: number) => {
    if (!isConnected) {
      connect();
      return;
    }

    setClaimingId(predictionId);
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/predictions/:id/claim
       * Path 参数：id: number
       */
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/predictions/${predictionId}/claim`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.success) {
        Alert.alert('领取成功', `收益已到账`);
        fetchPredictions();
        fetchOverview();
      } else {
        Alert.alert('领取失败', data.error || '请稍后重试');
      }
    } catch (error) {
      console.error('Claim error:', error);
      Alert.alert('错误', '网络错误，请稍后重试');
    } finally {
      setClaimingId(null);
    }
  };

  // Estimated odds calculation
  const getEstimatedOdds = (direction: 'up' | 'down') => {
    return direction === 'up' ? 1.82 : 2.18;
  };

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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <FontAwesome6 name="chart-line" size={20} color={COLORS.primary} />
            <Text style={styles.headerTitle}>TradeFuture</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.notificationBtn}>
              <FontAwesome6 name="bell" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
            {isConnected ? (
              <TouchableOpacity
                style={styles.walletBadge}
                onPress={() => router.push('/profile')}
              >
                <View style={styles.walletDot} />
                <Text style={styles.walletText}>{wallet?.shortAddress}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.connectBtn} onPress={connect}>
                <Text style={styles.connectBtnText}>连接</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Overview Cards - Clickable */}
        <View style={styles.overviewGrid}>
          <OverviewCard
            label="账户总值"
            value={isConnected && overview?.accountValue ? `$${formatNumber(overview.accountValue)}` : '--'}
            icon="wallet"
            color={COLORS.primary}
            onPress={() => handleCardPress('account')}
          />
          <OverviewCard
            label="24h盈亏"
            value={isConnected && overview?.pnl24h !== null && overview?.pnl24h !== undefined ? `${overview.pnl24h >= 0 ? '+' : ''}$${formatNumber(overview.pnl24h)}` : '--'}
            icon="arrow-trend-up"
            color={isConnected && overview?.pnl24h && overview.pnl24h >= 0 ? COLORS.success : COLORS.danger}
            valueColor={isConnected && overview?.pnl24h ? (overview.pnl24h >= 0 ? COLORS.success : COLORS.danger) : COLORS.textPrimary}
            onPress={() => handleCardPress('pnl')}
          />
          <OverviewCard
            label="活跃持仓"
            value={isConnected && overview?.activePositions !== null && overview?.activePositions !== undefined ? `${overview.activePositions}` : '--'}
            icon="layer-group"
            color={COLORS.primary}
            onPress={() => handleCardPress('positions')}
          />
          <OverviewCard
            label="24h交易量"
            value={overview ? formatCompact(overview.volume24h) : '--'}
            icon="chart-bar"
            color={COLORS.primaryLight}
            onPress={() => handleCardPress('volume')}
          />
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>快捷操作</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickActionBtn}
              activeOpacity={0.8}
              onPress={() => openBetModal('up')}
            >
              <LinearGradient
                colors={[COLORS.success, '#00A87E']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.quickActionGradient}
              >
                <FontAwesome6 name="arrow-trend-up" size={18} color="#fff" />
                <Text style={styles.quickActionText}>看涨</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickActionBtn}
              activeOpacity={0.8}
              onPress={() => openBetModal('down')}
            >
              <LinearGradient
                colors={[COLORS.danger, '#E05555']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.quickActionGradient}
              >
                <FontAwesome6 name="arrow-trend-down" size={18} color="#fff" />
                <Text style={styles.quickActionText}>看跌</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickActionBtn}
              activeOpacity={0.8}
              onPress={() => router.push('/predict')}
            >
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryLight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.quickActionGradient}
              >
                <FontAwesome6 name="bolt" size={18} color="#fff" />
                <Text style={styles.quickActionText}>快速</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* BTC Price + Chart */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>BTC/USDT</Text>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>实时</Text>
            </View>
          </View>
          <View style={styles.priceCard}>
            <View style={styles.priceHeader}>
              <Text style={styles.priceValue}>
                ${btcPrice ? formatNumber(btcPrice.price) : '--'}
              </Text>
              <View style={[
                styles.priceChange,
                { backgroundColor: btcPrice && btcPrice.change24h >= 0 ? COLORS.success + '1A' : COLORS.danger + '1A' }
              ]}>
                <FontAwesome6
                  name={btcPrice && btcPrice.change24h >= 0 ? 'caret-up' : 'caret-down'}
                  size={10}
                  color={btcPrice && btcPrice.change24h >= 0 ? COLORS.success : COLORS.danger}
                />
                <Text style={[
                  styles.priceChangeText,
                  { color: btcPrice && btcPrice.change24h >= 0 ? COLORS.success : COLORS.danger }
                ]}>
                  {btcPrice ? `${btcPrice.change24h >= 0 ? '+' : ''}${btcPrice.change24h.toFixed(2)}%` : '--'}
                </Text>
              </View>
            </View>
            <View style={styles.priceMeta}>
              <Text style={styles.priceMetaItem}>高: ${btcPrice ? formatNumber(btcPrice.high24h) : '--'}</Text>
              <Text style={styles.priceMetaItem}>低: ${btcPrice ? formatNumber(btcPrice.low24h) : '--'}</Text>
            </View>
            {/* Mini Chart */}
            <View style={styles.chartContainer}>
              {klineData.length > 0 ? (
                <MiniChart data={klineData} />
              ) : (
                <View style={styles.chartPlaceholder}>
                  <Text style={styles.chartPlaceholderText}>加载图表中...</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Insurance Pool - Clickable */}
        <TouchableOpacity
          style={styles.insuranceBar}
          activeOpacity={0.8}
          onPress={() => setInsuranceModalVisible(true)}
        >
          <View style={styles.insuranceLeft}>
            <View style={styles.insuranceIconBox}>
              <FontAwesome6 name="shield-halved" size={14} color={COLORS.primary} />
            </View>
            <View>
              <Text style={styles.insuranceLabel}>保险仓总余额</Text>
              <Text style={styles.insuranceValue}>
                {overview ? formatNumber(overview.insurancePoolBalance, 0) : '--'} TFT
              </Text>
            </View>
          </View>
          <View style={styles.insuranceRight}>
            <Text style={styles.insuranceInjectLabel}>本轮注入</Text>
            <Text style={styles.insuranceInjectValue}>
              {overview ? formatNumber(overview.insurancePoolInjection, 0) : '--'} TFT
            </Text>
          </View>
          <FontAwesome6 name="chevron-right" size={12} color={COLORS.textSecondary} style={{ marginLeft: 8 }} />
        </TouchableOpacity>

        {/* Recent Predictions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>最近预测</Text>
            <TouchableOpacity onPress={() => router.push('/predict')}>
              <Text style={styles.viewAllText}>查看全部</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.predictionsCard}>
            {predictions.length === 0 ? (
              <View style={styles.emptyState}>
                <FontAwesome6 name="clock-rotate-left" size={24} color={COLORS.textSecondary} />
                <Text style={styles.emptyText}>暂无预测记录</Text>
                <TouchableOpacity
                  style={styles.emptyActionBtn}
                  onPress={() => router.push('/predict')}
                >
                  <Text style={styles.emptyActionText}>去预测</Text>
                </TouchableOpacity>
              </View>
            ) : (
              predictions.map((pred) => (
                <View key={pred.id} style={styles.predictionRow}>
                  <View style={styles.predictionLeft}>
                    <View style={[
                      styles.directionBadge,
                      { backgroundColor: pred.direction === 'up' ? COLORS.success + '1A' : COLORS.danger + '1A' }
                    ]}>
                      <FontAwesome6
                        name={pred.direction === 'up' ? 'arrow-trend-up' : 'arrow-trend-down'}
                        size={10}
                        color={pred.direction === 'up' ? COLORS.success : COLORS.danger}
                      />
                      <Text style={[
                        styles.directionText,
                        { color: pred.direction === 'up' ? COLORS.success : COLORS.danger }
                      ]}>
                        {pred.direction === 'up' ? '涨' : '跌'}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.predictionAmount}>${pred.amount}</Text>
                      <Text style={styles.predictionTime}>{pred.time}</Text>
                    </View>
                  </View>
                  <View style={styles.predictionRight}>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(pred.status) + '1A' }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(pred.status) }]}>
                        {getStatusLabel(pred.status)}
                      </Text>
                    </View>
                    {pred.status === 'won' && (
                      <Text style={styles.profitText}>+${pred.profit}</Text>
                    )}
                    {pred.status === 'won' && (
                      <TouchableOpacity
                        style={styles.claimBtn}
                        onPress={() => handleClaim(pred.id)}
                        disabled={claimingId === pred.id}
                      >
                        {claimingId === pred.id ? (
                          <ActivityIndicator size="small" color={COLORS.primary} />
                        ) : (
                          <Text style={styles.claimBtnText}>领取</Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Quick Bet Modal */}
      <Modal
        visible={betModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBetModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setBetModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {betDirection === 'up' ? '看涨' : '看跌'}投注
              </Text>
              <TouchableOpacity onPress={() => setBetModalVisible(false)}>
                <FontAwesome6 name="xmark" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {/* Direction indicator */}
              <View style={[
                styles.modalDirectionBadge,
                { backgroundColor: betDirection === 'up' ? COLORS.success + '1A' : COLORS.danger + '1A' }
              ]}>
                <FontAwesome6
                  name={betDirection === 'up' ? 'arrow-trend-up' : 'arrow-trend-down'}
                  size={16}
                  color={betDirection === 'up' ? COLORS.success : COLORS.danger}
                />
                <Text style={[
                  styles.modalDirectionText,
                  { color: betDirection === 'up' ? COLORS.success : COLORS.danger }
                ]}>
                  {betDirection === 'up' ? '看涨' : '看跌'}
                </Text>
              </View>

              {/* Amount input */}
              <Text style={styles.inputLabel}>投注金额 (USDT)</Text>
              <TextInput
                style={styles.amountInput}
                value={betAmount}
                onChangeText={setBetAmount}
                keyboardType="numeric"
                placeholder="输入金额"
                placeholderTextColor={COLORS.textSecondary}
              />

              {/* Quick amounts */}
              <View style={styles.quickAmounts}>
                {[50, 100, 500, 1000].map((amt) => (
                  <TouchableOpacity
                    key={amt}
                    style={[
                      styles.quickAmountBtn,
                      betAmount === String(amt) && styles.quickAmountBtnActive
                    ]}
                    onPress={() => setBetAmount(String(amt))}
                  >
                    <Text style={[
                      styles.quickAmountText,
                      betAmount === String(amt) && styles.quickAmountTextActive
                    ]}>
                      ${amt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Estimated return */}
              <View style={styles.estimateBox}>
                <Text style={styles.estimateLabel}>预估赔率</Text>
                <Text style={styles.estimateValue}>{getEstimatedOdds(betDirection).toFixed(2)}x</Text>
              </View>
              <View style={styles.estimateBox}>
                <Text style={styles.estimateLabel}>预估收益</Text>
                <Text style={[styles.estimateValue, { color: COLORS.success }]}>
                  ${betAmount ? (parseFloat(betAmount) * getEstimatedOdds(betDirection)).toFixed(2) : '0.00'} USDT
                </Text>
              </View>

              {/* Insurance info */}
              <View style={styles.insuranceInfo}>
                <FontAwesome6 name="shield-halved" size={12} color={COLORS.primary} />
                <Text style={styles.insuranceInfoText}>
                  20%下注额将买入TFT作为保险赔付
                </Text>
              </View>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setBetModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { opacity: betLoading ? 0.6 : 1 }]}
                onPress={handleQuickBet}
                disabled={betLoading}
              >
                {betLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitText}>确认投注</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Insurance Pool Detail Modal */}
      <Modal
        visible={insuranceModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInsuranceModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setInsuranceModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.insuranceModalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>保险仓详情</Text>
              <TouchableOpacity onPress={() => setInsuranceModalVisible(false)}>
                <FontAwesome6 name="xmark" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.insuranceModalBody}>
              <View style={styles.insuranceStatRow}>
                <Text style={styles.insuranceStatLabel}>保险仓总余额</Text>
                <Text style={styles.insuranceStatValue}>
                  {overview ? formatNumber(overview.insurancePoolBalance, 0) : '--'} TFT
                </Text>
              </View>
              <View style={styles.insuranceStatRow}>
                <Text style={styles.insuranceStatLabel}>本轮保险注入</Text>
                <Text style={styles.insuranceStatValue}>
                  {overview ? formatNumber(overview.insurancePoolInjection, 0) : '--'} TFT
                </Text>
              </View>
              <View style={styles.insuranceStatRow}>
                <Text style={styles.insuranceStatLabel}>注入比例</Text>
                <Text style={[styles.insuranceStatValue, { color: COLORS.primary }]}>20%</Text>
              </View>
              <View style={styles.insuranceDivider} />
              <Text style={styles.insuranceDesc}>
                保险仓机制：每笔预测的20%下注额将自动买入TFT并注入保险仓。当用户预测失败时，可从保险仓获得一定比例的赔付，降低损失风险。
              </Text>
            </View>

            <TouchableOpacity
              style={styles.insuranceModalBtn}
              onPress={() => setInsuranceModalVisible(false)}
            >
              <Text style={styles.insuranceModalBtnText}>我知道了</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </Screen>
  );
}

// Mini Chart Component
interface MiniChartProps {
  data: KlineItem[];
}

function MiniChart({ data }: MiniChartProps) {
  const chartWidth = width - 48;
  const chartHeight = 100;
  const barWidth = (chartWidth - 20) / data.length;

  const maxPrice = Math.max(...data.map(d => d.high));
  const minPrice = Math.min(...data.map(d => d.low));
  const priceRange = maxPrice - minPrice || 1;

  return (
    <View style={miniChartStyles.container}>
      <View style={[miniChartStyles.chart, { width: chartWidth, height: chartHeight }]}>
        {data.map((item, index) => {
          const isUp = item.close >= item.open;
          const color = isUp ? COLORS.success : COLORS.danger;

          const highY = ((maxPrice - item.high) / priceRange) * (chartHeight - 10);
          const lowY = ((maxPrice - item.low) / priceRange) * (chartHeight - 10);
          const openY = ((maxPrice - item.open) / priceRange) * (chartHeight - 10);
          const closeY = ((maxPrice - item.close) / priceRange) * (chartHeight - 10);

          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.max(Math.abs(closeY - openY), 2);

          return (
            <View
              key={index}
              style={[
                miniChartStyles.candle,
                { left: index * barWidth + 2, width: barWidth - 2 }
              ]}
            >
              {/* Wick */}
              <View style={[
                miniChartStyles.wick,
                {
                  position: 'absolute',
                  left: (barWidth - 4) / 2,
                  top: highY,
                  height: lowY - highY,
                  width: 1.5,
                  backgroundColor: color,
                }
              ]} />
              {/* Body */}
              <View style={[
                miniChartStyles.body,
                {
                  position: 'absolute',
                  left: (barWidth - 6) / 2,
                  top: bodyTop,
                  height: bodyHeight,
                  width: 6,
                  backgroundColor: color,
                  borderRadius: 1,
                }
              ]} />
            </View>
          );
        })}
      </View>
      {/* Time labels */}
      <View style={[miniChartStyles.timeLabels, { width: chartWidth }]}>
        {data.filter((_, i) => i % 5 === 0).map((item, i) => (
          <Text key={i} style={miniChartStyles.timeLabel}>
            {new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        ))}
      </View>
    </View>
  );
}

const miniChartStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  chart: {
    position: 'relative',
  },
  candle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  wick: {},
  body: {},
  timeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  timeLabel: {
    fontSize: 9,
    color: COLORS.textSecondary,
  },
});

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notificationBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  walletBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
  },
  walletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
  },
  walletText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  connectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
  },
  connectBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  // Overview Grid
  overviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  overviewCard: {
    width: (width - 48) / 2,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  overviewCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  overviewIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overviewValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  overviewLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  // Section
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
  },
  liveText: {
    fontSize: 10,
    color: COLORS.success,
    fontWeight: '600',
  },
  // Quick Actions
  quickActions: {
    flexDirection: 'row',
    gap: 10,
  },
  quickActionBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  quickActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  // Price Card
  priceCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  priceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priceValue: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  priceChange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  priceChangeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  priceMeta: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  priceMetaItem: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  chartContainer: {
    height: 120,
    justifyContent: 'center',
  },
  chartPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartPlaceholderText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  // Insurance Bar
  insuranceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  insuranceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  insuranceIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.primary + '1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  insuranceLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  insuranceValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  insuranceRight: {
    alignItems: 'flex-end',
  },
  insuranceInjectLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  insuranceInjectValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  // Predictions
  viewAllText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
  },
  predictionsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  emptyActionBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  emptyActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  predictionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  predictionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  directionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  directionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  predictionAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  predictionTime: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  predictionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  profitText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.success,
  },
  claimBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
    minWidth: 44,
    alignItems: 'center',
  },
  claimBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  modalBody: {
    padding: 16,
  },
  modalDirectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
  },
  modalDirectionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  amountInput: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  quickAmounts: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  quickAmountBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickAmountBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '1A',
  },
  quickAmountText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  quickAmountTextActive: {
    color: COLORS.primary,
  },
  estimateBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  estimateLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  estimateValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  insuranceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: COLORS.primary + '0D',
  },
  insuranceInfoText: {
    fontSize: 11,
    color: COLORS.primary,
    flex: 1,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  modalSubmitBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  // Insurance Modal
  insuranceModalContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    margin: 24,
    marginTop: 'auto',
    marginBottom: 'auto',
  },
  insuranceModalBody: {
    padding: 16,
  },
  insuranceStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  insuranceStatLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  insuranceStatValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  insuranceDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },
  insuranceDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  insuranceModalBtn: {
    margin: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  insuranceModalBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
