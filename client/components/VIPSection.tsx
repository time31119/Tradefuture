import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome6 } from '@expo/vector-icons';
import { useWallet } from '@/contexts/WalletContext';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { COLORS } from '@/utils/theme';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';

interface VIPSectionProps {
  isVIP?: boolean;
  onVIPStatusChange?: () => void;
}

export function VIPSection({ isVIP = false, onVIPStatusChange }: VIPSectionProps) {
  const router = useSafeRouter();
  const { isConnected, connect, wallet } = useWallet();
  const [activating, setActivating] = useState(false);
  const [benefitsModalVisible, setBenefitsModalVisible] = useState(false);

  // If already VIP, show VIP status card
  if (isVIP) {
    return (
      <View style={styles.vipStatusContainer}>
        <LinearGradient
          colors={['#2A1F0A', '#1A1508']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.vipStatusGradient}
        >
          <View style={styles.vipStatusHeader}>
            <View style={styles.vipBadge}>
              <FontAwesome6 name="crown" size={14} color={COLORS.primary} />
              <Text style={styles.vipBadgeText}>VIP 会员</Text>
            </View>
            <TouchableOpacity onPress={() => setBenefitsModalVisible(true)}>
              <Text style={styles.viewBenefitsText}>查看权益</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.vipWelcomeText}>尊贵的 VIP 会员</Text>
          <Text style={styles.vipDescText}>您已解锁全部 VIP 专属权益</Text>
        </LinearGradient>
      </View>
    );
  }

  // Handle VIP activation
  const handleActivateVIP = async () => {
    if (!isConnected) {
      connect();
      return;
    }

    setActivating(true);
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/vip/activate
       * Body 参数：referrer?: string (推荐人地址)
       */
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/vip/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: wallet?.address }),
      });
      const data = await res.json();

      if (data.success) {
        Alert.alert('激活成功', '恭喜！您已成为 VIP 会员');
        onVIPStatusChange?.();
      } else {
        Alert.alert('激活失败', data.error || '请稍后重试');
      }
    } catch (error) {
      console.error('VIP activation error:', error);
      Alert.alert('错误', '网络错误，请稍后重试');
    } finally {
      setActivating(false);
    }
  };

  return (
    <>
      <View style={styles.container}>
        {/* User Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusBadge}>
            <FontAwesome6 name="user" size={10} color={COLORS.textSecondary} />
            <Text style={styles.statusBadgeText}>BASIC USER</Text>
          </View>
          <Text style={styles.upgradeTitle}>升级为 VIP 身份</Text>
        </View>

        {/* Activation Fee Card */}
        <View style={styles.feeCard}>
          <View style={styles.feeHeader}>
            <View>
              <Text style={styles.feeLabel}>激活费用</Text>
              <Text style={styles.feeHint}>请确保钱包中留有少量 BNB 作为手续费</Text>
            </View>
            <Text style={styles.feeAmount}>100.00 美元</Text>
          </View>

          {/* CTA Button */}
          <TouchableOpacity
            style={styles.activateButton}
            activeOpacity={0.85}
            onPress={handleActivateVIP}
            disabled={activating}
          >
            <LinearGradient
              colors={[COLORS.primary, COLORS.primaryLight]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.activateGradient}
            >
              {activating ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <>
                  <FontAwesome6 name="arrow-right" size={16} color="#000" />
                  <Text style={styles.activateButtonText}>
                    {isConnected ? '立即激活 VIP' : '连接钱包激活'}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* VIP Benefits Section */}
        <View style={styles.benefitsSection}>
          <Text style={styles.benefitsTitle}>VIP 核心权益及分配</Text>

          {/* Benefit Item 1: Return Digital Assets */}
          <TouchableOpacity
            style={styles.benefitCard}
            activeOpacity={0.7}
            onPress={() => setBenefitsModalVisible(true)}
          >
            <View style={styles.benefitIconBox}>
              <FontAwesome6 name="gem" size={18} color={COLORS.primary} />
            </View>
            <View style={styles.benefitContent}>
              <Text style={styles.benefitTitle}>返还数字资产</Text>
              <Text style={styles.benefitDesc}>激活即购买等值 20 美元的 TFT 数字资产</Text>
            </View>
          </TouchableOpacity>

          {/* Benefit Item 2: Referral Rewards */}
          <TouchableOpacity
            style={styles.benefitCard}
            activeOpacity={0.7}
            onPress={() => setBenefitsModalVisible(true)}
          >
            <View style={styles.benefitIconBox}>
              <FontAwesome6 name="users" size={18} color={COLORS.primary} />
            </View>
            <View style={styles.benefitContent}>
              <Text style={styles.benefitTitle}>推荐奖励</Text>
              <Text style={styles.benefitDesc}>直推奖 50 美元，见点奖 1 美元</Text>
            </View>
          </TouchableOpacity>

          {/* Benefit Item 3: Node Gift */}
          <TouchableOpacity
            style={styles.benefitCard}
            activeOpacity={0.7}
            onPress={() => setBenefitsModalVisible(true)}
          >
            <View style={styles.benefitIconBox}>
              <FontAwesome6 name="cubes" size={18} color={COLORS.primary} />
            </View>
            <View style={styles.benefitContent}>
              <Text style={styles.benefitTitle}>赠送节点</Text>
              <Text style={styles.benefitDesc}>活动期间，推荐奖励达 30000 美元赠送节点</Text>
            </View>
          </TouchableOpacity>

          {/* Benefit Item 4: Prediction Insurance */}
          <TouchableOpacity
            style={styles.benefitCard}
            activeOpacity={0.7}
            onPress={() => setBenefitsModalVisible(true)}
          >
            <View style={styles.benefitIconBox}>
              <FontAwesome6 name="shield-halved" size={18} color={COLORS.primary} />
            </View>
            <View style={styles.benefitContent}>
              <Text style={styles.benefitTitle}>预测保险</Text>
              <Text style={styles.benefitDesc}>参与平台预测市场，享受额外保障</Text>
            </View>
          </TouchableOpacity>

          {/* Benefit Item 5: Distribution */}
          <TouchableOpacity
            style={styles.benefitCard}
            activeOpacity={0.7}
            onPress={() => setBenefitsModalVisible(true)}
          >
            <View style={styles.benefitIconBox}>
              <FontAwesome6 name="arrows-spin" size={18} color={COLORS.primary} />
            </View>
            <View style={styles.benefitContent}>
              <Text style={styles.benefitTitle}>其他分配</Text>
              <Text style={styles.benefitDesc}>节点 3 美元，运营 1 美元，市值 1 美元，销毁 5 美元</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Benefits Detail Modal */}
      <Modal
        visible={benefitsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBenefitsModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setBenefitsModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <FontAwesome6 name="crown" size={18} color={COLORS.primary} />
                <Text style={styles.modalTitle}>VIP 权益详情</Text>
              </View>
              <TouchableOpacity onPress={() => setBenefitsModalVisible(false)}>
                <FontAwesome6 name="xmark" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {/* Activation Fee Distribution */}
              <Text style={styles.modalSectionTitle}>激活费 $100 分配</Text>
              
              <View style={styles.distributionRow}>
                <View style={styles.distributionItem}>
                  <Text style={styles.distributionAmount}>$50</Text>
                  <Text style={styles.distributionLabel}>直推奖励</Text>
                </View>
                <View style={styles.distributionItem}>
                  <Text style={styles.distributionAmount}>$20</Text>
                  <Text style={styles.distributionLabel}>返还用户</Text>
                </View>
                <View style={styles.distributionItem}>
                  <Text style={styles.distributionAmount}>$20</Text>
                  <Text style={styles.distributionLabel}>见点奖励</Text>
                </View>
              </View>

              <View style={styles.distributionRow}>
                <View style={styles.distributionItem}>
                  <Text style={styles.distributionAmount}>$5</Text>
                  <Text style={styles.distributionLabel}>自动销毁</Text>
                </View>
                <View style={styles.distributionItem}>
                  <Text style={styles.distributionAmount}>$3</Text>
                  <Text style={styles.distributionLabel}>节点分红</Text>
                </View>
                <View style={styles.distributionItem}>
                  <Text style={styles.distributionAmount}>$2</Text>
                  <Text style={styles.distributionLabel}>运营+市值</Text>
                </View>
              </View>

              {/* Benefits List */}
              <Text style={[styles.modalSectionTitle, { marginTop: 24 }]}>核心权益</Text>

              <View style={styles.benefitDetailItem}>
                <View style={styles.benefitDetailIcon}>
                  <FontAwesome6 name="gem" size={14} color={COLORS.primary} />
                </View>
                <View style={styles.benefitDetailContent}>
                  <Text style={styles.benefitDetailTitle}>返还数字资产</Text>
                  <Text style={styles.benefitDetailDesc}>激活即获得等值 $20 的 TFT 数字资产，即时到账</Text>
                </View>
              </View>

              <View style={styles.benefitDetailItem}>
                <View style={styles.benefitDetailIcon}>
                  <FontAwesome6 name="users" size={14} color={COLORS.primary} />
                </View>
                <View style={styles.benefitDetailContent}>
                  <Text style={styles.benefitDetailTitle}>推荐奖励</Text>
                  <Text style={styles.benefitDetailDesc}>直推奖励 $50（上级独享）+ 见点奖励 20 层 × $1</Text>
                </View>
              </View>

              <View style={styles.benefitDetailItem}>
                <View style={styles.benefitDetailIcon}>
                  <FontAwesome6 name="cubes" size={14} color={COLORS.primary} />
                </View>
                <View style={styles.benefitDetailContent}>
                  <Text style={styles.benefitDetailTitle}>赠送节点</Text>
                  <Text style={styles.benefitDetailDesc}>活动期间，推荐奖励累计达 $30,000 赠送节点合伙人资格</Text>
                </View>
              </View>

              <View style={styles.benefitDetailItem}>
                <View style={styles.benefitDetailIcon}>
                  <FontAwesome6 name="shield-halved" size={14} color={COLORS.primary} />
                </View>
                <View style={styles.benefitDetailContent}>
                  <Text style={styles.benefitDetailTitle}>预测保险</Text>
                  <Text style={styles.benefitDetailDesc}>参与预测市场，失败时可获得保险仓 40% 价值等值 TFT 赔付</Text>
                </View>
              </View>
            </View>

            {!isVIP && (
              <TouchableOpacity
                style={styles.modalActivateBtn}
                onPress={() => {
                  setBenefitsModalVisible(false);
                  handleActivateVIP();
                }}
                disabled={activating}
              >
                <LinearGradient
                  colors={[COLORS.primary, COLORS.primaryLight]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.modalActivateGradient}
                >
                  {activating ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Text style={styles.modalActivateText}>立即激活 VIP - $100 USDT</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  // VIP Status (already VIP)
  vipStatusContainer: {
    marginBottom: 16,
  },
  vipStatusGradient: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
  },
  vipStatusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  vipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  vipBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  viewBenefitsText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
  },
  vipWelcomeText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 4,
  },
  vipDescText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  // Status Card
  statusCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  upgradeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  // Fee Card
  feeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  feeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  feeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  feeHint: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  feeAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.primary,
  },
  // Activate Button
  activateButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  activateGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  activateButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  // Benefits Section
  benefitsSection: {
    marginTop: 4,
  },
  benefitsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  benefitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  benefitIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  benefitContent: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  benefitDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  modalBody: {
    padding: 20,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Distribution
  distributionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  distributionItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 4,
  },
  distributionAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
  },
  distributionLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  // Benefit Detail
  benefitDetailItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  benefitDetailIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  benefitDetailContent: {
    flex: 1,
  },
  benefitDetailTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  benefitDetailDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  // Modal Activate Button
  modalActivateBtn: {
    margin: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalActivateGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActivateText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
});
