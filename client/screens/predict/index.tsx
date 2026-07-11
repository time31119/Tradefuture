import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Modal,
  Platform,
  Dimensions,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome6 } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Screen } from '@/components/Screen';
import { COLORS } from '@/utils/theme';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useFocusEffect } from 'expo-router';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const API_BASE = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';

// Generate or retrieve persistent device ID
const getDeviceId = async (): Promise<string> => {
  try {
    let deviceId = await AsyncStorage.getItem('device_id');
    if (!deviceId) {
      deviceId = 'device_' + Math.random().toString(36).substr(2, 9);
      await AsyncStorage.setItem('device_id', deviceId);
    }
    return deviceId;
  } catch {
    return 'device_fallback';
  }
};

interface Round {
  id: number;
  roundId: string;
  status: string;
  startTime: number;
  endTime: number;
  basePrice: string;
  currentPrice: string;
  closePrice: string;
  totalAmount: string;
  upAmount: string;
  downAmount: string;
  winnerSide: string;
  insurancePool: string;
  remainingSeconds: number;
  roundNumber: number;
  expectedProfitUp: { profitRate: string; profitAmount: string; multiplier: string };
  expectedProfitDown: { profitRate: string; profitAmount: string; multiplier: string };
  userBet?: {
    side: string;
    amount: string;
    claimed: boolean;
    payout: string;
  };
}

interface BetRecord {
  id: number;
  betId: string;
  roundId: string;
  roundNumber: number;
  side: string;
  amount: string;
  fee: string;
  netAmount: string;
  basePrice: string;
  expectedProfit: string;
  expectedProfitRate: string;
  expectedMultiplier: string;
  remainingSecondsAtBet: number;
  claimed: boolean;
  won: boolean;
  payout: string;
  createdAt: string;
}

interface BetDetail {
  betId: string;
  roundNumber: number;
  roundId: string;
  side: string;
  amount: string;
  fee: string;
  netAmount: string;
  basePrice: string;
  closePrice: string | null;
  expectedProfit: string;
  expectedProfitRate: string;
  expectedMultiplier: string;
  remainingSecondsAtBet: number;
  status: string;
  winnerSide: string | null;
  userWon: boolean | null;
  actualPayout: string | null;
  actualProfit: string | null;
  createdAt: string;
  roundStartTime: number;
  roundEndTime: number;
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
  const [betDetail, setBetDetail] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [priceHistory, setPriceHistory] = useState<{ value: number; label?: string }[]>([]);
  const [priceChange, setPriceChange] = useState(0);
  const [livePrice, setLivePrice] = useState(0);
  const [prevPrice, setPrevPrice] = useState(0);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  const [chartInterval, setChartInterval] = useState('5m');
  const [chartHigh, setChartHigh] = useState(0);
  const [chartLow, setChartLow] = useState(0);
  const [deviceId, setDeviceId] = useState<string>('');
  const [showBetDetail, setShowBetDetail] = useState(false);
  const [selectedBetDetail, setSelectedBetDetail] = useState<BetDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const priceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chartTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize device ID on mount
  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);

  const fetchRounds = async () => {
    if (!deviceId) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/rounds/current?deviceId=${deviceId}`);
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
    if (!deviceId) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/rounds/history?deviceId=${deviceId}&limit=20`);
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
      if (data.data && data.data.length > 0) {
        const chartData = data.data.map((p: { time: number; price: number }) => ({
          value: p.price,
        }));
        setPriceHistory(chartData);
        const firstPrice = data.data[0].price;
        const lastPrice = data.data[data.data.length - 1].price;
        setPriceChange(((lastPrice - firstPrice) / firstPrice) * 100);
        setChartHigh(Math.max(...data.data.map((p: { high?: number; price: number }) => p.high || p.price)));
        setChartLow(Math.min(...data.data.map((p: { low?: number; price: number }) => p.low || p.price)));
      }
    } catch (error) {
      console.error('Failed to fetch price history:', error);
    }
  }, [chartInterval]);

  /**
   * 服务端文件：server/src/index.ts
   * 接口：GET /api/v1/rounds/bet/:betId
   */
  const fetchBetDetail = async (betId: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/rounds/bet/${betId}`);
      const data = await res.json();
      if (data.success && data.data) {
        setSelectedBetDetail(data.data);
        setShowBetDetail(true);
      }
    } catch (error) {
      console.error('Failed to fetch bet detail:', error);
    } finally {
      setLoadingDetail(false);
    }
  };

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
      if (deviceId) {
        fetchRounds();
        fetchHistory();
        fetchPriceHistory();
        fetchRealtimePrice();
      }
    }, [fetchPriceHistory, deviceId])
  );

  useEffect(() => {
    if (deviceId) {
      fetchRounds();
      fetchHistory();
      fetchPriceHistory();
      fetchRealtimePrice();
    } else {
      // If deviceId fails to load, still stop loading
      setLoading(false);
    }
  }, [fetchPriceHistory, deviceId]);

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
    if (!selectedSide || !amount || !currentRound || !deviceId) return;
    const betAmount = parseFloat(amount);
    if (betAmount < 1) {
      alert('最小下注金额为 $1');
      return;
    }
    if (timeLeft <= 0) {
      alert('本期交易已截止，请等待下一期');
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
          deviceId: deviceId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const bet = data.bet || {};
        alert(`下注成功！\n第 ${currentRound.roundNumber || '--'} 期 | ${selectedSide === 'up' ? '买涨' : '买跌'} $${betAmount}\n预期收益: $${bet.expectedProfit || '--'} (${bet.expectedProfitRate || '--'}%)`);
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

  // Calculate expected profit for current input
  const getExpectedProfit = () => {
    if (!currentRound || !amount || !selectedSide) return null;
    const betAmt = parseFloat(amount);
    if (betAmt < 1) return null;

    const upAmount = parseFloat(currentRound.upAmount) || 0;
    const downAmount = parseFloat(currentRound.downAmount) || 0;
    const netAmount = betAmt * 0.97;
    const fee = betAmt * 0.03;

    const currentSideAmount = selectedSide === 'up' ? upAmount : downAmount;
    const newTotalPool = upAmount + downAmount + netAmount;
    const newSideAmount = currentSideAmount + netAmount;
    const winnerPool = newTotalPool * 0.80;
    const userShare = newSideAmount > 0 ? netAmount / newSideAmount : 0;
    const estimatedPayout = winnerPool * userShare;
    const profit = estimatedPayout - betAmt;
    const profitRate = betAmt > 0 ? (profit / betAmt) * 100 : 0;
    const multiplier = betAmt > 0 ? estimatedPayout / betAmt : 1;

    return {
      fee: fee.toFixed(2),
      netAmount: netAmount.toFixed(2),
      estimatedPayout: estimatedPayout.toFixed(2),
      profit: profit.toFixed(2),
      profitRate: profitRate.toFixed(2),
      multiplier: multiplier.toFixed(2),
    };
  };

  const handleClaim = async (roundId: string) => {
    if (!deviceId) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/rounds/${roundId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: deviceId }),
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

  const formatDateTime = (isoStr: string) => {
    const d = new Date(isoStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  const getStatusBadge = () => {
    if (!currentRound) return null;
    const status = currentRound.status;
    if (status === 'betting') {
      const isUrgent = timeLeft <= 30;
      return (
        <View style={[styles.statusBadge, isUrgent && { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
          <View style={[styles.statusDot, { backgroundColor: isUrgent ? '#EF4444' : '#22C55E' }]} />
          <Text style={[styles.statusText, isUrgent && { color: '#EF4444' }]}>
            {isUrgent ? '即将截止' : '交易中'}
          </Text>
          <Text style={[styles.statusTime, isUrgent && { color: '#EF4444' }]}>
            {formatTime(timeLeft)}
          </Text>
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

  // Actual amounts (for settlement)
  const upAmount = currentRound?.upAmount ? parseFloat(currentRound.upAmount) : 0;
  const downAmount = currentRound?.downAmount ? parseFloat(currentRound.downAmount) : 0;
  const totalAmount = upAmount + downAmount;

  // Real pool amounts (pure pool model - no virtual base)
  const totalPool = upAmount + downAmount;
  const upPercent = totalPool > 0 ? (upAmount / totalPool) * 100 : 50;
  const downPercent = totalPool > 0 ? (downAmount / totalPool) * 100 : 50;
  // Check if one side is empty (waiting for counterparty)
  const waitingForCounterparty = upAmount === 0 || downAmount === 0;

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
          {/* Round Info Bar */}
          {currentRound && (
            <View style={styles.roundInfoBar}>
              <View style={styles.roundInfoLeft}>
                <Text style={styles.roundNumber}>第 {currentRound.roundNumber || '--'} 期</Text>
                <Text style={styles.roundStatusText}>5分钟周期</Text>
              </View>
              <View style={styles.countdownTimer}>
                <FontAwesome6 name="clock" size={12} color={timeLeft <= 30 ? '#EF4444' : '#9CA3AF'} />
                <Text style={[styles.countdownText, timeLeft <= 30 && styles.countdownTextUrgent]}>
                  {formatTime(timeLeft)}
                </Text>
              </View>
            </View>
          )}

          {/* Countdown Progress Bar */}
          {currentRound && currentRound.status === 'betting' && (
            <View style={styles.countdownBar}>
              <View style={{ height: 3, backgroundColor: COLORS.border, borderRadius: 2, overflow: 'hidden' }}>
                <View
                  style={[
                    styles.countdownFill,
                    {
                      width: `${Math.min(100, (timeLeft / 300) * 100)}%`,
                      backgroundColor: timeLeft <= 30 ? '#EF4444' : timeLeft <= 60 ? '#F59E0B' : '#22C55E',
                    },
                  ]}
                />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={styles.countdownLabel}>交易截止倒计时</Text>
                <Text style={[styles.countdownText, { fontSize: 12 }, timeLeft <= 30 && styles.countdownTextUrgent]}>
                  {timeLeft <= 30 ? '即将截止!' : `剩余 ${formatTime(timeLeft)}`}
                </Text>
              </View>
            </View>
          )}

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
                {upAmount > 0 ? `$${upAmount.toFixed(0)}` : '等待下注'}
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
                {downAmount > 0 ? `$${downAmount.toFixed(0)}` : '等待下注'}
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
              <Text style={[styles.poolBarLabel, { color: '#22C55E' }]}>涨 ${upAmount.toFixed(0)}</Text>
              <Text style={styles.poolBarTotal}>
                {waitingForCounterparty ? '等待对手方' : `总池: $${totalPool.toFixed(0)}`}
              </Text>
              <Text style={[styles.poolBarLabel, { color: '#EF4444' }]}>跌 ${downAmount.toFixed(0)}</Text>
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

              {/* Expected Profit Preview */}
              {(() => {
                const ep = getExpectedProfit();
                if (!ep) return null;
                return (
                  <View style={styles.profitPreview}>
                    <View style={styles.profitPreviewHeader}>
                      <FontAwesome6 name="calculator" size={14} color="#F59E0B" />
                      <Text style={styles.profitPreviewTitle}>预期收益</Text>
                    </View>
                    <View style={styles.profitPreviewGrid}>
                      <View style={styles.profitPreviewItem}>
                        <Text style={styles.profitPreviewLabel}>手续费 (3%)</Text>
                        <Text style={styles.profitPreviewValue}>${ep.fee}</Text>
                      </View>
                      <View style={styles.profitPreviewItem}>
                        <Text style={styles.profitPreviewLabel}>预估收益</Text>
                        <Text style={[styles.profitPreviewValue, { color: parseFloat(ep.profit) >= 0 ? '#22C55E' : '#EF4444' }]}>
                          {parseFloat(ep.profit) >= 0 ? '+' : ''}${ep.profit}
                        </Text>
                      </View>
                      <View style={styles.profitPreviewItem}>
                        <Text style={styles.profitPreviewLabel}>收益率</Text>
                        <Text style={[styles.profitPreviewValue, { color: '#F59E0B' }]}>
                          {ep.profitRate}%
                        </Text>
                      </View>
                      <View style={styles.profitPreviewItem}>
                        <Text style={styles.profitPreviewLabel}>预估到手</Text>
                        <Text style={[styles.profitPreviewValue, { color: '#22C55E' }]}>
                          ${ep.estimatedPayout}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })()}

              <TouchableOpacity
                style={[styles.submitButton, timeLeft <= 0 && styles.submitButtonDisabled]}
                onPress={handleBet}
                disabled={submitting || !amount || parseFloat(amount) < 1 || timeLeft <= 0}
              >
                <LinearGradient
                  colors={timeLeft <= 0 ? ['#6B7280', '#4B5563'] : ['#F59E0B', '#D97706']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitGradient}
                >
                  <Text style={styles.submitButtonText}>
                    {submitting ? '提交中...' : timeLeft <= 0 ? '本期已截止' : `确认${selectedSide === 'up' ? '买涨' : '买跌'} $${amount || '0'}`}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* Insurance Notice */}
          <View style={styles.insuranceNotice}>
            <FontAwesome6 name="shield-halved" size={14} color="#F59E0B" />
            <Text style={styles.insuranceText}>
              20%下注额注入保险仓，预测失败可获保险赔付
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
                    <TouchableOpacity
                      key={voucher.id}
                      style={styles.voucherCard}
                      onPress={() => fetchBetDetail(voucher.id)}
                      activeOpacity={0.7}
                    >
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
                    </TouchableOpacity>
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
                  <Text style={styles.ruleDesc}>奖池扣除3%平台手续费</Text>
                </View>
                <View style={styles.ruleItem}>
                  <Text style={styles.ruleTitle}>奖池分配</Text>
                  <Text style={styles.ruleDesc}>赢家分配80%，保险仓分配20%</Text>
                </View>
                <View style={styles.ruleItem}>
                  <Text style={styles.ruleTitle}>预测正确</Text>
                  <Text style={styles.ruleDesc}>按比例分配赢家奖池（下注越多份额越大）</Text>
                </View>
                <View style={styles.ruleItem}>
                  <Text style={styles.ruleTitle}>预测错误</Text>
                  <Text style={styles.ruleDesc}>下注金额归入奖池，由赢家分配</Text>
                </View>
                <View style={styles.ruleItem}>
                  <Text style={styles.ruleTitle}>无人对赌</Text>
                  <Text style={styles.ruleDesc}>若一方无人下注，本轮自动退款</Text>
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

      {/* Bet Detail Modal */}
      <Modal visible={!!betDetail} animationType="slide" transparent>
        <TouchableWithoutFeedback onPress={() => setBetDetail(null)} disabled={Platform.OS === 'web'}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback disabled>
              <View style={styles.betDetailModal}>
                <View style={styles.betDetailHeader}>
                  <Text style={styles.betDetailTitle}>交易凭证</Text>
                  <TouchableOpacity onPress={() => setBetDetail(null)}>
                    <FontAwesome6 name="xmark" size={20} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>
                {betDetail && (
                  <View style={styles.betDetailBody}>
                    <View style={styles.betDetailRow}>
                      <Text style={styles.betDetailLabel}>凭证编号</Text>
                      <Text style={styles.betDetailValue}>#{betDetail.id}</Text>
                    </View>
                    <View style={styles.betDetailRow}>
                      <Text style={styles.betDetailLabel}>预测方向</Text>
                      <Text style={[styles.betDetailValue, { color: betDetail.betSide === 'up' ? '#22C55E' : '#EF4444' }]}>
                        {betDetail.betSide === 'up' ? '↑ 买涨' : '↓ 买跌'}
                      </Text>
                    </View>
                    <View style={styles.betDetailRow}>
                      <Text style={styles.betDetailLabel}>下注金额</Text>
                      <Text style={styles.betDetailValue}>${betDetail.betAmount}</Text>
                    </View>
                    <View style={styles.betDetailRow}>
                      <Text style={styles.betDetailLabel}>手续费 (3%)</Text>
                      <Text style={styles.betDetailValue}>${betDetail.feeAmount || '0'}</Text>
                    </View>
                    <View style={styles.betDetailRow}>
                      <Text style={styles.betDetailLabel}>实际入池</Text>
                      <Text style={styles.betDetailValue}>${betDetail.actualAmount || '0'}</Text>
                    </View>
                    <View style={styles.betDetailRow}>
                      <Text style={styles.betDetailLabel}>入场价格</Text>
                      <Text style={styles.betDetailValue}>${betDetail.basePrice || '-'}</Text>
                    </View>
                    <View style={styles.betDetailRow}>
                      <Text style={styles.betDetailLabel}>期数</Text>
                      <Text style={styles.betDetailValue}>第 {String(betDetail.roundId).padStart(3, '0')} 期</Text>
                    </View>
                    {betDetail.expectedProfit && (
                      <View style={styles.betDetailRow}>
                        <Text style={styles.betDetailLabel}>预期收益</Text>
                        <Text style={[styles.betDetailValue, { color: '#F59E0B' }]}>
                          {parseFloat(betDetail.expectedProfit) >= 0 ? '+' : ''}${betDetail.expectedProfit}
                        </Text>
                      </View>
                    )}
                    {betDetail.expectedPayout && (
                      <View style={styles.betDetailRow}>
                        <Text style={styles.betDetailLabel}>预估到手</Text>
                        <Text style={[styles.betDetailValue, { color: '#22C55E' }]}>${betDetail.expectedPayout}</Text>
                      </View>
                    )}
                    {betDetail.endPrice && (
                      <View style={styles.betDetailRow}>
                        <Text style={styles.betDetailLabel}>结算价格</Text>
                        <Text style={styles.betDetailValue}>${betDetail.endPrice}</Text>
                      </View>
                    )}
                    {betDetail.won !== null && (
                      <View style={styles.betDetailRow}>
                        <Text style={styles.betDetailLabel}>结果</Text>
                        <Text style={[styles.betDetailValue, { color: betDetail.won ? '#22C55E' : '#EF4444' }]}>
                          {betDetail.won ? '✓ 预测正确' : '✗ 预测错误'}
                        </Text>
                      </View>
                    )}
                    {betDetail.won && betDetail.payout && (
                      <View style={styles.betDetailRow}>
                        <Text style={styles.betDetailLabel}>获得</Text>
                        <Text style={[styles.betDetailValue, { color: '#22C55E' }]}>${betDetail.payout}</Text>
                      </View>
                    )}
                    {betDetail.won && !betDetail.claimed && (
                      <TouchableOpacity style={styles.claimButton} onPress={() => handleClaim(betDetail.roundId)}>
                        <Text style={styles.claimButtonText}>领取奖励</Text>
                      </TouchableOpacity>
                    )}
                    {betDetail.claimed && (
                      <View style={styles.betDetailRow}>
                        <Text style={styles.betDetailLabel}>领取状态</Text>
                        <Text style={[styles.betDetailValue, { color: '#22C55E' }]}>已领取</Text>
                      </View>
                    )}
                    <View style={styles.betDetailRow}>
                      <Text style={styles.betDetailLabel}>下注时间</Text>
                      <Text style={styles.betDetailValue}>{formatDateTime(betDetail.createdAt)}</Text>
                    </View>
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
  // Round Info Bar
  roundInfoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  roundInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roundNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F59E0B',
  },
  roundStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#22C55E',
  },
  roundStatusClosed: {
    color: '#EF4444',
  },
  roundStatusResolving: {
    color: '#F59E0B',
  },
  roundStatusCompleted: {
    color: '#6B7280',
  },
  countdownTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countdownText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F59E0B',
    fontVariant: ['tabular-nums'],
  },
  countdownTextUrgent: {
    color: '#EF4444',
  },
  countdownLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  countdownBar: {
    height: 3,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  countdownFill: {
    height: '100%',
    borderRadius: 2,
  },
  // Profit Preview
  profitPreview: {
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  profitPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  profitPreviewTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F59E0B',
  },
  profitPreviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  profitPreviewItem: {
    flex: 1,
    minWidth: '45%',
  },
  profitPreviewLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  profitPreviewValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  // Submit button disabled
  submitButtonDisabled: {
    opacity: 0.6,
  },
  // Bet Detail Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  betDetailModal: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  betDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  betDetailTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  betDetailBody: {
    gap: 12,
  },
  betDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  betDetailLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  betDetailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
});
