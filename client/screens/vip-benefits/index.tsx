import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { FontAwesome6 } from '@expo/vector-icons';
import { COLORS } from '@/utils/theme';
import { Screen } from '@/components/Screen';

// 激活费分配数据
const FEE_DISTRIBUTION = [
  { label: '直推奖励', percent: 50, amount: 50, color: '#10B981', icon: 'user-plus' },
  { label: '返还用户', percent: 20, amount: 20, color: '#F59E0B', icon: 'gift' },
  { label: '见点奖励', percent: 20, amount: 20, color: '#3B82F6', icon: 'layer-group' },
  { label: '自动销毁', percent: 5, amount: 5, color: '#EF4444', icon: 'fire' },
  { label: '节点分红', percent: 3, amount: 3, color: '#8B5CF6', icon: 'network-wired' },
  { label: '运营基金', percent: 1, amount: 1, color: '#6B7280', icon: 'briefcase' },
  { label: '市值管理', percent: 1, amount: 1, color: '#EC4899', icon: 'chart-line' },
];

// 核心权益数据
const BENEFITS = [
  {
    id: 1,
    icon: 'gem',
    title: '返还数字资产',
    value: '$20',
    desc: '激活即购买等值 20 美元 TFT',
    color: '#F59E0B',
  },
  {
    id: 2,
    icon: 'users',
    title: '推荐奖励',
    value: '$70',
    desc: '直推 $50 + 见点 $1 × 20 层',
    color: '#10B981',
  },
  {
    id: 3,
    icon: 'cog',
    title: '赠送节点',
    value: '节点',
    desc: '推荐奖励达 $30,000 赠送',
    color: '#8B5CF6',
  },
  {
    id: 4,
    icon: 'shield-alt',
    title: '预测保险',
    value: '100%',
    desc: '保险仓价值 100% 赔付',
    color: '#3B82F6',
  },
];

// 保险仓规则
const INSURANCE_RULES = [
  { label: '保险仓储备', value: '21,000,000 TFT (10%)' },
  { label: '赔付比例', value: '100% (保险仓价值)' },
  { label: '赔付方式', value: 'TFT 代币 (等值 USDT)' },
  { label: '赔付对象', value: '预测失败的输家' },
  { label: '资金来源', value: '每轮下注额 20% (扣 3% 后)' },
];

// 安全机制
const SAFETY_MECHANISMS = [
  { icon: 'shield-halved', text: '最低储备阈值: 6.3M TFT (3%)' },
  { icon: 'arrow-rotate-left', text: '动态补充机制: 低于阈值自动补充' },
  { icon: 'chart-line', text: '价格下跌保护: 跌超 50% 暂停赔付' },
  { icon: 'lock', text: '极端赔付保护: 单日超 20% 启动紧急机制' },
  { icon: 'user-shield', text: '赔付上限: 单用户单次不超 1%' },
  { icon: 'key', text: '资金安全: 多签钱包 (3/5) 管理' },
];

export default function VIPBenefitsScreen() {
  const router = useSafeRouter();

  return (
    <Screen>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <FontAwesome6 name="arrow-left" size={18} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>VIP 权益详情</Text>
          <View style={styles.backBtn} />
        </View>

        {/* Hero Section */}
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <FontAwesome6 name="crown" size={14} color="#000" />
            <Text style={styles.heroBadgeText}>TRADEFUTURE VIP</Text>
          </View>
          <Text style={styles.heroTitle}>解锁全部 VIP 权益</Text>
          <Text style={styles.heroSubtitle}>一次激活，终身享有平台核心权益</Text>
          
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>$100</Text>
              <Text style={styles.heroStatLabel}>激活费用</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>$70</Text>
              <Text style={styles.heroStatLabel}>推荐奖励</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>$20</Text>
              <Text style={styles.heroStatLabel}>资产返还</Text>
            </View>
          </View>
        </View>

        {/* Core Benefits */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome6 name="star" size={16} color="#F59E0B" />
            <Text style={styles.sectionTitle}>核心权益</Text>
          </View>
          {BENEFITS.map((item, index) => (
            <View key={item.id} style={[styles.benefitRow, { borderLeftColor: item.color }]}>
              <View style={[styles.benefitRowIcon, { backgroundColor: item.color + '25' }]}>
                <FontAwesome6 name={item.icon} size={22} color={item.color} />
              </View>
              <View style={styles.benefitRowContent}>
                <View style={styles.benefitRowHeader}>
                  <Text style={styles.benefitRowTitle}>{item.title}</Text>
                  <Text style={[styles.benefitRowValue, { color: item.color }]}>{item.value}</Text>
                </View>
                <Text style={styles.benefitRowDesc}>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Fee Distribution */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome6 name="chart-pie" size={16} color="#F59E0B" />
            <Text style={styles.sectionTitle}>激活费分配</Text>
            <Text style={styles.sectionSubtitle}>每笔 $100 激活费分配明细</Text>
          </View>
          <View style={styles.distributionCard}>
            {FEE_DISTRIBUTION.map((item, idx) => (
              <View key={idx} style={styles.distRow}>
                <View style={[styles.distIcon, { backgroundColor: item.color + '20' }]}>
                  <FontAwesome6 name={item.icon} size={12} color={item.color} />
                </View>
                <Text style={styles.distLabel}>{item.label}</Text>
                <View style={styles.distBar}>
                  <View style={[styles.distBarFill, { backgroundColor: item.color, width: `${Math.max(item.percent * 2, 6)}%` }]} />
                </View>
                <Text style={[styles.distPercent, { color: item.color }]}>{item.percent}%</Text>
                <Text style={styles.distAmount}>${item.amount}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Insurance Pool */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome6 name="shield-halved" size={16} color="#3B82F6" />
            <Text style={styles.sectionTitle}>预测保险</Text>
          </View>
          
          {/* Insurance Rules */}
          <View style={styles.insuranceCard}>
            <Text style={styles.insuranceTitle}>保险仓规则</Text>
            {INSURANCE_RULES.map((rule, idx) => (
              <View key={idx} style={styles.ruleRow}>
                <Text style={styles.ruleLabel}>{rule.label}</Text>
                <Text style={styles.ruleValue}>{rule.value}</Text>
              </View>
            ))}
          </View>

          {/* Payout Example */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>赔付示例</Text>
            <View style={styles.exampleFlow}>
              <View style={styles.exampleItem}>
                <Text style={styles.exampleLabel}>涨跌各下注</Text>
                <Text style={styles.exampleValue}>100U</Text>
              </View>
              <FontAwesome6 name="arrow-right" size={12} color="#666" />
              <View style={styles.exampleItem}>
                <Text style={styles.exampleLabel}>扣 3% 手续费</Text>
                <Text style={styles.exampleValue}>6U</Text>
              </View>
              <FontAwesome6 name="arrow-right" size={12} color="#666" />
              <View style={styles.exampleItem}>
                <Text style={styles.exampleLabel}>保险仓 20%</Text>
                <Text style={styles.exampleValue}>38.8U</Text>
              </View>
            </View>
            <View style={styles.exampleResult}>
              <Text style={styles.exampleResultLabel}>输家获得赔付</Text>
              <Text style={styles.exampleResultValue}>38.8U 等值 TFT</Text>
            </View>
            <View style={styles.exampleResult}>
              <Text style={styles.exampleResultLabel}>输家实际亏损</Text>
              <Text style={styles.exampleResultLoss}>61.2U</Text>
            </View>
          </View>

          {/* Safety Mechanisms */}
          <View style={styles.safetyCard}>
            <Text style={styles.safetyTitle}>安全机制</Text>
            {SAFETY_MECHANISMS.map((item, idx) => (
              <View key={idx} style={styles.safetyRow}>
                <View style={styles.safetyIcon}>
                  <FontAwesome6 name={item.icon as any} size={12} color="#10B981" />
                </View>
                <Text style={styles.safetyText}>{item.text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Comparison */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome6 name="scale-balanced" size={16} color="#F59E0B" />
            <Text style={styles.sectionTitle}>普通用户 vs VIP</Text>
          </View>
          <View style={styles.comparisonCard}>
            <View style={styles.compHeader}>
              <Text style={[styles.compCell, styles.compHeaderCell, { flex: 2 }]}>权益</Text>
              <Text style={[styles.compCell, styles.compHeaderCell]}>普通</Text>
              <Text style={[styles.compCell, styles.compHeaderCell, { color: '#F59E0B' }]}>VIP</Text>
            </View>
            {[
              { item: '推荐奖励', basic: '无', vip: '$70/人' },
              { item: '资产返还', basic: '无', vip: '$20' },
              { item: '预测保险', basic: '无', vip: '100%' },
              { item: '赠送节点', basic: '无', vip: '有机会' },
              { item: '专属标识', basic: '无', vip: 'VIP' },
            ].map((row, idx) => (
              <View key={idx} style={styles.compRow}>
                <Text style={[styles.compCell, { flex: 2 }]}>{row.item}</Text>
                <Text style={[styles.compCell, { color: '#666' }]}>{row.basic}</Text>
                <Text style={[styles.compCell, { color: '#F59E0B', fontWeight: '700' }]}>{row.vip}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* CTA Button */}
        <TouchableOpacity style={styles.ctaButton} activeOpacity={0.8} onPress={() => router.back()}>
          <FontAwesome6 name="crown" size={18} color="#000" />
          <Text style={styles.ctaText}>立即激活 VIP</Text>
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>激活费用 100 USDT · 一次激活终身有效</Text>
          <Text style={styles.footerSubtext}>请确保钱包中有少量 BNB 作为手续费</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  content: { paddingBottom: 40 },
  
  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  
  // Hero
  hero: { margin: 16, padding: 24, borderRadius: 20, backgroundColor: 'rgba(245, 158, 11, 0.08)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' },
  heroBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#F59E0B', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginBottom: 16 },
  heroBadgeText: { fontSize: 12, fontWeight: '800', color: '#000', marginLeft: 6 },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#FFF', marginBottom: 8 },
  heroSubtitle: { fontSize: 15, color: '#AAA', marginBottom: 20 },
  heroStats: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 16, padding: 16 },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatValue: { fontSize: 24, fontWeight: '800', color: '#F59E0B' },
  heroStatLabel: { fontSize: 12, color: '#888', marginTop: 4 },
  heroDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.1)' },
  
  // Section
  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#FFF', marginLeft: 10 },
  sectionSubtitle: { fontSize: 13, color: '#888', marginLeft: 'auto' },
  
  // Benefits Grid
  benefitsGrid: { gap: 12 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, backgroundColor: 'rgba(30,30,35,0.95)', borderLeftWidth: 4, borderLeftColor: '#F59E0B', marginBottom: 12 },
  benefitRowIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  benefitRowContent: { flex: 1 },
  benefitRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  benefitRowTitle: { fontSize: 17, fontWeight: '700', color: '#FFF' },
  benefitRowValue: { fontSize: 22, fontWeight: '800' },
  benefitRowDesc: { fontSize: 14, color: '#BBB', lineHeight: 20 },
  
  // Distribution
  distributionCard: { padding: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  distRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  distIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  distLabel: { fontSize: 14, color: '#FFF', width: 70 },
  distBar: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, marginHorizontal: 10, overflow: 'hidden' },
  distBarFill: { height: '100%', borderRadius: 3 },
  distPercent: { fontSize: 14, fontWeight: '700', width: 36, textAlign: 'right' },
  distAmount: { fontSize: 14, fontWeight: '600', color: '#FFF', width: 36, textAlign: 'right', marginLeft: 8 },
  
  // Insurance
  insuranceCard: { padding: 16, borderRadius: 16, backgroundColor: 'rgba(59, 130, 246, 0.08)', borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.2)', marginBottom: 12 },
  insuranceTitle: { fontSize: 15, fontWeight: '700', color: '#FFF', marginBottom: 12 },
  ruleRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  ruleLabel: { fontSize: 13, color: '#888' },
  ruleValue: { fontSize: 13, color: '#FFF', fontWeight: '600' },
  
  // Example
  exampleCard: { padding: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 12 },
  exampleTitle: { fontSize: 15, fontWeight: '700', color: '#FFF', marginBottom: 12 },
  exampleFlow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  exampleItem: { alignItems: 'center', paddingHorizontal: 8 },
  exampleLabel: { fontSize: 11, color: '#888', marginBottom: 4 },
  exampleValue: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  exampleResult: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  exampleResultLabel: { fontSize: 13, color: '#888' },
  exampleResultValue: { fontSize: 13, fontWeight: '700', color: '#10B981' },
  exampleResultLoss: { fontSize: 13, fontWeight: '700', color: '#EF4444' },
  
  // Safety
  safetyCard: { padding: 16, borderRadius: 16, backgroundColor: 'rgba(16, 185, 129, 0.08)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.2)' },
  safetyTitle: { fontSize: 15, fontWeight: '700', color: '#FFF', marginBottom: 12 },
  safetyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  safetyIcon: { width: 24, height: 24, borderRadius: 6, backgroundColor: 'rgba(16, 185, 129, 0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  safetyText: { fontSize: 12, color: '#CCC', flex: 1 },
  
  // Comparison
  comparisonCard: { borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  compHeader: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.05)' },
  compHeaderCell: { fontWeight: '700', fontSize: 13 },
  compRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  compCell: { fontSize: 13, color: '#FFF' },
  
  // CTA
  ctaButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: 16, marginTop: 24, paddingVertical: 16, borderRadius: 14, backgroundColor: '#F59E0B' },
  ctaText: { fontSize: 16, fontWeight: '800', color: '#000', marginLeft: 10 },
  
  // Footer
  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: { fontSize: 13, color: '#888' },
  footerSubtext: { fontSize: 12, color: '#666', marginTop: 4 },
});
