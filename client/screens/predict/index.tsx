import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Dimensions,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useWallet } from '@/contexts/WalletContext';
import { useFocusEffect } from 'expo-router';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { COLORS } from '@/utils/theme';
// Chart data is rendered using simple bar visualization

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';
const { width } = Dimensions.get('window');

interface Prediction {
  id: number;
  time: string;
  direction: 'up' | 'down';
  amount: number;
  status: string;
  profit: number;
  round: number;
}

interface PredictionData {
  predictions: Prediction[];
  currentRound: number;
  timeLeftSeconds: number;
  oddsUp: number;
  oddsDown: number;
  participationCount: number;
  maxParticipation: number;
  isVIP: boolean;
  insurancePoolBalance: number;
  currentRoundInsurance: number;
  usdtBalance: number;
}

interface KlineData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface BtcPrice {
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
}

export default function PredictScreen() {
  const { isConnected } = useWallet();
  const router = useSafeRouter();
  const [data, setData] = useState<PredictionData | null>(null);
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const [amount, setAmount] = useState('');
  const [filter, setFilter] = useState('all');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [btcPrice, setBtcPrice] = useState<BtcPrice | null>(null);
  const [klines, setKlines] = useState<KlineData[]>([]);
  const [countdown, setCountdown] = useState(0);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/predictions`);
      const result = await res.json();
      if (result.success) {
        setData(result.data);
        setCountdown(result.data.timeLeftSeconds);
      }
    } catch (error) {
      console.error('Fetch predictions error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBtcPrice = useCallback(async () => {
    try {
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/btc/price`);
      const result = await res.json();
      if (result.success) {
        setBtcPrice(result.data);
      }
    } catch (error) {
      console.error('Fetch BTC price error:', error);
    }
  }, []);

  const fetchKlines = useCallback(async () => {
    try {
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/btc/kline?count=20`);
      const result = await res.json();
      if (result.success) {
        setKlines(result.data);
      }
    } catch (error) {
      console.error('Fetch klines error:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
      fetchBtcPrice();
      fetchKlines();
    }, [fetchData, fetchBtcPrice, fetchKlines])
  );

  // Countdown timer
  useEffect(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchData();
          return 300;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [fetchData]);

  // Auto refresh BTC price every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchBtcPrice();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchBtcPrice]);

  const handleSubmit = async () => {
    if (!isConnected) {
      Alert.alert('需要钱包', '请先连接钱包');
      return;
    }
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum < 1) {
      Alert.alert('金额无效', '最低投注额为 1 USDT');
      return;
    }
    if (amountNum > (data?.usdtBalance || 0)) {
      Alert.alert('余额不足', 'USDT余额不足');
      return;
    }
    setConfirmModalVisible(true);
  };

  const confirmSubmit = async () => {
    setConfirmModalVisible(false);
    setSubmitting(true);
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/predictions
       * Body 参数：direction: string, amount: number
       */
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/predictions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction, amount: parseFloat(amount) }),
      });
      const result = await res.json();
      if (result.success) {
        setAmount('');
        fetchData();
        Alert.alert('提交成功', '预测已提交，等待结算！');
      }
    } catch (error) {
      console.error('Submit prediction error:', error);
      Alert.alert('提交失败', '请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaim = async (id: number) => {
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/predictions/:id/claim
       * Path 参数：id: number
       */
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/predictions/${id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await res.json();
      if (result.success) {
        fetchData();
        Alert.alert('领取成功', '收益已到账！');
      }
    } catch (error) {
      console.error('Claim error:', error);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const formatPrice = (price: number) => {
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const currentOdds = direction === 'up' ? (data?.oddsUp || 1.8) : (data?.oddsDown || 2.2);
  const amountNum = parseFloat(amount) || 0;
  const estimatedReturn = (amountNum * currentOdds).toFixed(2);
  const netProfit = (amountNum * currentOdds - amountNum).toFixed(2);
  const insuranceAmount = (amountNum * 0.2).toFixed(2);

  const filteredPredictions = data?.predictions.filter(p => {
    if (filter === 'all') return true;
    return p.status === filter;
  }) || [];

  const quickAmounts = [50, 100, 500, 1000];

  const chartData = klines.map((k) => ({
    value: k.close,
    label: k.time.slice(-5),
  }));

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
        {/* Title Bar with Countdown */}
        <View style={styles.titleBar}>
          <View>
            <Text style={styles.title}>BTC/USDT 预测</Text>
            <Text style={styles.subtitle}>5分钟K线 · 第 #{data?.currentRound} 期</Text>
          </View>
          <View style={styles.timerBadge}>
            <FontAwesome6 name="clock" size={12} color={COLORS.primary} />
            <Text style={styles.timerText}>{formatTime(countdown)}</Text>
          </View>
        </View>

        {/* BTC Price Card */}
        {btcPrice && (
          <View style={styles.priceCard}>
            <View style={styles.priceHeader}>
              <Text style={styles.priceLabel}>BTC/USD</Text>
              <Text style={[
                styles.changeBadge,
                { backgroundColor: btcPrice.change24h >= 0 ? 'rgba(0,200,151,0.15)' : 'rgba(255,107,107,0.15)' }
              ]}>
                {btcPrice.change24h >= 0 ? '+' : ''}{btcPrice.change24h.toFixed(2)}%
              </Text>
            </View>
            <Text style={styles.priceValue}>${formatPrice(btcPrice.price)}</Text>
            <View style={styles.priceRange}>
              <Text style={styles.rangeText}>高: ${formatPrice(btcPrice.high24h)}</Text>
              <Text style={styles.rangeText}>低: ${formatPrice(btcPrice.low24h)}</Text>
            </View>
            {/* Price Chart - Simple Bar Visualization */}
            {chartData.length > 0 && (
              <View style={styles.chartContainer}>
                <View style={styles.miniChart}>
                  {chartData.slice(-15).map((item, index) => {
                    const maxVal = Math.max(...chartData.slice(-15).map(d => d.value));
                    const minVal = Math.min(...chartData.slice(-15).map(d => d.value));
                    const range = maxVal - minVal || 1;
                    const height = ((item.value - minVal) / range) * 60 + 20;
                    const isUp = index > 0 ? item.value >= chartData.slice(-15)[index - 1].value : true;
                    return (
                      <View
                        key={index}
                        style={[
                          styles.miniChartBar,
                          {
                            height,
                            backgroundColor: isUp ? 'rgba(0,200,151,0.6)' : 'rgba(255,107,107,0.6)',
                          }
                        ]}
                      />
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Betting Panel */}
        <View style={styles.betPanel}>
          <Text style={styles.betLabel}>选择方向</Text>
          <View style={styles.directionRow}>
            <TouchableOpacity
              style={[styles.directionBtn, direction === 'up' && styles.directionBtnActiveUp]}
              onPress={() => setDirection('up')}
            >
              <LinearGradient
                colors={direction === 'up' ? ['rgba(0,200,151,0.2)', 'rgba(0,200,151,0.05)'] : ['transparent', 'transparent']}
                style={styles.directionGradient}
              >
                <FontAwesome6 name="arrow-trend-up" size={22} color={direction === 'up' ? COLORS.success : COLORS.textSecondary} />
                <Text style={[styles.directionText, { color: direction === 'up' ? COLORS.success : COLORS.textSecondary }]}>
                  看涨
                </Text>
                <Text style={[styles.oddsText, { color: direction === 'up' ? COLORS.success : COLORS.textSecondary }]}>
                  {data?.oddsUp?.toFixed(2)}x
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.directionBtn, direction === 'down' && styles.directionBtnActiveDown]}
              onPress={() => setDirection('down')}
            >
              <LinearGradient
                colors={direction === 'down' ? ['rgba(255,107,107,0.2)', 'rgba(255,107,107,0.05)'] : ['transparent', 'transparent']}
                style={styles.directionGradient}
              >
                <FontAwesome6 name="arrow-trend-down" size={22} color={direction === 'down' ? COLORS.danger : COLORS.textSecondary} />
                <Text style={[styles.directionText, { color: direction === 'down' ? COLORS.danger : COLORS.textSecondary }]}>
                  看跌
                </Text>
                <Text style={[styles.oddsText, { color: direction === 'down' ? COLORS.danger : COLORS.textSecondary }]}>
                  {data?.oddsDown?.toFixed(2)}x
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Amount Input with Balance */}
          <View style={styles.amountHeader}>
            <Text style={styles.betLabel}>投注金额 (USDT)</Text>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>余额:</Text>
              <Text style={styles.balanceValue}>{data?.usdtBalance?.toFixed(2) || '0.00'}</Text>
              <TouchableOpacity onPress={() => setAmount((data?.usdtBalance || 0).toString())}>
                <Text style={styles.maxBtn}>MAX</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.amountInputContainer}>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.quickAmountRow}>
            {quickAmounts.map((qa) => (
              <TouchableOpacity
                key={qa}
                style={[styles.quickAmountBtn, parseFloat(amount) === qa && styles.quickAmountBtnActive]}
                onPress={() => setAmount(qa.toString())}
              >
                <Text style={[styles.quickAmountText, parseFloat(amount) === qa && styles.quickAmountTextActive]}>
                  ${qa}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Estimated Return Details */}
          {amountNum > 0 && (
            <View style={styles.returnDetails}>
              <View style={styles.returnRow}>
                <Text style={styles.returnLabel}>预估赔率</Text>
                <Text style={styles.returnValue}>{currentOdds.toFixed(2)}x</Text>
              </View>
              <View style={styles.returnRow}>
                <Text style={styles.returnLabel}>预估收益</Text>
                <Text style={styles.returnValueHighlight}>{estimatedReturn} USDT</Text>
              </View>
              <View style={styles.returnRow}>
                <Text style={styles.returnLabel}>净收益</Text>
                <Text style={[styles.returnValue, { color: COLORS.success }]}>+{netProfit} USDT</Text>
              </View>
            </View>
          )}

          {/* Insurance Notice */}
          <View style={styles.insuranceNotice}>
            <FontAwesome6 name="shield-halved" size={14} color={COLORS.primary} />
            <View style={styles.insuranceNoticeContent}>
              <Text style={styles.insuranceNoticeText}>
                20%投注额注入保险仓 → 买入TFT
              </Text>
              {amountNum > 0 && (
                <Text style={styles.insuranceAmountText}>
                  本轮注入: {insuranceAmount} USDT
                </Text>
              )}
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitBtn, (!isConnected || submitting) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!isConnected || submitting}
          >
            <LinearGradient
              colors={isConnected ? COLORS.GRADIENT_PRIMARY : ['#333', '#444']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitGradient}
            >
              {submitting ? (
                <ActivityIndicator color={COLORS.background} />
              ) : (
                <Text style={styles.submitText}>
                  {!isConnected ? '请先连接钱包' : `确认${direction === 'up' ? '看涨' : '看跌'}`}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Participation Status */}
        {data && (
          <View style={styles.statusBar}>
            {data.isVIP ? (
              <View style={styles.statusContent}>
                <View style={styles.vipBadge}>
                  <FontAwesome6 name="crown" size={12} color={COLORS.primary} />
                </View>
                <Text style={styles.statusText}>VIP用户 · 无限次预测</Text>
              </View>
            ) : (
              <View style={styles.statusContent}>
                <FontAwesome6 name="circle-info" size={14} color={COLORS.textSecondary} />
                <Text style={styles.statusText}>
                  本期已参与 {data.participationCount}/{data.maxParticipation} 次
                </Text>
                <TouchableOpacity onPress={() => router.push('/profile')}>
                  <Text style={styles.upgradeText}> 升级VIP →</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Insurance Pool Status */}
        {data && (
          <View style={styles.insurancePoolCard}>
            <View style={styles.insurancePoolHeader}>
              <FontAwesome6 name="shield-halved" size={16} color={COLORS.primary} />
              <Text style={styles.insurancePoolTitle}>保险仓状态</Text>
            </View>
            <View style={styles.insurancePoolRow}>
              <Text style={styles.insurancePoolLabel}>总余额</Text>
              <Text style={styles.insurancePoolValue}>{data.insurancePoolBalance?.toLocaleString()} TFT</Text>
            </View>
            <View style={styles.insurancePoolRow}>
              <Text style={styles.insurancePoolLabel}>本轮注入</Text>
              <Text style={styles.insurancePoolValueHighlight}>{data.currentRoundInsurance} TFT</Text>
            </View>
          </View>
        )}

        {/* Prediction History */}
        <View style={styles.historySection}>
          <Text style={styles.historyTitle}>预测记录</Text>
          <View style={styles.filterRow}>
            {(['all', 'pending', 'won', 'claimed'] as const).map((f) => {
              const labels: Record<string, string> = { all: '全部', pending: '待结算', won: '已获胜', claimed: '已领取' };
              return (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
                  onPress={() => setFilter(f)}
                >
                  <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                    {labels[f]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {filteredPredictions.length === 0 ? (
            <View style={styles.emptyState}>
              <FontAwesome6 name="chart-line" size={32} color={COLORS.textSecondary} />
              <Text style={styles.emptyText}>暂无预测记录</Text>
              <TouchableOpacity style={styles.emptyActionBtn} onPress={() => router.push('/predict')}>
                <Text style={styles.emptyActionText}>去预测</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.historyList}>
              {filteredPredictions.map((item) => (
                <View key={item.id} style={styles.historyItem}>
                  <View style={styles.historyLeft}>
                    <View style={[
                      styles.historyDirection,
                      { backgroundColor: item.direction === 'up' ? 'rgba(0,200,151,0.15)' : 'rgba(255,107,107,0.15)' }
                    ]}>
                      <FontAwesome6
                        name={item.direction === 'up' ? 'arrow-trend-up' : 'arrow-trend-down'}
                        size={12}
                        color={item.direction === 'up' ? COLORS.success : COLORS.danger}
                      />
                    </View>
                    <View>
                      <Text style={styles.historyTime}>#{item.round} · {item.time}</Text>
                      <Text style={styles.historyAmount}>${item.amount} USDT</Text>
                    </View>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={[
                      styles.historyStatus,
                      { color: item.status === 'won' || item.status === 'claimed' ? COLORS.success : item.status === 'lost' ? COLORS.danger : COLORS.primary }
                    ]}>
                      {item.status === 'won' ? '获胜' : item.status === 'lost' ? '失败' : item.status === 'claimed' ? '已领取' : '待结算'}
                    </Text>
                    {item.status === 'won' && (
                      <TouchableOpacity style={styles.claimBtn} onPress={() => handleClaim(item.id)}>
                        <Text style={styles.claimBtnText}>领取</Text>
                      </TouchableOpacity>
                    )}
                    {(item.status === 'won' || item.status === 'claimed') && item.profit > 0 && (
                      <Text style={[styles.historyProfit, { color: COLORS.success }]}>+${item.profit.toFixed(2)}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Confirm Modal */}
      <Modal visible={confirmModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>确认投注</Text>
              <TouchableOpacity onPress={() => setConfirmModalVisible(false)}>
                <FontAwesome6 name="xmark" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>方向</Text>
                <View style={styles.confirmDirectionBadge}>
                  <FontAwesome6
                    name={direction === 'up' ? 'arrow-trend-up' : 'arrow-trend-down'}
                    size={14}
                    color={direction === 'up' ? COLORS.success : COLORS.danger}
                  />
                  <Text style={[styles.confirmDirectionText, { color: direction === 'up' ? COLORS.success : COLORS.danger }]}>
                    {direction === 'up' ? '看涨' : '看跌'}
                  </Text>
                </View>
              </View>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>投注金额</Text>
                <Text style={styles.confirmValue}>{amount} USDT</Text>
              </View>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>预估赔率</Text>
                <Text style={styles.confirmValue}>{currentOdds.toFixed(2)}x</Text>
              </View>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>预估收益</Text>
                <Text style={[styles.confirmValue, { color: COLORS.primary }]}>{estimatedReturn} USDT</Text>
              </View>
              <View style={styles.confirmDivider} />
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>保险仓注入</Text>
                <Text style={styles.confirmValue}>{insuranceAmount} USDT</Text>
              </View>
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setConfirmModalVisible(false)}>
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={confirmSubmit}>
                <LinearGradient
                  colors={COLORS.GRADIENT_PRIMARY}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.modalConfirmGradient}
                >
                  <Text style={styles.modalConfirmText}>确认投注</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingTop: 56,
    paddingBottom: 120,
    paddingHorizontal: 16,
  },
  // Title Bar
  titleBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245,166,35,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  timerText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
    fontFamily: 'monospace',
  },
  // Price Card
  priceCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  priceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  changeBadge: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    fontFamily: 'monospace',
  },
  priceValue: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.textPrimary,
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  priceRange: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  rangeText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontFamily: 'monospace',
  },
  chartContainer: {
    marginTop: 8,
  },
  miniChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 60,
    gap: 2,
  },
  miniChartBar: {
    width: 8,
    borderRadius: 2,
  },
  // Betting Panel
  betPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  betLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  directionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  directionBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  directionBtnActiveUp: {
    borderColor: COLORS.success,
  },
  directionBtnActiveDown: {
    borderColor: COLORS.danger,
  },
  directionGradient: {
    alignItems: 'center',
    paddingVertical: 18,
    gap: 6,
  },
  directionText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  oddsText: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  // Amount Input
  amountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  balanceLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  balanceValue: {
    fontSize: 11,
    color: COLORS.textPrimary,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  maxBtn: {
    fontSize: 10,
    color: COLORS.primary,
    fontWeight: '700',
    marginLeft: 4,
  },
  amountInputContainer: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
  },
  amountInput: {
    padding: 14,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontFamily: 'monospace',
  },
  quickAmountRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  quickAmountBtn: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickAmountBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(245,166,35,0.1)',
  },
  quickAmountText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  quickAmountTextActive: {
    color: COLORS.primary,
  },
  // Return Details
  returnDetails: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  returnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  returnLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  returnValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    fontFamily: 'monospace',
  },
  returnValueHighlight: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    fontFamily: 'monospace',
  },
  insuranceNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(245,166,35,0.08)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  insuranceNoticeContent: {
    flex: 1,
    gap: 2,
  },
  insuranceNoticeText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    flex: 1,
  },
  insuranceAmountText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '600',
  },
  submitBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 12,
  },
  submitText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.background,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  // Status Bar
  statusBar: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  vipBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(245,166,35,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  upgradeText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
  },
  // Insurance Pool Card
  insurancePoolCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  insurancePoolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  insurancePoolTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  insurancePoolRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  insurancePoolLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  insurancePoolValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    fontFamily: 'monospace',
  },
  insurancePoolValueHighlight: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
    fontFamily: 'monospace',
  },
  // History
  historySection: {
    marginBottom: 20,
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterBtnActive: {
    backgroundColor: 'rgba(245,166,35,0.15)',
    borderColor: COLORS.primary,
  },
  filterText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  filterTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  emptyState: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  emptyActionBtn: {
    backgroundColor: 'rgba(245,166,35,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  emptyActionText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
  },
  historyList: {
    gap: 8,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  historyDirection: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyTime: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontFamily: 'monospace',
  },
  historyAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    fontFamily: 'monospace',
  },
  historyRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  historyStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  historyProfit: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  claimBtn: {
    backgroundColor: 'rgba(0,200,151,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 2,
  },
  claimBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.success,
  },
  // Confirm Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    gap: 12,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confirmLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  confirmValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    fontFamily: 'monospace',
  },
  confirmDirectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  confirmDirectionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  confirmDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 4,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  modalConfirmBtn: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  modalConfirmGradient: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.background,
  },
});

