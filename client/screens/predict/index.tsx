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
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useWallet } from '@/contexts/WalletContext';
import { useFocusEffect } from 'expo-router';
import { COLORS } from '@/utils/theme';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;
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
}

export default function PredictScreen() {
  const { isConnected } = useWallet();
  const [data, setData] = useState<PredictionData | null>(null);
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const [amount, setAmount] = useState('');
  const [filter, setFilter] = useState('all');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/predictions`);
      const result = await res.json();
      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Fetch predictions error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

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
        body: JSON.stringify({ direction, amount: amountNum }),
      });
      const result = await res.json();
      if (result.success) {
        setAmount('');
        fetchData();
        Alert.alert('成功', '预测已提交！');
      }
    } catch (error) {
      console.error('Submit prediction error:', error);
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

  const estimatedReturn = (odds: number) => {
    const amt = parseFloat(amount) || 0;
    return (amt * odds).toFixed(2);
  };

  const filteredPredictions = data?.predictions.filter(p => {
    if (filter === 'all') return true;
    return p.status === filter;
  }) || [];

  const quickAmounts = [50, 100, 500];

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
        {/* Title Bar */}
        <View style={styles.titleBar}>
          <View>
            <Text style={styles.title}>BTC/USDT 预测</Text>
            <Text style={styles.subtitle}>5分钟K线预测</Text>
          </View>
          <View style={styles.roundInfo}>
            <Text style={styles.roundText}>第 #{data?.currentRound} 期</Text>
            <View style={styles.timerBadge}>
              <FontAwesome6 name="clock" size={10} color={COLORS.primary} />
              <Text style={styles.timerText}>{data ? formatTime(data.timeLeftSeconds) : '--:--'}</Text>
            </View>
          </View>
        </View>

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
                <FontAwesome6 name="arrow-trend-up" size={20} color={direction === 'up' ? COLORS.success : COLORS.textSecondary} />
                <Text style={[styles.directionText, { color: direction === 'up' ? COLORS.success : COLORS.textSecondary }]}>
                  看涨
                </Text>
                <Text style={[styles.oddsText, { color: direction === 'up' ? COLORS.success : COLORS.textSecondary }]}>
                  {data?.oddsUp}x
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
                <FontAwesome6 name="arrow-trend-down" size={20} color={direction === 'down' ? COLORS.danger : COLORS.textSecondary} />
                <Text style={[styles.directionText, { color: direction === 'down' ? COLORS.danger : COLORS.textSecondary }]}>
                  看跌
                </Text>
                <Text style={[styles.oddsText, { color: direction === 'down' ? COLORS.danger : COLORS.textSecondary }]}>
                  {data?.oddsDown}x
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <Text style={styles.betLabel}>投注金额 (USDT)</Text>
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
                style={styles.quickAmountBtn}
                onPress={() => setAmount(qa.toString())}
              >
                <Text style={styles.quickAmountText}>${qa}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Estimated Return */}
          <View style={styles.estimateRow}>
            <Text style={styles.estimateLabel}>预估收益</Text>
            <Text style={styles.estimateValue}>
              {estimatedReturn(direction === 'up' ? (data?.oddsUp || 1.8) : (data?.oddsDown || 2.2))} USDT
            </Text>
          </View>

          {/* Insurance Notice */}
          <View style={styles.insuranceNotice}>
            <FontAwesome6 name="shield-halved" size={12} color={COLORS.primary} />
            <Text style={styles.insuranceNoticeText}>
              20%投注额将注入保险仓 → 买入TFT
            </Text>
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
                <FontAwesome6 name="crown" size={14} color={COLORS.primary} />
                <Text style={styles.statusText}>VIP · 无限次预测</Text>
              </View>
            ) : (
              <View style={styles.statusContent}>
                <FontAwesome6 name="circle-info" size={14} color={COLORS.textSecondary} />
                <Text style={styles.statusText}>
                  本期已参与 {data.participationCount}/{data.maxParticipation} 次
                </Text>
                <TouchableOpacity>
                  <Text style={styles.upgradeText}> 升级VIP →</Text>
                </TouchableOpacity>
              </View>
            )}
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
              <Text style={styles.emptyText}>暂无预测记录</Text>
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
    paddingBottom: 100,
    paddingHorizontal: 16,
  },
  // Title Bar
  titleBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
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
  roundInfo: {
    alignItems: 'flex-end',
    gap: 6,
  },
  roundText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245,166,35,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  timerText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    fontFamily: 'monospace',
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
    paddingVertical: 16,
    gap: 4,
  },
  directionText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  oddsText: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'monospace',
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
  quickAmountText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  estimateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 8,
  },
  estimateLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  estimateValue: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
    fontFamily: 'monospace',
  },
  insuranceNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245,166,35,0.08)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  insuranceNoticeText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    flex: 1,
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
    marginBottom: 16,
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textSecondary,
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
});
