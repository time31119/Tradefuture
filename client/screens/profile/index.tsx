import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  Share,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useWallet } from '@/contexts/WalletContext';
import { useFocusEffect } from 'expo-router';
import { COLORS } from '@/utils/theme';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';

interface ProfileData {
  address: string;
  fullAddress: string;
  isVIP: boolean;
  vipExpiry: string;
  vipDaysLeft: number;
  accountValue: number;
  inviter: string;
  inviteCode: string;
  totalReferralReward: number;
  pendingReferralReward: number;
  directReferrals: number;
  teamVolume: number;
  teamMembers: Array<{
    id: number;
    address: string;
    level: number;
    volume: number;
    contribution: number;
  }>;
}

export default function ProfileScreen() {
  const { isConnected, wallet, connect, disconnect } = useWallet();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [showPoster, setShowPoster] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：GET /api/v1/profile
       */
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/profile`);
      const result = await res.json();
      if (result.success) {
        setProfile(result.data);
      }
    } catch (error) {
      console.error('Fetch profile error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [fetchProfile])
  );

  const handleClaimReferral = async () => {
    if (!isConnected) return;
    setClaiming(true);
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/profile/claim-referral
       */
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/profile/claim-referral`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await res.json();
      if (result.success) {
        Alert.alert('成功', `已领取 ${result.data.claimed} TFT`);
        fetchProfile();
      }
    } catch (error) {
      console.error('Claim referral error:', error);
    } finally {
      setClaiming(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!profile) return;
    const inviteLink = `https://tradefuture.app?ref=${profile.inviteCode}`;
    try {
      if (Platform.OS === 'web') {
        // Web: use clipboard API
        await navigator.clipboard.writeText(inviteLink);
        Alert.alert('复制成功', `邀请链接已复制到剪贴板\n${inviteLink}`);
      } else {
        // Mobile: use Share API
        await Share.share({
          message: `加入 TradeFuture，一起预测BTC价格赢取奖励！\n\n使用我的邀请码: ${profile.inviteCode}\n${inviteLink}`,
          title: 'TradeFuture 邀请',
        });
      }
    } catch (error) {
      // Fallback: show the link for manual copy
      Alert.alert('邀请链接', inviteLink);
    }
  };

  const handleInvitePoster = () => {
    setShowPoster(true);
  };

  const handleSharePoster = async () => {
    if (!profile) return;
    const inviteLink = `https://tradefuture.app?ref=${profile.inviteCode}`;
    try {
      await Share.share({
        message: `加入 TradeFuture，一起预测BTC价格赢取奖励！\n\n使用我的邀请码: ${profile.inviteCode}\n${inviteLink}`,
        title: 'TradeFuture 邀请',
      });
    } catch (error) {
      console.error('Share error:', error);
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
        {/* User Info Card */}
        <View style={styles.userCard}>
          <LinearGradient
            colors={['rgba(245,166,35,0.08)', 'transparent']}
            style={styles.userCardGradient}
          >
            <View style={styles.userHeader}>
              <View style={styles.avatarContainer}>
                <FontAwesome6 name="circle-user" size={40} color={COLORS.primary} />
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userAddress}>
                  {isConnected ? wallet?.shortAddress : '未连接'}
                </Text>
                {profile?.isVIP ? (
                  <View style={styles.vipBadge}>
                    <FontAwesome6 name="crown" size={10} color={COLORS.primary} />
                    <Text style={styles.vipBadgeText}>VIP · 剩余 {profile.vipDaysLeft} 天</Text>
                  </View>
                ) : (
                  <View style={styles.normalBadge}>
                    <Text style={styles.normalBadgeText}>普通账户</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.accountValue}>
              <Text style={styles.accountValueLabel}>资产总值</Text>
              <Text style={styles.accountValueAmount}>
                ${isConnected && profile ? profile.accountValue.toLocaleString() : '--'}
              </Text>
            </View>
          </LinearGradient>
        </View>

        {/* VIP Management */}
        <View style={styles.vipCard}>
          <Text style={styles.vipTitle}>VIP会员</Text>
          {profile?.isVIP ? (
            <View>
              <View style={styles.vipBenefits}>
                <View style={styles.vipBenefitItem}>
                  <FontAwesome6 name="circle-check" size={12} color={COLORS.success} />
                  <Text style={styles.vipBenefitText}>无限次预测</Text>
                </View>
                <View style={styles.vipBenefitItem}>
                  <FontAwesome6 name="circle-check" size={12} color={COLORS.success} />
                  <Text style={styles.vipBenefitText}>优先结算</Text>
                </View>
                <View style={styles.vipBenefitItem}>
                  <FontAwesome6 name="circle-check" size={12} color={COLORS.success} />
                  <Text style={styles.vipBenefitText}>专属客服通道</Text>
                </View>
                <View style={styles.vipBenefitItem}>
                  <FontAwesome6 name="circle-check" size={12} color={COLORS.success} />
                  <Text style={styles.vipBenefitText}>邀请奖励加成</Text>
                </View>
              </View>
              <Text style={styles.vipExpiry}>
                到期时间: {profile.vipExpiry}
              </Text>
              <TouchableOpacity style={styles.renewBtn}>
                <Text style={styles.renewBtnText}>续费VIP · $100 USDT</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <View style={styles.vipBenefits}>
                <View style={styles.vipBenefitItem}>
                  <FontAwesome6 name="circle-check" size={12} color={COLORS.success} />
                  <Text style={styles.vipBenefitText}>无限次预测</Text>
                </View>
                <View style={styles.vipBenefitItem}>
                  <FontAwesome6 name="circle-check" size={12} color={COLORS.success} />
                  <Text style={styles.vipBenefitText}>优先结算</Text>
                </View>
                <View style={styles.vipBenefitItem}>
                  <FontAwesome6 name="circle-check" size={12} color={COLORS.success} />
                  <Text style={styles.vipBenefitText}>专属客服通道</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.activateBtn}>
                <LinearGradient
                  colors={COLORS.GRADIENT_PRIMARY}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.activateGradient}
                >
                  <Text style={styles.activateBtnText}>成为VIP · $100 USDT</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Invite Section */}
        <View style={styles.inviteCard}>
          <Text style={styles.inviteTitle}>邀请推荐</Text>
          <View style={styles.inviteInfo}>
            <View style={styles.inviteRow}>
              <Text style={styles.inviteLabel}>邀请人:</Text>
              <Text style={styles.inviteValue}>{profile?.inviter || '无'}</Text>
            </View>
            <View style={styles.inviteRow}>
              <Text style={styles.inviteLabel}>我的邀请码:</Text>
              <Text style={styles.inviteCode}>{profile?.inviteCode || '--'}</Text>
            </View>
          </View>
          <View style={styles.inviteActions}>
            <TouchableOpacity style={styles.inviteActionBtn} onPress={handleCopyInvite}>
              <FontAwesome6 name="copy" size={12} color={COLORS.primary} />
              <Text style={styles.inviteActionText}>复制链接</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.inviteActionBtn} onPress={handleInvitePoster}>
              <FontAwesome6 name="image" size={12} color={COLORS.primary} />
              <Text style={styles.inviteActionText}>邀请海报</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inviteStats}>
            <View style={styles.inviteStatItem}>
              <Text style={styles.inviteStatValue}>{profile?.directReferrals || 0}</Text>
              <Text style={styles.inviteStatLabel}>直推人数</Text>
            </View>
            <View style={styles.inviteStatItem}>
              <Text style={styles.inviteStatValue}>${(profile?.teamVolume || 0).toLocaleString()}</Text>
              <Text style={styles.inviteStatLabel}>团队预测额</Text>
            </View>
          </View>
        </View>

        {/* Team Center */}
        <View style={styles.teamSection}>
          <Text style={styles.sectionTitle}>团队成员</Text>
          {profile?.teamMembers.slice(0, 5).map((member) => (
            <View key={member.id} style={styles.teamItem}>
              <View style={styles.teamMemberLeft}>
                <View style={styles.teamAvatar}>
                  <Text style={styles.teamAvatarText}>{member.level}</Text>
                </View>
                <View>
                  <Text style={styles.teamAddress}>{member.address}</Text>
                  <Text style={styles.teamLevel}>等级 {member.level}</Text>
                </View>
              </View>
              <View style={styles.teamMemberRight}>
                <Text style={styles.teamVolume}>${member.volume.toLocaleString()}</Text>
                <Text style={styles.teamContribution}>+${member.contribution.toFixed(2)}</Text>
              </View>
            </View>
          ))}
          {profile && profile.teamMembers.length > 5 && (
            <TouchableOpacity style={styles.viewAllBtn}>
              <Text style={styles.viewAllText}>查看全部成员 →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Referral Rewards */}
        <View style={styles.rewardCard}>
          <View style={styles.rewardInfo}>
            <View>
              <Text style={styles.rewardLabel}>累计推荐奖励</Text>
              <Text style={styles.rewardValue}>{profile?.totalReferralReward?.toFixed(2) || '0'} TFT</Text>
            </View>
            <View style={styles.rewardPending}>
              <Text style={styles.rewardPendingLabel}>待领取</Text>
              <Text style={styles.rewardPendingValue}>{profile?.pendingReferralReward?.toFixed(2) || '0'} TFT</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.claimRewardBtn, (!isConnected || claiming) && styles.claimRewardBtnDisabled]}
            onPress={handleClaimReferral}
            disabled={!isConnected || claiming}
          >
            {claiming ? (
              <ActivityIndicator color={COLORS.primary} size="small" />
            ) : (
              <Text style={styles.claimRewardText}>
                {!isConnected ? '连接钱包' : '领取奖励'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Function Entries */}
        <View style={styles.functionGrid}>
          <TouchableOpacity style={styles.functionBtn}>
            <View style={styles.functionIconContainer}>
              <FontAwesome6 name="cubes" size={18} color={COLORS.primary} />
            </View>
            <Text style={styles.functionText}>我的节点</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.functionBtn}>
            <View style={styles.functionIconContainer}>
              <FontAwesome6 name="book" size={18} color={COLORS.primary} />
            </View>
            <Text style={styles.functionText}>使用教程</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.functionBtn}>
            <View style={styles.functionIconContainer}>
              <FontAwesome6 name="gear" size={18} color={COLORS.primary} />
            </View>
            <Text style={styles.functionText}>设置</Text>
          </TouchableOpacity>
        </View>

        {/* Disconnect Button */}
        {isConnected && (
          <TouchableOpacity style={styles.disconnectBtn} onPress={disconnect}>
            <Text style={styles.disconnectText}>断开钱包</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Invite Poster Modal */}
      <Modal visible={showPoster} transparent animationType="slide" onRequestClose={() => setShowPoster(false)}>
        <View style={styles.posterOverlay}>
          <View style={styles.posterModal}>
            <View style={styles.posterHeader}>
              <Text style={styles.posterTitle}>邀请海报</Text>
              <TouchableOpacity onPress={() => setShowPoster(false)}>
                <FontAwesome6 name="times" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.posterContent}>
              <LinearGradient
                colors={['#1a1f2e', '#0f1419']}
                style={styles.posterCard}
              >
                <View style={styles.posterLogo}>
                  <FontAwesome6 name="chart-line" size={32} color={COLORS.primary} />
                </View>
                <Text style={styles.posterAppName}>TradeFuture</Text>
                <Text style={styles.posterSlogan}>去中心化 BTC 预测市场</Text>
                <View style={styles.posterDivider} />
                <Text style={styles.posterInviteText}>邀请码</Text>
                <Text style={styles.posterInviteCode}>{profile?.inviteCode || '--'}</Text>
                <View style={styles.posterQrPlaceholder}>
                  <FontAwesome6 name="qrcode" size={80} color={COLORS.textSecondary} />
                  <Text style={styles.posterQrText}>扫码加入</Text>
                </View>
                <Text style={styles.posterFooter}>预测 BTC 价格 · 赢取丰厚奖励</Text>
              </LinearGradient>
            </View>
            <View style={styles.posterActions}>
              <TouchableOpacity style={styles.posterShareBtn} onPress={handleSharePoster}>
                <FontAwesome6 name="share-alt" size={16} color={COLORS.background} />
                <Text style={styles.posterShareText}>分享邀请</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 56, paddingBottom: 120, paddingHorizontal: 16 },
  // User Card
  userCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  userCardGradient: { padding: 20 },
  userHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(245,166,35,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: { flex: 1 },
  userAddress: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, fontFamily: 'monospace' },
  vipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245,166,35,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  vipBadgeText: { fontSize: 11, fontWeight: '600', color: COLORS.primary },
  normalBadge: {
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  normalBadgeText: { fontSize: 11, color: COLORS.textSecondary },
  accountValue: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 14 },
  accountValueLabel: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 },
  accountValueAmount: { fontSize: 28, fontWeight: '700', color: COLORS.textPrimary, fontFamily: 'monospace' },
  // VIP Card
  vipCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  vipTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 12 },
  vipBenefits: { gap: 8, marginBottom: 12 },
  vipBenefitItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vipBenefitText: { fontSize: 13, color: COLORS.textSecondary },
  vipExpiry: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 12 },
  renewBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  renewBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  activateBtn: { borderRadius: 10, overflow: 'hidden' },
  activateGradient: { paddingVertical: 14, alignItems: 'center', borderRadius: 10 },
  activateBtnText: { fontSize: 14, fontWeight: '800', color: COLORS.background, letterSpacing: 0.5 },
  // Invite Card
  inviteCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  inviteTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 12 },
  inviteInfo: { gap: 8, marginBottom: 12 },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inviteLabel: { fontSize: 13, color: COLORS.textSecondary },
  inviteValue: { fontSize: 13, color: COLORS.textPrimary, fontFamily: 'monospace' },
  inviteCode: { fontSize: 14, fontWeight: '700', color: COLORS.primary, fontFamily: 'monospace' },
  inviteActions: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  inviteActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245,166,35,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  inviteActionText: { fontSize: 12, fontWeight: '600', color: COLORS.primary },
  inviteStats: { flexDirection: 'row', gap: 16 },
  inviteStatItem: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  inviteStatValue: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, fontFamily: 'monospace' },
  inviteStatLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4 },
  // Team Section
  teamSection: { marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 12 },
  teamItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  teamMemberLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  teamAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(245,166,35,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  teamAvatarText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  teamAddress: { fontSize: 13, color: COLORS.textPrimary, fontFamily: 'monospace' },
  teamLevel: { fontSize: 11, color: COLORS.textSecondary },
  teamMemberRight: { alignItems: 'flex-end' },
  teamVolume: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary, fontFamily: 'monospace' },
  teamContribution: { fontSize: 11, color: COLORS.success },
  viewAllBtn: { alignItems: 'center', paddingVertical: 8 },
  viewAllText: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  // Reward Card
  rewardCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  rewardInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  rewardLabel: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 },
  rewardValue: { fontSize: 20, fontWeight: '700', color: COLORS.primary, fontFamily: 'monospace' },
  rewardPending: { alignItems: 'flex-end' },
  rewardPendingLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 4 },
  rewardPendingValue: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, fontFamily: 'monospace' },
  claimRewardBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  claimRewardBtnDisabled: { opacity: 0.5 },
  claimRewardText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  // Function Grid
  functionGrid: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  functionBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  functionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(245,166,35,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  functionText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  // Disconnect
  disconnectBtn: {
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  disconnectText: { fontSize: 13, fontWeight: '600', color: COLORS.danger },
  // Poster Modal
  posterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  posterModal: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    overflow: 'hidden',
  },
  posterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  posterTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  posterContent: { padding: 20 },
  posterCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  posterLogo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(245,166,35,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  posterAppName: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 4 },
  posterSlogan: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 16 },
  posterDivider: { width: 40, height: 2, backgroundColor: COLORS.primary, marginBottom: 16 },
  posterInviteText: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 },
  posterInviteCode: { fontSize: 24, fontWeight: '800', color: COLORS.primary, fontFamily: 'monospace', marginBottom: 16 },
  posterQrPlaceholder: {
    width: 140,
    height: 140,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  posterQrText: { fontSize: 11, color: COLORS.textSecondary, marginTop: 8 },
  posterFooter: { fontSize: 11, color: COLORS.textSecondary },
  posterActions: { padding: 16, paddingTop: 0 },
  posterShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  posterShareText: { fontSize: 15, fontWeight: '700', color: COLORS.background },
});
