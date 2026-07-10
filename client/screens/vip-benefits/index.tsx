import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Dimensions, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { FontAwesome6 } from '@expo/vector-icons';
import { COLORS } from '@/utils/theme';
import { Screen } from '@/components/Screen';

const { width } = Dimensions.get('window');

// 权益详细数据
const VIP_BENEFITS_DETAIL = [
  {
    id: 1,
    icon: 'gem',
    title: '返还数字资产',
    subtitle: '激活即享 20% 等值 TFT',
    highlight: '$20',
    color: '#F59E0B',
    description: '激活 VIP 后，系统将立即为您购买等值 20 美元的 TFT 数字资产，直接发放到您的钱包。',
    details: [
      { label: '返还金额', value: '$20 等值 TFT' },
      { label: '发放方式', value: '即时到账' },
      { label: 'TFT 价格', value: '按激活时市场价' },
      { label: '发放比例', value: '激活费的 20%' },
    ],
    note: '返还的 TFT 资产可自由交易、持有或参与节点创建。',
  },
  {
    id: 2,
    icon: 'users',
    title: '推荐奖励',
    subtitle: '直推 $50 + 见点 $1 × 20 层',
    highlight: '$70',
    color: '#10B981',
    description: 'VIP 用户享有完整的推荐奖励体系，包括直接推荐奖励和见点奖励两部分。',
    details: [
      { label: '直推奖励', value: '$50 / 人' },
      { label: '见点奖励', value: '$1 × 20 层' },
      { label: '推荐层级', value: '20 层' },
      { label: '总拨出比例', value: '激活费的 70%' },
    ],
    note: '直推奖励由直接上级独享，见点奖励沿推荐链逐层分配。无推荐人时，奖励转入节点分红池。',
  },
  {
    id: 3,
    icon: 'cog',
    title: '赠送节点',
    subtitle: '推荐达 $30,000 送节点',
    highlight: '节点',
    color: '#8B5CF6',
    description: '活动期间，VIP 用户推荐奖励累计达到 $30,000，即可免费获得一个节点合伙人资格。',
    details: [
      { label: '赠送条件', value: '推荐奖励累计 $30,000' },
      { label: '节点价值', value: '100,000 TFT' },
      { label: '节点权益', value: '交易税 3% 分红' },
      { label: '活动期限', value: '限时活动' },
    ],
    note: '节点合伙人可享受全平台交易税 3% 的平均分红，是长期被动收入的重要来源。',
  },
  {
    id: 4,
    icon: 'shield-alt',
    title: '预测保险',
    subtitle: '保险仓 100% 赔付保障',
    highlight: '100%',
    color: '#3B82F6',
    description: 'VIP 用户参与预测市场时，预测失败可获得保险仓价值 100% 的 TFT 赔付，输家也能成为 TFT 持有者。',
    details: [
      { label: '赔付比例', value: '保险仓价值的 100%' },
      { label: '赔付方式', value: 'TFT 代币（等值 USDT）' },
      { label: '保险仓储备', value: '21,000,000 TFT（10%）' },
      { label: '资金来源', value: '每轮下注额 20%（扣 3% 手续费后）' },
    ],
    note: '每轮预测下注额扣除 3% 手续费后，20% 进入保险仓购买 TFT，预测失败时输家获得保险仓 100% 价值的 TFT 赔付。',
  },
  {
    id: 5,
    icon: 'sync-alt',
    title: '生态贡献',
    subtitle: '激活费分配透明可查',
    highlight: '$10',
    color: '#EC4899',
    description: 'VIP 激活费的 10% 用于生态建设，包括节点分红、运营、市值管理和自动销毁。',
    details: [
      { label: '节点分红', value: '$3（3%）' },
      { label: '运营基金', value: '$1（1%）' },
      { label: '市值管理', value: '$1（1%）' },
      { label: '自动销毁', value: '$5（5%）' },
    ],
    note: '所有分配比例链上透明可查，确保生态健康可持续发展。',
  },
];

// 激活费分配数据
const ACTIVATION_FEE = 100;
const FEE_DISTRIBUTION = [
  { label: '返还用户', percent: 20, amount: 20, color: '#F59E0B', icon: 'gift' },
  { label: '直推奖励', percent: 50, amount: 50, color: '#10B981', icon: 'user-plus' },
  { label: '见点奖励', percent: 20, amount: 20, color: '#3B82F6', icon: 'layer-group' },
  { label: '自动销毁', percent: 5, amount: 5, color: '#EF4444', icon: 'fire' },
  { label: '节点分红', percent: 3, amount: 3, color: '#8B5CF6', icon: 'network-wired' },
  { label: '运营基金', percent: 1, amount: 1, color: '#6B7280', icon: 'briefcase' },
  { label: '市值管理', percent: 1, amount: 1, color: '#EC4899', icon: 'chart-line' },
];

export default function VIPBenefitsScreen() {
  const router = useSafeRouter();

  return (
    <Screen>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <FontAwesome6 name="arrow-left" size={18} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: COLORS.textPrimary }]}>VIP 权益详情</Text>
          <View style={styles.backButton} />
        </View>

        {/* Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <View style={styles.heroContent}>
            <View style={styles.heroBadge}>
              <FontAwesome6 name="crown" size={12} color="#000" />
              <Text style={styles.heroBadgeText}>TRADEFUTURE VIP</Text>
            </View>
            <Text style={styles.heroTitle}>解锁全部 VIP 权益</Text>
            <Text style={styles.heroSubtitle}>
              一次激活，终身享有平台核心权益与推荐奖励
            </Text>
            <View style={styles.heroStats}>
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatValue}>$100</Text>
                <Text style={styles.heroStatLabel}>激活费用</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatValue}>$70</Text>
                <Text style={styles.heroStatLabel}>推荐奖励</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatValue}>$20</Text>
                <Text style={styles.heroStatLabel}>资产返还</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Activation Fee Distribution */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome6 name="chart-pie" size={14} color={COLORS.primary} />
            <Text style={[styles.sectionTitle, { color: COLORS.textPrimary }]}>激活费分配</Text>
          </View>
          <View style={[styles.distributionCard, { backgroundColor: COLORS.surface }]}>
            {FEE_DISTRIBUTION.map((item, index) => (
              <View key={index} style={styles.distributionRow}>
                <View style={[styles.distributionIcon, { backgroundColor: item.color + '20' }]}>
                  <FontAwesome6 name={item.icon} size={12} color={item.color} />
                </View>
                <Text style={[styles.distributionLabel, { color: COLORS.textPrimary }]}>{item.label}</Text>
                <View style={styles.distributionBar}>
                  <View
                    style={[
                      styles.distributionBarFill,
                      {
                        backgroundColor: item.color,
                        width: `${Math.max(item.percent * 2, 4)}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.distributionPercent, { color: item.color }]}>
                  {item.percent}%
                </Text>
                <Text style={[styles.distributionAmount, { color: COLORS.textSecondary }]}>
                  ${item.amount}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Benefits Detail List */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome6 name="star" size={14} color={COLORS.primary} />
            <Text style={[styles.sectionTitle, { color: COLORS.textPrimary }]}>核心权益详情</Text>
          </View>

          {VIP_BENEFITS_DETAIL.map((benefit) => (
            <View key={benefit.id} style={[styles.benefitDetailCard, { backgroundColor: COLORS.surface }]}>
              {/* Card Header */}
              <View style={styles.benefitDetailHeader}>
                <View style={[styles.benefitDetailIconBox, { backgroundColor: benefit.color + '20' }]}>
                  <FontAwesome6 name={benefit.icon} size={20} color={benefit.color} />
                </View>
                <View style={styles.benefitDetailTitleBox}>
                  <Text style={[styles.benefitDetailTitle, { color: COLORS.textPrimary }]}>{benefit.title}</Text>
                  <Text style={[styles.benefitDetailSubtitle, { color: COLORS.textSecondary }]}>
                    {benefit.subtitle}
                  </Text>
                </View>
                <View style={[styles.benefitDetailBadge, { backgroundColor: benefit.color }]}>
                  <Text style={styles.benefitDetailBadgeText}>{benefit.highlight}</Text>
                </View>
              </View>

              {/* Description */}
              <Text style={[styles.benefitDetailDesc, { color: COLORS.textSecondary }]}>
                {benefit.description}
              </Text>

              {/* Details Grid */}
              <View style={styles.benefitDetailsGrid}>
                {benefit.details.map((detail, idx) => (
                  <View key={idx} style={styles.benefitDetailItem}>
                    <Text style={[styles.benefitDetailItemLabel, { color: COLORS.textSecondary }]}>
                      {detail.label}
                    </Text>
                    <Text style={[styles.benefitDetailItemValue, { color: COLORS.textPrimary }]}>
                      {detail.value}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Note */}
              <View style={[styles.benefitNoteBox, { backgroundColor: COLORS.background }]}>
                <FontAwesome6 name="info-circle" size={10} color={COLORS.textSecondary} />
                <Text style={[styles.benefitNoteText, { color: COLORS.textSecondary }]}>
                  {benefit.note}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* VIP Comparison */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome6 name="balance-scale" size={14} color={COLORS.primary} />
            <Text style={[styles.sectionTitle, { color: COLORS.textPrimary }]}>普通用户 vs VIP</Text>
          </View>
          <View style={[styles.comparisonCard, { backgroundColor: COLORS.surface }]}>
            <View style={styles.comparisonHeader}>
              <Text style={[styles.comparisonHeaderCell, { color: COLORS.textSecondary, flex: 2 }]}>权益项目</Text>
              <Text style={[styles.comparisonHeaderCell, { color: COLORS.textSecondary }]}>普通用户</Text>
              <Text style={[styles.comparisonHeaderCell, { color: COLORS.primary }]}>VIP</Text>
            </View>
            {[
              { item: '推荐奖励', basic: '无', vip: '$70/人' },
              { item: '资产返还', basic: '无', vip: '$20' },
              { item: '预测保险', basic: '无', vip: '100% 赔付' },
              { item: '赠送节点', basic: '无', vip: '有机会' },
              { item: '专属标识', basic: '无', vip: 'VIP 徽章' },
            ].map((row, idx) => (
              <View key={idx} style={[styles.comparisonRow, { borderBottomColor: COLORS.border }]}>
                <Text style={[styles.comparisonCell, { color: COLORS.textPrimary, flex: 2 }]}>{row.item}</Text>
                <Text style={[styles.comparisonCell, { color: COLORS.textSecondary }]}>{row.basic}</Text>
                <Text style={[styles.comparisonCell, { color: COLORS.primary, fontWeight: '600' }]}>{row.vip}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* CTA Button */}
        <TouchableOpacity
          style={styles.ctaButton}
          activeOpacity={0.8}
          onPress={() => router.back()}
        >
          <FontAwesome6 name="crown" size={16} color="#000" />
          <Text style={styles.ctaButtonText}>立即激活 VIP</Text>
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: COLORS.textSecondary }]}>
            激活费用 100 USDT · 一次激活终身有效
          </Text>
          <Text style={[styles.footerSubText, { color: COLORS.textSecondary }]}>
            请确保钱包中有少量 BNB 作为手续费
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Hero Card
  heroCard: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  heroGlow: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  heroContent: {
    padding: 20,
    backgroundColor: 'rgba(20, 18, 12, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 20,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#F59E0B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginBottom: 14,
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#000',
    marginLeft: 5,
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 20,
    lineHeight: 20,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  heroStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F59E0B',
  },
  heroStatLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
    fontWeight: '500',
  },
  heroStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(245, 158, 11, 0.3)',
  },
  // Section
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  // Distribution Card
  distributionCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  distributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  distributionIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  distributionLabel: {
    fontSize: 13,
    fontWeight: '500',
    width: 60,
    marginLeft: 8,
  },
  distributionBar: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 3,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  distributionBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  distributionPercent: {
    fontSize: 12,
    fontWeight: '600',
    width: 32,
    textAlign: 'right',
  },
  distributionAmount: {
    fontSize: 12,
    width: 30,
    textAlign: 'right',
  },
  // Benefit Detail Card
  benefitDetailCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  benefitDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  benefitDetailIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitDetailTitleBox: {
    flex: 1,
    marginLeft: 12,
  },
  benefitDetailTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  benefitDetailSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  benefitDetailBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  benefitDetailBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  benefitDetailDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  benefitDetailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  benefitDetailItem: {
    width: '50%',
    marginBottom: 8,
  },
  benefitDetailItemLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  benefitDetailItemValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  benefitNoteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: 10,
  },
  benefitNoteText: {
    fontSize: 11,
    lineHeight: 16,
    marginLeft: 6,
    flex: 1,
  },
  // Comparison Card
  comparisonCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  comparisonHeader: {
    flexDirection: 'row',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    marginBottom: 4,
  },
  comparisonHeaderCell: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  comparisonRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  comparisonCell: {
    fontSize: 13,
    textAlign: 'center',
  },
  // CTA Button
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#F59E0B',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginLeft: 8,
  },
  // Footer
  footer: {
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 16,
  },
  footerText: {
    fontSize: 12,
    marginBottom: 4,
  },
  footerSubText: {
    fontSize: 11,
  },
});
