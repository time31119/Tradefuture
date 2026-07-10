import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome6 } from '@expo/vector-icons';
import { useWallet } from '@/contexts/WalletContext';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { COLORS } from '@/utils/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';

interface VIPSectionProps {
  isVIP?: boolean;
  onVIPStatusChange?: () => void;
}

// VIP Benefits data
const VIP_BENEFITS = [
  {
    id: 1,
    icon: 'gem' as const,
    title: '返还数字资产',
    desc: '激活即获等值 $20 的 TFT',
    detail: '激活后立即获得等值 20 美元的 TFT 数字资产，即时到账，无任何锁仓限制',
    highlight: '$20',
  },
  {
    id: 2,
    icon: 'users' as const,
    title: '推荐奖励',
    desc: '直推 $50 + 见点 $1×20层',
    detail: '直推奖励 $50（直接上级独享）+ 见点奖励 20 层 × $1，沿推荐链逐级分配',
    highlight: '$50',
  },
  {
    id: 3,
    icon: 'cubes' as const,
    title: '赠送节点',
    desc: '推荐奖励达 $30,000 赠送',
    detail: '活动期间，推荐奖励累计达 $30,000 即可免费获得节点合伙人资格，享受平台交易税分红',
    highlight: '节点',
  },
  {
    id: 4,
    icon: 'shield-halved' as const,
    title: '预测保险',
    desc: '预测失败享保险仓赔付',
    detail: '参与预测市场，失败时可获得保险仓 100% 价值等值 TFT 赔付，输家也能成为 TFT 持有者',
    highlight: '100%',
  },
  {
    id: 5,
    icon: 'arrows-spin' as const,
    title: '生态贡献',
    desc: '节点3 + 运营1 + 市值1 + 销毁5',
    detail: '激活费中 $3 进入节点分红池，$1 运营，$1 市值管理，$5 自动销毁推动通缩',
    highlight: '通缩',
  },
];

// Fee distribution data
const FEE_DISTRIBUTION = [
  { amount: '$50', label: '直推奖励', percent: '50%' },
  { amount: '$20', label: '返还用户', percent: '20%' },
  { amount: '$20', label: '见点奖励', percent: '20%' },
  { amount: '$5', label: '自动销毁', percent: '5%' },
  { amount: '$3', label: '节点分红', percent: '3%' },
  { amount: '$2', label: '运营+市值', percent: '2%' },
];

export function VIPSection({ isVIP = false, onVIPStatusChange }: VIPSectionProps) {
  const router = useSafeRouter();
  const { isConnected, connect, wallet } = useWallet();
  const [activating, setActivating] = useState(false);
  const [benefitsModalVisible, setBenefitsModalVisible] = useState(false);
  const [selectedBenefit, setSelectedBenefit] = useState<typeof VIP_BENEFITS[0] | null>(null);

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

  const handleBenefitPress = (benefit: typeof VIP_BENEFITS[0]) => {
    setSelectedBenefit(benefit);
    setBenefitsModalVisible(true);
  };

  // If already VIP, show VIP status card
  if (isVIP) {
    return (
      <View style={styles.vipStatusContainer}>
        <LinearGradient
          colors={['#2A1F0A', '#1A1508', '#0D0D0D']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.vipStatusGradient}
        >
          {/* Decorative glow */}
          <View style={styles.vipGlow} />
          
          <View style={styles.vipStatusHeader}>
            <View style={styles.vipBadge}>
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryLight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.vipBadgeGradient}
              >
                <FontAwesome6 name="crown" size={12} color="#000" />
              </LinearGradient>
              <Text style={styles.vipBadgeText}>VIP 会员</Text>
            </View>
            <TouchableOpacity 
              style={styles.viewBenefitsBtn}
              onPress={() => setBenefitsModalVisible(true)}
            >
              <Text style={styles.viewBenefitsText}>查看权益</Text>
              <FontAwesome6 name="chevron-right" size={10} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.vipWelcomeText}>尊贵的 VIP 会员</Text>
          <Text style={styles.vipDescText}>您已解锁全部 VIP 专属权益</Text>
          
          {/* Quick stats */}
          <View style={styles.vipStatsRow}>
            <View style={styles.vipStatItem}>
              <Text style={styles.vipStatValue}>$50</Text>
              <Text style={styles.vipStatLabel}>直推奖励</Text>
            </View>
            <View style={styles.vipStatDivider} />
            <View style={styles.vipStatItem}>
              <Text style={styles.vipStatValue}>$20</Text>
              <Text style={styles.vipStatLabel}>资产返还</Text>
            </View>
            <View style={styles.vipStatDivider} />
            <View style={styles.vipStatItem}>
              <Text style={styles.vipStatValue}>20层</Text>
              <Text style={styles.vipStatLabel}>见点奖励</Text>
            </View>
          </View>
        </LinearGradient>

        {/* VIP Benefits Modal */}
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
              <VIPBenefitsModalContent 
                isVIP={isVIP}
                onClose={() => setBenefitsModalVisible(false)}
                onActivate={handleActivateVIP}
                activating={activating}
              />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  }

  return (
    <>
      <View style={styles.container}>
        {/* Hero Card - Combined Status + Fee + CTA */}
        <LinearGradient
          colors={['#1A1508', '#0D0D0D']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.heroCard}
        >
          {/* Decorative elements */}
          <View style={styles.heroGlow} />
          <View style={styles.heroGlow2} />
          
          {/* Status Badge */}
          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.statusBadgeText}>BASIC USER</Text>
          </View>

          {/* Title */}
          <Text style={styles.heroTitle}>升级为 VIP 身份</Text>
          <Text style={styles.heroSubtitle}>解锁全部权益，开启收益之旅</Text>

          {/* Fee Display */}
          <View style={styles.feeDisplay}>
            <View style={styles.feeLabelBox}>
              <Text style={styles.feeLabel}>激活费用</Text>
              <Text style={styles.feeHint}>需少量 BNB 作为手续费</Text>
            </View>
            <View style={styles.feeAmountBox}>
              <Text style={styles.feeCurrency}>$</Text>
              <Text style={styles.feeAmount}>100</Text>
              <Text style={styles.feeDecimal}>.00</Text>
              <Text style={styles.feeUnit}> USDT</Text>
            </View>
          </View>

          {/* CTA Button */}
          <TouchableOpacity
            style={styles.activateButton}
            activeOpacity={0.85}
            onPress={handleActivateVIP}
            disabled={activating}
          >
            <LinearGradient
              colors={[COLORS.primary, COLORS.primaryLight, COLORS.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.activateGradient}
            >
              {activating ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <>
                  <FontAwesome6 name={isConnected ? 'rocket' : 'wallet'} size={16} color="#000" />
                  <Text style={styles.activateButtonText}>
                    {isConnected ? '立即激活 VIP' : '连接钱包激活'}
                  </Text>
                  <FontAwesome6 name="arrow-right" size={14} color="#000" />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </LinearGradient>

        {/* Benefits Section */}
        <View style={styles.benefitsSection}>
          <View style={styles.benefitsHeader}>
            <View style={styles.benefitsTitleBox}>
              <FontAwesome6 name="star" size={14} color={COLORS.primary} />
              <Text style={styles.benefitsTitle}>VIP 核心权益</Text>
            </View>
            <TouchableOpacity onPress={() => {
              router.push('/vip-benefits');
            }}>
              <Text style={styles.viewAllText}>查看全部 →</Text>
            </TouchableOpacity>
          </View>

          {/* Benefits Grid - 2 columns for first 4, full width for last */}
          <View style={styles.benefitsGrid}>
            {VIP_BENEFITS.slice(0, 4).map((benefit) => (
              <TouchableOpacity
                key={benefit.id}
                style={styles.benefitGridCard}
                activeOpacity={0.7}
                onPress={() => handleBenefitPress(benefit)}
              >
                <View style={styles.benefitGridIconBox}>
                  <FontAwesome6 name={benefit.icon} size={16} color={COLORS.primary} />
                </View>
                <Text style={styles.benefitGridTitle}>{benefit.title}</Text>
                <Text style={styles.benefitGridDesc} numberOfLines={1}>{benefit.desc}</Text>
                {benefit.highlight && (
                  <View style={styles.benefitHighlight}>
                    <Text style={styles.benefitHighlightText}>{benefit.highlight}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Full width benefit card */}
          <TouchableOpacity
            style={styles.benefitFullCard}
            activeOpacity={0.7}
            onPress={() => handleBenefitPress(VIP_BENEFITS[4])}
          >
            <View style={styles.benefitFullContent}>
              <View style={styles.benefitGridIconBox}>
                <FontAwesome6 name={VIP_BENEFITS[4].icon} size={16} color={COLORS.primary} />
              </View>
              <View style={styles.benefitFullText}>
                <Text style={styles.benefitGridTitle}>{VIP_BENEFITS[4].title}</Text>
                <Text style={styles.benefitGridDesc}>{VIP_BENEFITS[4].desc}</Text>
              </View>
            </View>
            <View style={styles.benefitFullRight}>
              <View style={styles.feeMiniBox}>
                <Text style={styles.feeMiniText}>$3</Text>
                <Text style={styles.feeMiniLabel}>节点</Text>
              </View>
              <View style={styles.feeMiniBox}>
                <Text style={styles.feeMiniText}>$5</Text>
                <Text style={styles.feeMiniLabel}>销毁</Text>
              </View>
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
            <VIPBenefitsModalContent 
              isVIP={isVIP}
              selectedBenefit={selectedBenefit}
              onClose={() => setBenefitsModalVisible(false)}
              onActivate={handleActivateVIP}
              activating={activating}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

// Modal Content Component
function VIPBenefitsModalContent({ 
  isVIP, 
  selectedBenefit,
  onClose, 
  onActivate, 
  activating 
}: { 
  isVIP: boolean;
  selectedBenefit?: typeof VIP_BENEFITS[0] | null;
  onClose: () => void;
  onActivate: () => void;
  activating: boolean;
}) {
  return (
    <>
      {/* Modal Header */}
      <View style={styles.modalHeader}>
        <View style={styles.modalTitleRow}>
          <LinearGradient
            colors={[COLORS.primary, COLORS.primaryLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.modalIconGradient}
          >
            <FontAwesome6 name="crown" size={14} color="#000" />
          </LinearGradient>
          <Text style={styles.modalTitle}>
            {selectedBenefit ? selectedBenefit.title : 'VIP 权益详情'}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
          <FontAwesome6 name="xmark" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Modal Body */}
      <View style={styles.modalBody}>
        {selectedBenefit ? (
          // Single benefit detail view
          <View style={styles.singleBenefitView}>
            <View style={styles.singleBenefitIconBox}>
              <FontAwesome6 name={selectedBenefit.icon} size={28} color={COLORS.primary} />
            </View>
            <Text style={styles.singleBenefitTitle}>{selectedBenefit.title}</Text>
            <Text style={styles.singleBenefitDesc}>{selectedBenefit.detail}</Text>
            
            {selectedBenefit.highlight && (
              <View style={styles.singleBenefitHighlight}>
                <Text style={styles.singleBenefitHighlightText}>{selectedBenefit.highlight}</Text>
              </View>
            )}
          </View>
        ) : (
          // Full benefits view
          <>
            {/* Fee Distribution */}
            <Text style={styles.modalSectionTitle}>激活费 $100 分配</Text>
            
            <View style={styles.distributionGrid}>
              {FEE_DISTRIBUTION.map((item, index) => (
                <View key={index} style={styles.distributionCard}>
                  <Text style={styles.distributionPercent}>{item.percent}</Text>
                  <Text style={styles.distributionAmount}>{item.amount}</Text>
                  <Text style={styles.distributionLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            {/* All Benefits */}
            <Text style={[styles.modalSectionTitle, { marginTop: 24 }]}>核心权益</Text>

            {VIP_BENEFITS.map((benefit) => (
              <View key={benefit.id} style={styles.benefitDetailItem}>
                <View style={styles.benefitDetailIcon}>
                  <FontAwesome6 name={benefit.icon} size={14} color={COLORS.primary} />
                </View>
                <View style={styles.benefitDetailContent}>
                  <Text style={styles.benefitDetailTitle}>{benefit.title}</Text>
                  <Text style={styles.benefitDetailDesc}>{benefit.detail}</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </View>

      {/* Activate Button (only for non-VIP) */}
      {!isVIP && (
        <View style={styles.modalFooter}>
          <TouchableOpacity
            style={styles.modalActivateBtn}
            onPress={() => {
              onClose();
              onActivate();
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
                <>
                  <FontAwesome6 name="crown" size={14} color="#000" />
                  <Text style={styles.modalActivateText}>立即激活 VIP - $100 USDT</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // Container
  container: {
    marginBottom: 20,
  },
  
  // VIP Status (already VIP)
  vipStatusContainer: {
    marginBottom: 20,
  },
  vipStatusGradient: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
    overflow: 'hidden',
  },
  vipGlow: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primary + '10',
  },
  vipStatusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  vipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  vipBadgeGradient: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vipBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  viewBenefitsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary + '10',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  viewBenefitsText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
  },
  vipWelcomeText: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  vipDescText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  vipStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface + '80',
    borderRadius: 12,
    padding: 12,
  },
  vipStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  vipStatValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
  },
  vipStatLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  vipStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.border,
  },

  // Hero Card (not VIP)
  heroCard: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.primary + '20',
    overflow: 'hidden',
    marginBottom: 16,
  },
  heroGlow: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.primary + '08',
  },
  heroGlow2: {
    position: 'absolute',
    bottom: -40,
    left: -40,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: COLORS.primary + '05',
  },
  
  // Status Badge
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.textSecondary,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },

  // Hero Title
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 20,
  },

  // Fee Display
  feeDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface + '60',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border + '40',
  },
  feeLabelBox: {
    flex: 1,
  },
  feeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  feeHint: {
    fontSize: 11,
    color: COLORS.textSecondary + '80',
  },
  feeAmountBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  feeCurrency: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
  },
  feeAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.primary,
  },
  feeDecimal: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
  },
  feeUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary + 'AA',
    marginLeft: 4,
  },

  // Activate Button
  activateButton: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  activateGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 24,
  },
  activateButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000',
    letterSpacing: 0.5,
  },

  // Benefits Section
  benefitsSection: {
    marginTop: 4,
  },
  benefitsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  benefitsTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  benefitsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  viewAllText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },

  // Benefits Grid (2x2)
  benefitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  benefitGridCard: {
    width: (SCREEN_WIDTH - 48 - 10) / 2,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border + '30',
  },
  benefitGridIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  benefitGridTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  benefitGridDesc: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  benefitHighlight: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  benefitHighlightText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
  },

  // Full width benefit card
  benefitFullCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border + '30',
  },
  benefitFullContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  benefitFullText: {
    flex: 1,
    marginLeft: 12,
  },
  benefitFullRight: {
    flexDirection: 'row',
    gap: 6,
  },
  feeMiniBox: {
    alignItems: 'center',
    backgroundColor: COLORS.primary + '10',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  feeMiniText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  feeMiniLabel: {
    fontSize: 9,
    color: COLORS.textSecondary,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
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
    gap: 10,
  },
  modalIconGradient: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    padding: 20,
  },
  modalSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Single Benefit View
  singleBenefitView: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  singleBenefitIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  singleBenefitTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  singleBenefitDesc: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  singleBenefitHighlight: {
    marginTop: 20,
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  singleBenefitHighlightText: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.primary,
  },

  // Distribution Grid
  distributionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  distributionCard: {
    width: (SCREEN_WIDTH - 40 - 16) / 3,
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 12,
    padding: 12,
  },
  distributionPercent: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary + 'AA',
    marginBottom: 2,
  },
  distributionAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
  },
  distributionLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 4,
  },

  // Benefit Detail Item
  benefitDetailItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingVertical: 4,
  },
  benefitDetailIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.primary + '12',
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

  // Modal Footer
  modalFooter: {
    padding: 20,
    paddingTop: 0,
  },
  modalActivateBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  modalActivateGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  modalActivateText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
});
