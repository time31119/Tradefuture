import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome6 } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import { Screen } from '@/components/Screen';
import { COLORS } from '@/utils/theme';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useFocusEffect } from 'expo-router';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const API_BASE = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';
const DEVICE_ID = 'device_' + Math.random().toString(36).substr(2, 9);

interface Round {
  id: number;
  roundId: string;
  status: string;
  startTime: number;
  endTime: number;
  basePrice: string;
  closePrice: string;
  totalAmount: string;
  upAmount: string;
  downAmount: string;
  winnerSide: string;
  insurancePool: string;
  userBet?: {
    side: string;
    amount: string;
    claimed: boolean;
    payout: string;
  };
}

export default function PredictScreen() {
  const router = useSafeRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [selectedSide, setSelectedSide] = useState<'up' | 'down' | null>(null);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'current' | 'history' | 'rules'>('current');
  const [myVouchers, setMyVouchers] = useState<any[]>([]);
  const [myHistory, setMyHistory] = useState<any[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [priceHistory, setPriceHistory] = useState<{ value: number; label?: string }[]>([]);
  const [priceChange, setPriceChange] = useState(0);
  const [livePrice, setLivePrice] = useState(0);
  const [prevPrice, setPrevPrice] = useState(0);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  const [chartInterval, setChartInterval] = useState('5m');
  const [chartHigh, setChartHigh] = useState(0);
  const [chartLow, setChartLow] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const priceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chartTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRounds = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/rounds/current?deviceId=${DEVICE_ID}`);
      const data = await res.json();
      if (data.current) {
        setCurrentRound(data.current);
        const endTime = data.current.endTime ? new Date(data.current.endTime).getTime() : 0;
        setTimeLeft(Math.max(0, Math.floor((endTime - Date.now()) / 1000)));
      }
      if (data.vouchers) setMyVouchers(data.vouchers);
      // Update live price from round data
      if (data.btcPrice > 0) {
        setPrevPrice(livePrice || data.btcPrice);
        setLivePrice(data.btcPrice);
        if (livePrice > 0 && data.btcPrice !== livePrice) {
          setPriceFlash(data.btcPrice > livePrice ? 'up' : 'down');
          setTimeout(() => setPriceFlash(null), 800);
        }
      }
    } catch (error) {
      console.error('Failed to fetch rounds:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/rounds/history?deviceId=${DEVICE_ID}&limit=20`);
      const data = await res.json();
      if (data.rounds) setMyHistory(data.rounds);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  };

  /**
   * 服务端文件：server/src/index.ts
   * 接口：GET /api/v1/rounds/price-history
   * Query 参数：interval?: string (1m/5m/15m/1h/4h/1d), limit?: number
   */
  const fetchPriceHistory = useCallback(async (interval?: string) => {
    try {
      const iv = interval || chartInterval;
      // 根据 interval 自动计算 limit（24h 数据量）
      const limitMap: Record<string, number> = {
        '1m': 1440, '5m': 288, '15m': 96, '1h': 24, '4h': 42, '1d': 30,
      };
      const limit = limitMap[iv] || 288;
      const res = await fetch(`${API_BASE}/api/v1/rounds/price-history?interval=${iv}&limit=${limit}`);
      const data = await res.json();
      if (data.prices && data.prices.length > 0) {
        const chartData = data.prices.map((p: { time: number; price: number }) => ({
          value: p.price,
        }));
        setPriceHistory(chartData);
        const firstPrice = data.prices[0].price;
        const lastPrice = data.prices[data.prices.length - 1].price;
        setPriceChange(((lastPrice - firstPrice) / firstPrice) * 100);
        setChartHigh(Math.max(...data.prices.map((p: { high?: number; price: number }) => p.high || p.price)));
        setChartLow(Math.min(...data.prices.map((p: { low?: number; price: number }) => p.low || p.price)));
      }
    } catch (error) {
      console.error('Failed to fetch price history:', error);
    }
  }, [chartInterval]);

  /**
   * 服务端文件：server/src/index.ts
   * 接口：GET /api/v1/btc/price
   * 返回：{ success: boolean, data: { price, change24h, high24h, low24h, volume24h }, source: 'Binance' }
   */
  const fetchRealtimePrice = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/btc/price`);
      const data = await res.json();
      if (data.success && data.data?.price > 0) {
        const newPrice = data.data.price;
        setPrevPrice(livePrice || newPrice);
        setLivePrice(newPrice);
        if (livePrice > 0 && newPrice !== livePrice) {
          setPriceFlash(newPrice > livePrice ? 'up' : 'down');
          setTimeout(() => setPriceFlash(null), 800);
        }
      }
    } catch (error) {
      console.error('Failed to fetch realtime price:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchRounds();
      fetchHistory();
      fetchPriceHistory();
      fetchRealtimePrice();
    }, [fetchPriceHistory])
  );

  useEffect(() => {
    fetchRounds();
    fetchHistory();
    fetchPriceHistory();
    fetchRealtimePrice();
  }, [fetchPriceHistory]);

  // Real-time price polling every 5 seconds
  useEffect(() => {
    if (priceTimerRef.current) clearInterval(priceTimerRef.current);
    priceTimerRef.current = setInterval(() => {
      fetchRealtimePrice();
    }, 5_000);
    return () => {
      if (priceTimerRef.current) clearInterval(priceTimerRef.current);
    };
  }, [livePrice]);

  // Chart data refresh every 30 seconds
  useEffect(() => {
    if (chartTimerRef.current) clearInterval(chartTimerRef.current);
    chartTimerRef.current = setInterval(() => {
      fetchPriceHistory();
    }, 30_000);
    return () => {
      if (chartTimerRef.current) clearInterval(chartTimerRef.current);
    };
  }, [fetchPriceHistory]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (currentRound?.endTime) {
        const endTime = new Date(currentRound.endTime).getTime();
        const left = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
        setTimeLeft(left);
        if (left === 0) fetchRounds();
      }
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentRound]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRounds();
    fetchHistory();
    fetchPriceHistory();
    fetchRealtimePrice();
  };

  const handleBet = async () => {
    if (!selectedSide || !amount || !currentRound) return;
    const betAmount = parseFloat(amount);
    if (betAmount < 1) {
      alert('最小下注金额为 $1');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/rounds/${currentRound.roundId}/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side: selectedSide,
          amount: betAmount.toString(),
          deviceId: DEVICE_ID,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`下注成功！$${betAmount} ${selectedSide === 'up' ? '涨' : '跌'}`);
        setSelectedSide(null);
        setAmount('');
        fetchRounds();
        fetchHistory();
      } else {
        alert(data.error || '下注失败');
      }
    } catch (error) {
      alert('下注失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaim = async (roundId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/rounds/${roundId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: DEVICE_ID }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`领取成功！获得 $${data.payout}`);
        fetchRounds();
        fetchHistory();
      } else {
        alert(data.error || '领取失败');
      }
    } catch (error) {
      alert('领取失败，请重试');
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = () => {
    if (!currentRound) return null;
    const status = currentRound.status;
    if (status === 'betting') {
      return (
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: '#22C55E' }]} />
          <Text style={styles.statusText}>进行中</Text>
          <Text style={styles.statusTime}>{formatTime(timeLeft)}</Text>
        </View>
      );
    } else if (status === 'locked') {
      return (
        <View style={[styles.statusBadge, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
          <View style={[styles.statusDot, { backgroundColor: '#F59E0B' }]} />
          <Text style={[styles.statusText, { color: '#F59E0B' }]}>已锁定</Text>
        </View>
      );
    } else if (status === 'completed') {
      return (
        <View style={[styles.statusBadge, { backgroundColor: 'rgba(34, 197, 94, 0.15)' }]}>
          <View style={[styles.statusDot, { backgroundColor: '#22C55E' }]} />
          <Text style={[styles.statusText, { color: '#22C55E' }]}>已结算</Text>
        </View>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </Screen>
    );
  }

  const upAmount = currentRound?.upAmount ? parseFloat(currentRound.upAmount) : 0;
  const downAmount = currentRound?.downAmount ? parseFloat(currentRound.downAmount) : 0;
  const totalAmount = upAmount + downAmount;
  const upPercent = totalAmount > 0 ? (upAmount / totalAmount) * 100 : 50;
  const downPercent = totalAmount > 0 ? (downAmount / totalAmount) * 100 : 50;

  return (
    <Screen>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <FontAwesome6 name="chevron-left" size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitle}>
            <FontAwesome6 name="bitcoin" size={18} color="#F59E0B" />
            <Text style={styles.headerTitleText}>BTC 5分钟涨跌</Text>
          </View>
          {getStatusBadge()}
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Real-time Price Card */}
          <View style={styles.priceCard}>
            <View style={styles.priceCardHeader}>
              <View style={styles.btcLabel}>
                <FontAwesome6 name="bitcoin" size={16} color="#F59E0B" />
                <Text style={styles.btcLabelText}>BTC/USDT</Text>
              </View>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>
            <View style={styles.livePriceRow}>
              <Text
                style={[
                  styles.livePriceValue,
                  priceFlash === 'up' && { color: '#22C55E' },
                  priceFlash === 'down' && { color: '#EF4444' },
                ]}
              >
                ${livePrice > 0 ? livePrice.toFixed(2) : '--'}
              </Text>
              <View style={styles.priceChangeRow}>
                <FontAwesome6
                  name={priceChange >= 0 ? 'caret-up' : 'caret-down'}
                  size={14}
                  color={priceChange >= 0 ? '#22C55E' : '#EF4444'}
                />
                <Text style={[styles.priceChangeText, { color: priceChange >= 0 ? '#22C55E' : '#EF4444' }]}>
                  {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                </Text>
              </View>
            </View>
            <View style={styles.priceDivider} />
            <View style={styles.basePriceRow}>
              <Text style={styles.basePriceLabel}>本轮基准价</Text>
              <Text style={styles.basePriceValue}>
                ${currentRound?.basePrice ? parseFloat(currentRound.basePrice).toFixed(2) : '--'}
              </Text>
            </View>
          </View>

          {/* Price Trend Chart */}
          {priceHistory.length > 0 && (
            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <Text style={styles.chartTitle}>BTC/USDT</Text>
                <View style={styles.chartChangeBadge}>
                  <FontAwesome6
                    name={priceChange >= 0 ? 'caret-up' : 'caret-down'}
                    size={14}
                    color={priceChange >= 0 ? '#22C55E' : '#EF4444'}
                  />
                  <Text style={[styles.chartChangeText, { color: priceChange >= 0 ? '#22C55E' : '#EF4444' }]}>
                    {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                  </Text>
                </View>
              </View>
              {/* Interval Selector */}
              <View style={styles.intervalRow}>
                {['1m', '5m', '15m', '1h', '4h', '1d'].map((iv) => (
                  <TouchableOpacity
                    key={iv}
                    style={[styles.intervalBtn, chartInterval === iv && styles.intervalBtnActive]}
                    onPress={() => {
                      setChartInterval(iv);
                      fetchPriceHistory(iv);
                    }}
                  >
                    <Text style={[styles.intervalText, chartInterval === iv && styles.intervalTextActive]}>
                      {iv}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <LineChart
                data={priceHistory}
                width={SCREEN_WIDTH - 64}
                height={180}
                spacing={4}
                initialSpacing={0}
                color={priceChange >= 0 ? '#22C55E' : '#EF4444'}
                thickness={2}
                areaChart
                hideYAxisText
                hideDataPoints
                curved
                noOfSections={3}
                yAxisThickness={0}
                xAxisThickness={1}
                xAxisColor="rgba(255,255,255,0.1)"
                rulesColor="rgba(255,255,255,0.05)"
                backgroundColor="transparent"
                startOpacity={0.3}
                endOpacity={0}
              />
              <View style={styles.chartFooter}>
                <View style={styles.chartStatItem}>
                  <Text style={styles.chartStatLabel}>最低</Text>
                  <Text style={[styles.chartStatValue, { color: '#EF4444' }]}>
                    ${chartLow > 0 ? chartLow.toFixed(2) : Math.min(...priceHistory.map(p => p.value)).toFixed(2)}
                  </Text>
                </View>
                <View style={styles.chartStatItem}>
                  <Text style={styles.chartStatLabel}>最高</Text>
                  <Text style={[styles.chartStatValue, { color: '#22C55E' }]}>
                    ${chartHigh > 0 ? chartHigh.toFixed(2) : Math.max(...priceHistory.map(p => p.value)).toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Up/Down Buttons */}
          <View style={styles.betButtonsContainer}>
            <TouchableOpacity
              style={[
                styles.betButton,
                selectedSide === 'up' && styles.betButtonSelectedUp,
                !selectedSide && styles.betButtonUp,
              ]}
              onPress={() => setSelectedSide('up')}
              disabled={currentRound?.status !== 'betting'}
            >
              <FontAwesome6 name="arrow-trend-up" size={28} color={selectedSide === 'up' ? '#FFF' : '#22C55E'} />
              <Text style={[styles.betButtonText, { color: selectedSide === 'up' ? '#FFF' : '#22C55E' }]}>
                涨
              </Text>
              <Text style={[styles.betButtonSubtext, { color: selectedSide === 'up' ? 'rgba(255,255,255,0.8)' : '#9CA3AF' }]}>
                已投 ${upAmount.toFixed(2)}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.betButton,
                selectedSide === 'down' && styles.betButtonSelectedDown,
                !selectedSide && styles.betButtonDown,
              ]}
              onPress={() => setSelectedSide('down')}
              disabled={currentRound?.status !== 'betting'}
            >
              <FontAwesome6 name="arrow-trend-down" size={28} color={selectedSide === 'down' ? '#FFF' : '#EF4444'} />
              <Text style={[styles.betButtonText, { color: selectedSide === 'down' ? '#FFF' : '#EF4444' }]}>
                跌
              </Text>
              <Text style={[styles.betButtonSubtext, { color: selectedSide === 'down' ? 'rgba(255,255,255,0.8)' : '#9CA3AF' }]}>
                已投 ${downAmount.toFixed(2)}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Bet Pool Bar */}
          <View style={styles.poolBar}>
            <View style={styles.poolBarFill}>
              <View style={[styles.poolBarUp, { width: `${upPercent}%` }]} />
              <View style={[styles.poolBarDown, { width: `${downPercent}%` }]} />
            </View>
            <View style={styles.poolBarLabels}>
              <Text style={[styles.poolBarLabel, { color: '#22C55E' }]}>涨 {upPercent.toFixed(0)}%</Text>
              <Text style={styles.poolBarTotal}>总池: ${totalAmount.toFixed(2)}</Text>
              <Text style={[styles.poolBarLabel, { color: '#EF4444' }]}>跌 {downPercent.toFixed(0)}%</Text>
            </View>
          </View>

          {/* Amount Input */}
          {currentRound?.status === 'betting' && selectedSide && (
            <View style={styles.amountSection}>
              <Text style={styles.amountLabel}>预测金额（大于$1）</Text>
              <View style={styles.amountInputContainer}>
                <Text style={styles.amountCurrency}>$</Text>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor="#6B7280"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.quickAmounts}>
                {[5, 10, 25, 50, 100].map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={styles.quickAmountBtn}
                    onPress={() => setAmount(val.toString())}
                  >
                    <Text style={styles.quickAmountText}>${val}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleBet}
                disabled={submitting || !amount || parseFloat(amount) < 1}
              >
                <LinearGradient
                  colors={['#F59E0B', '#D97706']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitGradient}
                >
                  <Text style={styles.submitButtonText}>
                    {submitting ? '提交中...' : `确认${selectedSide === 'up' ? '买涨' : '买跌'} $${amount || '0'}`}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* Insurance Notice */}
          <View style={styles.insuranceNotice}>
            <FontAwesome6 name="shield-halved" size={14} color="#F59E0B" />
            <Text style={styles.insuranceText}>
              预测失败可获保险仓100%等值TFT赔付
            </Text>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'current' && styles.tabActive]}
              onPress={() => setActiveTab('current')}
            >
              <Text style={[styles.tabText, activeTab === 'current' && styles.tabTextActive]}>
                当前凭证
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'history' && styles.tabActive]}
              onPress={() => setActiveTab('history')}
            >
              <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
                所有记录
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'rules' && styles.tabActive]}
              onPress={() => setActiveTab('rules')}
            >
              <Text style={[styles.tabText, activeTab === 'rules' && styles.tabTextActive]}>
                预测规则
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab Content */}
          <View style={styles.tabContent}>
            {activeTab === 'current' && (
              <View style={styles.voucherList}>
                {myVouchers.length === 0 ? (
                  <View style={styles.emptyState}>
                    <FontAwesome6 name="receipt" size={40} color="#4B5563" />
                    <Text style={styles.emptyText}>本期暂无预测凭证或已领取</Text>
                  </View>
                ) : (
                  myVouchers.map((voucher) => (
                    <View key={voucher.id} style={styles.voucherCard}>
                      <View style={styles.voucherHeader}>
                        <View style={styles.voucherSide}>
                          <FontAwesome6
                            name={voucher.betSide === 'up' ? 'arrow-trend-up' : 'arrow-trend-down'}
                            size={16}
                            color={voucher.betSide === 'up' ? '#22C55E' : '#EF4444'}
                          />
                          <Text style={[styles.voucherSideText, { color: voucher.betSide === 'up' ? '#22C55E' : '#EF4444' }]}>
                            {voucher.betSide === 'up' ? '涨' : '跌'}
                          </Text>
                        </View>
                        <Text style={styles.voucherAmount}>${voucher.betAmount}</Text>
                      </View>
                      <View style={styles.voucherFooter}>
                        <Text style={styles.voucherRound}>#{voucher.roundId}</Text>
                        {voucher.won && !voucher.claimed && (
                          <TouchableOpacity style={styles.claimButton} onPress={() => handleClaim(voucher.roundId)}>
                            <Text style={styles.claimButtonText}>领取</Text>
                          </TouchableOpacity>
                        )}
                        {voucher.claimed && (
                          <Text style={styles.claimedText}>已领取 +${voucher.payout}</Text>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {activeTab === 'history' && (
              <View style={styles.historyList}>
                {myHistory.length === 0 ? (
                  <View style={styles.emptyState}>
                    <FontAwesome6 name="clock-rotate-left" size={40} color="#4B5563" />
                    <Text style={styles.emptyText}>暂无预测记录</Text>
                  </View>
                ) : (
                  myHistory.map((round) => (
                    <View key={round.id} style={styles.historyCard}>
                      <View style={styles.historyHeader}>
                        <Text style={styles.historyRound}>#{round.roundId}</Text>
                        <Text style={[styles.historyResult, {
                          color: round.winnerSide === 'up' ? '#22C55E' : '#EF4444'
                        }]}>
                          {round.winnerSide === 'up' ? '涨胜' : '跌胜'}
                        </Text>
                      </View>
                      {round.userBet && (
                        <View style={styles.historyBet}>
                          <Text style={styles.historyBetText}>
                            我的下注: {round.userBet.side === 'up' ? '涨' : '跌'} ${round.userBet.amount}
                          </Text>
                          <Text style={[styles.historyBetResult, {
                            color: round.userBet.won ? '#22C55E' : '#EF4444'
                          }]}>
                            {round.userBet.won ? `+${round.userBet.payout}` : `-${round.userBet.amount}`}
                          </Text>
                        </View>
                      )}
                    </View>
                  ))
                )}
              </View>
            )}

            {activeTab === 'rules' && (
              <View style={styles.rulesContent}>
                <View style={styles.ruleItem}>
                  <Text style={styles.ruleTitle}>预测周期</Text>
                  <Text style={styles.ruleDesc}>每5分钟一期，倒计时结束自动锁定</Text>
                </View>
                <View style={styles.ruleItem}>
                  <Text style={styles.ruleTitle}>手续费</Text>
                  <Text style={styles.ruleDesc}>每笔下注收取3%平台手续费</Text>
                </View>
                <View style={styles.ruleItem}>
                  <Text style={styles.ruleTitle}>赢家分配</Text>
                  <Text style={styles.ruleDesc}>扣除手续费后80%进入赢家奖池</Text>
                </View>
                <View style={styles.ruleItem}>
                  <Text style={styles.ruleTitle}>保险赔付</Text>
                  <Text style={styles.ruleDesc}>输家获得保险仓100%等值TFT赔付</Text>
                </View>
                <View style={styles.ruleItem}>
                  <Text style={styles.ruleTitle}>最低下注</Text>
                  <Text style={styles.ruleDesc}>最小下注金额 $1</Text>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  headerTitleText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginLeft: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#22C55E',
    marginLeft: 6,
  },
  statusTime: {
    fontSize: 12,
    fontWeight: '700',
    color: '#22C55E',
    marginLeft: 6,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  priceCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  priceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  btcLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btcLabelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    marginLeft: 6,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
    marginLeft: 4,
  },
  livePriceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  livePriceValue: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  priceChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  priceChangeText: {
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 2,
  },
  priceDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 12,
  },
  basePriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  basePriceLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  basePriceValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  chartCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  chartChangeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chartChangeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  chartFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingHorizontal: 4,
  },
  chartStatItem: {
    alignItems: 'center',
  },
  chartStatLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 2,
  },
  chartStatValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  intervalRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  intervalBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  intervalBtnActive: {
    backgroundColor: '#F59E0B',
  },
  intervalText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  intervalTextActive: {
    color: '#000',
  },
  betButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  betButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    borderRadius: 16,
    borderWidth: 2,
  },
  betButtonUp: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  betButtonDown: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  betButtonSelectedUp: {
    backgroundColor: '#22C55E',
    borderColor: '#22C55E',
  },
  betButtonSelectedDown: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  betButtonText: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 8,
  },
  betButtonSubtext: {
    fontSize: 12,
    marginTop: 4,
  },
  poolBar: {
    marginBottom: 16,
  },
  poolBarFill: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  poolBarUp: {
    backgroundColor: '#22C55E',
  },
  poolBarDown: {
    backgroundColor: '#EF4444',
  },
  poolBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  poolBarLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  poolBarTotal: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  amountSection: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  amountLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 12,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  amountCurrency: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  quickAmounts: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  quickAmountBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    alignItems: 'center',
  },
  quickAmountText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  submitButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  submitGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  insuranceNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  insuranceText: {
    fontSize: 13,
    color: '#F59E0B',
    marginLeft: 8,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  tabTextActive: {
    color: '#F59E0B',
  },
  tabContent: {
    minHeight: 200,
  },
  voucherList: {
    gap: 12,
  },
  voucherCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
  },
  voucherHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  voucherSide: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  voucherSideText: {
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 8,
  },
  voucherAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  voucherFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  voucherRound: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  claimButton: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  claimButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  claimedText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#22C55E',
  },
  historyList: {
    gap: 12,
  },
  historyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyRound: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  historyResult: {
    fontSize: 14,
    fontWeight: '700',
  },
  historyBet: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyBetText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  historyBetResult: {
    fontSize: 14,
    fontWeight: '700',
  },
  rulesContent: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    gap: 16,
  },
  ruleItem: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 12,
  },
  ruleTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  ruleDesc: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 12,
  },
});
