import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { FontAwesome6 } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useWallet } from '@/contexts/WalletContext';

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

interface MarketMakerStatus {
  isMarketMaker: boolean;
  applicationStatus: 'none' | 'pending' | 'approved' | 'rejected';
  appliedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

interface QualificationProgress {
  method1: {
    directReferrals: number;
    requiredReferrals: number;
    totalPrediction: number;
    requiredPrediction: number;
    teamPrediction: number;
    requiredTeamPrediction: number;
    qualified: boolean;
  };
  method2: {
    vipIncome: number;
    requiredVipIncome: number;
    qualified: boolean;
  };
}

interface MarketMakerBenefits {
  subordinatePredictionDividend: number;
  taxDividend: number;
  vipActivationDividend: number;
}

export default function MarketMakerScreen() {
  const { wallet } = useWallet();
  const router = useSafeRouter();
  const address = wallet?.address;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<MarketMakerStatus | null>(null);
  const [progress, setProgress] = useState<QualificationProgress | null>(null);
  const [benefits, setBenefits] = useState<MarketMakerBenefits | null>(null);

  const fetchData = useCallback(async () => {
    if (!address) {
      setLoading(false);
      return;
    }

    try {
      const [statusRes, progressRes, benefitsRes] = await Promise.all([
        fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/market-maker/status?address=${address}`),
        fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/market-maker/qualification-progress?address=${address}`),
        fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/market-maker/info`),
      ]);

      const [statusData, progressData, benefitsData] = await Promise.all([
        statusRes.json(),
        progressRes.json(),
        benefitsRes.json(),
      ]);

      if (statusData.success) setStatus(statusData.data);
      if (progressData.success) setProgress(progressData.data);
      if (benefitsData.success) setBenefits(benefitsData.data.benefits);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [address]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleApply = async () => {
    if (!address) {
      Alert.alert('提示', '请先连接钱包');
      return;
    }

    if (!progress?.method1.qualified && !progress?.method2.qualified) {
      Alert.alert('提示', '暂不满足做市商申请条件');
      return;
    }

    Alert.alert(
      '申请做市商',
      '确认提交做市商申请？审核周期为24小时内。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认申请',
          onPress: async () => {
            setSubmitting(true);
            try {
              /**
               * 服务端文件：server/src/index.ts
               * 接口：POST /api/v1/market-maker/apply
               * Body 参数：address: string
               */
              const response = await fetch(
                `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/market-maker/apply`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ address }),
                }
              );

              const data = await response.json();

              if (data.success) {
                Alert.alert('成功', '做市商申请已提交，请等待审核');
                fetchData();
              } else {
                Alert.alert('错误', data.error || '申请失败');
              }
            } catch (error) {
              Alert.alert('错误', '网络错误，请稍后重试');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
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

  const canApply = progress?.method1.qualified || progress?.method2.qualified;
  const hasApplied = status?.applicationStatus === 'pending' || status?.applicationStatus === 'approved';

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
            <View style={styles.headerIcon}>
              <FontAwesome6 name="chart-line" size={28} color={COLORS.primary} />
            </View>
            <Text style={styles.headerTitle}>做市商中心</Text>
            <Text style={styles.headerSubtitle}>Market Maker Center</Text>
          </View>
        </View>

        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>当前身份</Text>
            <View style={[styles.statusBadge, status?.isMarketMaker && styles.statusBadgeActive]}>
              <Text style={[styles.statusText, status?.isMarketMaker && styles.statusTextActive]}>
                {status?.isMarketMaker ? '做市商' : '非做市商'}
              </Text>
            </View>
          </View>
          {status?.applicationStatus === 'pending' && (
            <View style={styles.pendingBanner}>
              <FontAwesome6 name="clock" size={14} color={COLORS.warning} />
              <Text style={styles.pendingText}>申请审核中，预计24小时内完成</Text>
            </View>
          )}
          {status?.applicationStatus === 'approved' && status?.reviewedAt && (
            <View style={styles.approvedBanner}>
              <FontAwesome6 name="circle-check" size={14} color={COLORS.success} />
              <Text style={styles.approvedText}>
                审核通过：{new Date(status.reviewedAt).toLocaleDateString()}
              </Text>
            </View>
          )}
          {status?.applicationStatus === 'rejected' && (
            <View style={styles.rejectedBanner}>
              <FontAwesome6 name="circle-xmark" size={14} color={COLORS.danger} />
              <Text style={styles.rejectedText}>
                申请被拒绝{status.rejectionReason ? `：${status.rejectionReason}` : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Qualification Progress */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome6 name="list-check" size={18} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>申请条件（满足其一）</Text>
          </View>

          {/* Method 1 */}
          <View style={styles.methodCard}>
            <View style={styles.methodHeader}>
              <View style={styles.methodBadge}>
                <Text style={styles.methodBadgeText}>方式一</Text>
              </View>
              {progress?.method1.qualified && (
                <View style={styles.qualifiedBadge}>
                  <FontAwesome6 name="check" size={10} color={COLORS.success} />
                  <Text style={styles.qualifiedText}>已满足</Text>
                </View>
              )}
            </View>
            <Text style={styles.methodDesc}>直推10人，每人预测≥$200，伞下总预测≥$2,000</Text>
            
            <View style={styles.progressItem}>
              <View style={styles.progressLabel}>
                <Text style={styles.progressLabelText}>直推人数</Text>
                <Text style={styles.progressValueText}>
                  {progress?.method1.directReferrals || 0} / 10
                </Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(((progress?.method1.directReferrals || 0) / 10) * 100, 100)}%` },
                  ]}
                />
              </View>
            </View>

            <View style={styles.progressItem}>
              <View style={styles.progressLabel}>
                <Text style={styles.progressLabelText}>人均预测额</Text>
                <Text style={styles.progressValueText}>
                  ${progress?.method1.totalPrediction.toFixed(0) || 0} / $200
                </Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(((progress?.method1.totalPrediction || 0) / 200) * 100, 100)}%` },
                  ]}
                />
              </View>
            </View>

            <View style={styles.progressItem}>
              <View style={styles.progressLabel}>
                <Text style={styles.progressLabelText}>伞下总预测</Text>
                <Text style={styles.progressValueText}>
                  ${progress?.method1.teamPrediction.toFixed(0) || 0} / $2,000
                </Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(((progress?.method1.teamPrediction || 0) / 2000) * 100, 100)}%` },
                  ]}
                />
              </View>
            </View>
          </View>

          {/* Method 2 */}
          <View style={styles.methodCard}>
            <View style={styles.methodHeader}>
              <View style={styles.methodBadge}>
                <Text style={styles.methodBadgeText}>方式二</Text>
              </View>
              {progress?.method2.qualified && (
                <View style={styles.qualifiedBadge}>
                  <FontAwesome6 name="check" size={10} color={COLORS.success} />
                  <Text style={styles.qualifiedText}>已满足</Text>
                </View>
              )}
            </View>
            <Text style={styles.methodDesc}>个人VIP收益（直推+见点累计）≥$500</Text>
            
            <View style={styles.progressItem}>
              <View style={styles.progressLabel}>
                <Text style={styles.progressLabelText}>VIP累计收益</Text>
                <Text style={styles.progressValueText}>
                  ${progress?.method2.vipIncome.toFixed(2) || 0} / $500
                </Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(((progress?.method2.vipIncome || 0) / 500) * 100, 100)}%` },
                  ]}
                />
              </View>
            </View>
          </View>
        </View>

        {/* Benefits */}
        {benefits && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FontAwesome6 name="gift" size={18} color={COLORS.success} />
              <Text style={styles.sectionTitle}>做市商权益</Text>
            </View>
            <View style={styles.benefitsCard}>
              <View style={styles.benefitRow}>
                <View style={styles.benefitIcon}>
                  <FontAwesome6 name="users" size={16} color={COLORS.primary} />
                </View>
                <View style={styles.benefitInfo}>
                  <Text style={styles.benefitLabel}>伞下预测分红</Text>
                  <Text style={styles.benefitDesc}>赢家池 0.3%，个人独享</Text>
                </View>
                <Text style={styles.benefitValue}>{(benefits.subordinatePredictionDividend * 100).toFixed(1)}%</Text>
              </View>
              <View style={styles.benefitRow}>
                <View style={[styles.benefitIcon, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <FontAwesome6 name="coins" size={16} color={COLORS.success} />
                </View>
                <View style={styles.benefitInfo}>
                  <Text style={styles.benefitLabel}>滑点手续费分红</Text>
                  <Text style={styles.benefitDesc}>所有做市商平均分配</Text>
                </View>
                <Text style={styles.benefitValue}>{(benefits.taxDividend * 100).toFixed(0)}%</Text>
              </View>
              <View style={styles.benefitRow}>
                <View style={[styles.benefitIcon, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                  <FontAwesome6 name="crown" size={16} color={COLORS.warning} />
                </View>
                <View style={styles.benefitInfo}>
                  <Text style={styles.benefitLabel}>VIP激活费分红</Text>
                  <Text style={styles.benefitDesc}>所有做市商平均分配</Text>
                </View>
                <Text style={styles.benefitValue}>{(benefits.vipActivationDividend * 100).toFixed(0)}%</Text>
              </View>
            </View>
          </View>
        )}

        {/* Apply Button */}
        {!status?.isMarketMaker && !hasApplied && (
          <TouchableOpacity
            style={[styles.applyButton, !canApply && styles.applyButtonDisabled]}
            onPress={handleApply}
            disabled={!canApply || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={COLORS.textPrimary} />
            ) : (
              <>
                <FontAwesome6 name="paper-plane" size={16} color={COLORS.textPrimary} />
                <Text style={styles.applyButtonText}>
                  {canApply ? '申请成为做市商' : '暂不满足申请条件'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Footer Note */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>审核周期：24小时内完成审核</Text>
          <Text style={styles.footerText}>资格有效期：长期有效</Text>
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
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  statusCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  statusBadge: {
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusBadgeActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  statusTextActive: {
    color: COLORS.success,
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    gap: 8,
  },
  pendingText: {
    fontSize: 12,
    color: COLORS.warning,
  },
  approvedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    gap: 8,
  },
  approvedText: {
    fontSize: 12,
    color: COLORS.success,
  },
  rejectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    gap: 8,
  },
  rejectedText: {
    fontSize: 12,
    color: COLORS.danger,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  methodCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  methodHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  methodBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  methodBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  qualifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  qualifiedText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.success,
  },
  methodDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  progressItem: {
    marginBottom: 12,
  },
  progressLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabelText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  progressValueText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  progressBar: {
    height: 6,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },
  benefitsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  benefitIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  benefitInfo: {
    flex: 1,
  },
  benefitLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  benefitDesc: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  benefitValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.success,
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    gap: 8,
  },
  applyButtonDisabled: {
    backgroundColor: COLORS.surfaceLight,
  },
  applyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 4,
  },
  footerText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
});
