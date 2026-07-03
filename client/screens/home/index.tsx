import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
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

export default function HomeScreen() {
  const { isConnected, wallet } = useWallet();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [btcPrice, setBtcPrice] = useState<BTCPrice | null>(null);
  const [klineData, setKlineData] = useState<KlineItem[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [overviewRes, priceRes, klineRes, predRes] = await Promise.all([
        fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/dashboard/overview?wallet=${isConnected}`),
        fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/btc/price`),
        fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/btc/kline?count=20`),
        fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/predictions`),
      ]);

      const [overviewData, priceData, klineResult, predData] = await Promise.all([
        overviewRes.json(),
        priceRes.json(),
        klineRes.json(),
        predRes.json(),
      ]);

      if (overviewData.success) setOverview(overviewData.data);
      if (priceData.success) setBtcPrice(priceData.data);
      if (klineResult.success) setKlineData(klineResult.data);
      if (predData.success) setPredictions(predData.data.predictions.slice(0, 5));
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

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
      case 'won': return 'Won';
      case 'lost': return 'Lost';
      case 'pending': return 'Pending';
      case 'claimed': return 'Claimed';
      default: return status;
    }
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
              <View style={styles.walletBadge}>
                <View style={styles.walletDot} />
                <Text style={styles.walletText}>{wallet?.shortAddress}</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.connectBtn}>
                <Text style={styles.connectBtnText}>Connect</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Overview Cards */}
        <View style={styles.overviewGrid}>
          <OverviewCard
            label="Account Value"
            value={isConnected && overview?.accountValue ? `$${formatNumber(overview.accountValue)}` : '--'}
            icon="wallet"
            color={COLORS.primary}
          />
          <OverviewCard
            label="24h P&L"
            value={isConnected && overview?.pnl24h !== null && overview?.pnl24h !== undefined ? `${overview.pnl24h >= 0 ? '+' : ''}$${formatNumber(overview.pnl24h)}` : '--'}
            icon="arrow-trend-up"
            color={isConnected && overview?.pnl24h && overview.pnl24h >= 0 ? COLORS.success : COLORS.danger}
          />
          <OverviewCard
            label="Active Positions"
            value={isConnected && overview?.activePositions !== null && overview?.activePositions !== undefined ? `${overview.activePositions}` : '--'}
            icon="layer-group"
            color={COLORS.primary}
          />
          <OverviewCard
            label="24h Volume"
            value={overview ? formatCompact(overview.volume24h) : '--'}
            icon="chart-bar"
            color={COLORS.primaryLight}
          />
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.quickActionBtn}>
              <LinearGradient
                colors={['rgba(0,200,151,0.15)', 'rgba(0,200,151,0.05)']}
                style={styles.quickActionGradient}
              >
                <FontAwesome6 name="arrow-trend-up" size={18} color={COLORS.success} />
                <Text style={[styles.quickActionText, { color: COLORS.success }]}>Long</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickActionBtn}>
              <LinearGradient
                colors={['rgba(255,107,107,0.15)', 'rgba(255,107,107,0.05)']}
                style={styles.quickActionGradient}
              >
                <FontAwesome6 name="arrow-trend-down" size={18} color={COLORS.danger} />
                <Text style={[styles.quickActionText, { color: COLORS.danger }]}>Short</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickActionBtn}>
              <LinearGradient
                colors={['rgba(245,166,35,0.15)', 'rgba(245,166,35,0.05)']}
                style={styles.quickActionGradient}
              >
                <FontAwesome6 name="bolt" size={18} color={COLORS.primary} />
                <Text style={[styles.quickActionText, { color: COLORS.primary }]}>Quick</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* BTC Price + Chart */}
        <View style={styles.section}>
          <View style={styles.priceHeader}>
            <View>
              <Text style={styles.priceLabel}>BTC/USD</Text>
              <Text style={styles.priceValue}>
                ${btcPrice ? formatNumber(btcPrice.price) : '--'}
              </Text>
            </View>
            <View style={styles.priceChangeContainer}>
              <Text style={[
                styles.priceChange,
                { color: btcPrice && btcPrice.change24h >= 0 ? COLORS.success : COLORS.danger }
              ]}>
                {btcPrice && btcPrice.change24h >= 0 ? '▲' : '▼'}{' '}
                {btcPrice ? `${Math.abs(btcPrice.change24h).toFixed(2)}%` : '--'}
              </Text>
            </View>
          </View>

          <View style={styles.priceMeta}>
            <Text style={styles.priceMetaItem}>
              H: ${btcPrice ? formatNumber(btcPrice.high24h) : '--'}
            </Text>
            <Text style={styles.priceMetaItem}>
              L: ${btcPrice ? formatNumber(btcPrice.low24h) : '--'}
            </Text>
          </View>

          {/* Mini K-line Chart */}
          <View style={styles.chartContainer}>
            <MiniChart data={klineData} />
          </View>
        </View>

        {/* Insurance Pool */}
        {overview && (
          <View style={styles.insuranceBar}>
            <View style={styles.insuranceLeft}>
              <FontAwesome6 name="shield-halved" size={16} color={COLORS.primary} />
              <Text style={styles.insuranceLabel}>Insurance Pool</Text>
            </View>
            <View style={styles.insuranceRight}>
              <Text style={styles.insuranceValue}>
                {formatNumber(overview.insurancePoolBalance, 0)} TFT
              </Text>
              <Text style={styles.insuranceSub}>
                Round: +{overview.insurancePoolInjection} TFT
              </Text>
            </View>
          </View>
        )}

        {/* Recent Predictions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Predictions</Text>
            <TouchableOpacity>
              <Text style={styles.viewAllText}>View All →</Text>
            </TouchableOpacity>
          </View>

          {predictions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No predictions yet</Text>
            </View>
          ) : (
            <View style={styles.predictionList}>
              {predictions.map((item) => (
                <View key={item.id} style={styles.predictionItem}>
                  <View style={styles.predictionLeft}>
                    <View style={[
                      styles.directionBadge,
                      { backgroundColor: item.direction === 'up' ? 'rgba(0,200,151,0.15)' : 'rgba(255,107,107,0.15)' }
                    ]}>
                      <FontAwesome6
                        name={item.direction === 'up' ? 'arrow-trend-up' : 'arrow-trend-down'}
                        size={12}
                        color={item.direction === 'up' ? COLORS.success : COLORS.danger}
                      />
                    </View>
                    <View>
                      <Text style={styles.predictionTime}>{item.time}</Text>
                      <Text style={styles.predictionAmount}>${item.amount}</Text>
                    </View>
                  </View>
                  <View style={styles.predictionRight}>
                    <Text style={[styles.predictionStatus, { color: getStatusColor(item.status) }]}>
                      {getStatusLabel(item.status)}
                    </Text>
                    {item.status === 'won' && (
                      <Text style={[styles.predictionProfit, { color: COLORS.success }]}>
                        +${formatNumber(item.profit)}
                      </Text>
                    )}
                    {item.status === 'won' && (
                      <TouchableOpacity style={styles.claimBtn}>
                        <Text style={styles.claimBtnText}>Claim</Text>
                      </TouchableOpacity>
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

// Overview Card Component
function OverviewCard({ label, value, icon, color }: {
  label: string;
  value: string;
  icon: string;
  color: string;
}) {
  return (
    <View style={styles.overviewCard}>
      <View style={styles.overviewCardHeader}>
        <FontAwesome6 name={icon as any} size={14} color={color} />
        <Text style={styles.overviewLabel}>{label}</Text>
      </View>
      <Text style={[styles.overviewValue, { color }]}>{value}</Text>
    </View>
  );
}

// Mini Chart Component
function MiniChart({ data }: { data: KlineItem[] }) {
  if (data.length === 0) return null;

  const chartWidth = width - 48;
  const chartHeight = 120;
  const barWidth = Math.max((chartWidth / data.length) - 2, 3);

  const allPrices = data.flatMap(d => [d.high, d.low]);
  const maxPrice = Math.max(...allPrices);
  const minPrice = Math.min(...allPrices);
  const priceRange = maxPrice - minPrice || 1;

  const scaleY = (price: number) => {
    return chartHeight - ((price - minPrice) / priceRange) * chartHeight;
  };

  return (
    <View style={[styles.miniChart, { width: chartWidth, height: chartHeight }]}>
      {data.map((item, index) => {
        const isUp = item.close >= item.open;
        const color = isUp ? COLORS.success : COLORS.danger;
        const bodyTop = scaleY(Math.max(item.open, item.close));
        const bodyBottom = scaleY(Math.min(item.open, item.close));
        const bodyHeight = Math.max(bodyBottom - bodyTop, 1);
        const wickTop = scaleY(item.high);
        const wickBottom = scaleY(item.low);
        const x = index * (barWidth + 2);

        return (
          <View key={index} style={{ position: 'absolute', left: x }}>
            {/* Upper wick */}
            <View style={{
              position: 'absolute',
              left: barWidth / 2 - 0.5,
              top: wickTop,
              width: 1,
              height: bodyTop - wickTop,
              backgroundColor: color,
              opacity: 0.6,
            }} />
            {/* Body */}
            <View style={{
              position: 'absolute',
              top: bodyTop,
              width: barWidth,
              height: bodyHeight,
              backgroundColor: color,
              borderRadius: 1,
            }} />
            {/* Lower wick */}
            <View style={{
              position: 'absolute',
              left: barWidth / 2 - 0.5,
              top: bodyTop + bodyHeight,
              width: 1,
              height: wickBottom - (bodyTop + bodyHeight),
              backgroundColor: color,
              opacity: 0.6,
            }} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 56,
    paddingBottom: 100,
    paddingHorizontal: 16,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
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
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notificationBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  walletBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
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
    fontFamily: 'monospace',
  },
  connectBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  connectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.background,
  },
  // Overview Grid
  overviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  overviewCard: {
    width: (width - 48) / 2,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  overviewCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  overviewLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  overviewValue: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  // Quick Actions
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
  },
  quickActionBtn: {
    flex: 1,
  },
  quickActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  // Price Section
  priceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontFamily: 'monospace',
  },
  priceChangeContainer: {
    marginTop: 4,
  },
  priceChange: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  priceMeta: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  priceMetaItem: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: 'monospace',
  },
  chartContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  miniChart: {
    overflow: 'hidden',
  },
  // Insurance Bar
  insuranceBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  insuranceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  insuranceLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  insuranceRight: {
    alignItems: 'flex-end',
  },
  insuranceValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    fontFamily: 'monospace',
  },
  insuranceSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  // Predictions
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  viewAllText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
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
  predictionList: {
    gap: 8,
  },
  predictionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  predictionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  directionBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  predictionTime: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: 'monospace',
  },
  predictionAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    fontFamily: 'monospace',
  },
  predictionRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  predictionStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  predictionProfit: {
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
