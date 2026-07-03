import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useWallet } from '@/contexts/WalletContext';
import { useFocusEffect } from 'expo-router';
import { COLORS } from '@/utils/theme';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

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
        Alert.alert('Success', `Claimed ${result.data.claimed} TFT`);
        fetchProfile();
      }
    } catch (error) {
      console.error('Claim referral error:', error);
    } finally {
      setClaiming(false);
    }
  };

  const handleCopyInvite = () => {
    if (!profile) return;
    Alert.alert('Copied', `Invite link copied: ${profile.inviteCode}`);
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
                  {isConnected ? wallet?.shortAddress : 'Not Connected'}
                </Text>
                {profile?.isVIP ? (
                  <View style={styles.vipBadge}>
                    <FontAwesome6 name="crown" size={10} color={COLORS.primary} />
                    <Text style={styles.vipBadgeText}>VIP · {profile.vipDaysLeft} days left</Text>
                  </View>
                ) : (
                  <View style={styles.normalBadge}>
                    <Text style={styles.normalBadgeText}>Standard Account</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.accountValue}>
              <Text style={styles.accountValueLabel}>Total Assets</Text>
              <Text style={styles.accountValueAmount}>
                ${isConnected && profile ? profile.accountValue.toLocaleString() : '--'}
              </Text>
            </View>
          </LinearGradient>
        </View>

        {/* VIP Management */}
        <View style={styles.vipCard}>
          <Text style={styles.vipTitle}>VIP Membership</Text>
          {profile?.isVIP ? (
            <View>
              <View style={styles.vipBenefits}>
                <View style={styles.vipBenefitItem}>
                  <FontAwesome6 name="circle-check" size={12} color={COLORS.success} />
                  <Text style={styles.vipBenefitText}>Unlimited predictions</Text>
                </View>
                <View style={styles.vipBenefitItem}>
                  <FontAwesome6 name="circle-check" size={12} color={COLORS.success} />
                  <Text style={styles.vipBenefitText}>Priority settlement</Text>
                </View>
                <View style={styles.vipBenefitItem}>
                  <FontAwesome6 name="circle-check" size={12} color={COLORS.success} />
                  <Text style={styles.vipBenefitText}>Exclusive support</Text>
                </View>
                <View style={styles.vipBenefitItem}>
                  <FontAwesome6 name="circle-check" size={12} color={COLORS.success} />
                  <Text style={styles.vipBenefitText}>Referral bonus boost</Text>
                </View>
              </View>
              <Text style={styles.vipExpiry}>
                Expires: {profile.vipExpiry}
              </Text>
              <TouchableOpacity style={styles.renewBtn}>
                <Text style={styles.renewBtnText}>Renew VIP · $100 USDT</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <View style={styles.vipBenefits}>
                <View style={styles.vipBenefitItem}>
                  <FontAwesome6 name="circle-check" size={12} color={COLORS.success} />
                  <Text style={styles.vipBenefitText}>Unlimited predictions</Text>
                </View>
                <View style={styles.vipBenefitItem}>
                  <FontAwesome6 name="circle-check" size={12} color={COLORS.success} />
                  <Text style={styles.vipBenefitText}>Priority settlement</Text>
                </View>
                <View style={styles.vipBenefitItem}>
                  <FontAwesome6 name="circle-check" size={12} color={COLORS.success} />
                  <Text style={styles.vipBenefitText}>Exclusive support</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.activateBtn}>
                <LinearGradient
                  colors={COLORS.GRADIENT_PRIMARY}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.activateGradient}
                >
                  <Text style={styles.activateBtnText}>Become VIP · $100 USDT</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Invite Section */}
        <View style={styles.inviteCard}>
          <Text style={styles.inviteTitle}>Referral Program</Text>
          <View style={styles.inviteInfo}>
            <View style={styles.inviteRow}>
              <Text style={styles.inviteLabel}>Inviter:</Text>
              <Text style={styles.inviteValue}>{profile?.inviter || 'None'}</Text>
            </View>
            <View style={styles.inviteRow}>
              <Text style={styles.inviteLabel}>Your Code:</Text>
              <Text style={styles.inviteCode}>{profile?.inviteCode || '--'}</Text>
            </View>
          </View>
          <View style={styles.inviteActions}>
            <TouchableOpacity style={styles.inviteActionBtn} onPress={handleCopyInvite}>
              <FontAwesome6 name="copy" size={12} color={COLORS.primary} />
              <Text style={styles.inviteActionText}>Copy Link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.inviteActionBtn}>
              <FontAwesome6 name="image" size={12} color={COLORS.primary} />
              <Text style={styles.inviteActionText}>Poster</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inviteStats}>
            <View style={styles.inviteStatItem}>
              <Text style={styles.inviteStatValue}>{profile?.directReferrals || 0}</Text>
              <Text style={styles.inviteStatLabel}>Direct Referrals</Text>
            </View>
            <View style={styles.inviteStatItem}>
              <Text style={styles.inviteStatValue}>${(profile?.teamVolume || 0).toLocaleString()}</Text>
              <Text style={styles.inviteStatLabel}>Team Volume</Text>
            </View>
          </View>
        </View>

        {/* Team Center */}
        <View style={styles.teamSection}>
          <Text style={styles.sectionTitle}>Team Members</Text>
          {profile?.teamMembers.slice(0, 5).map((member) => (
            <View key={member.id} style={styles.teamItem}>
              <View style={styles.teamMemberLeft}>
                <View style={styles.teamAvatar}>
                  <Text style={styles.teamAvatarText}>{member.level}</Text>
                </View>
                <View>
                  <Text style={styles.teamAddress}>{member.address}</Text>
                  <Text style={styles.teamLevel}>Level {member.level}</Text>
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
              <Text style={styles.viewAllText}>View All Members →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Referral Rewards */}
        <View style={styles.rewardCard}>
          <View style={styles.rewardInfo}>
            <View>
              <Text style={styles.rewardLabel}>Total Referral Rewards</Text>
              <Text style={styles.rewardValue}>{profile?.totalReferralReward?.toFixed(2) || '0'} TFT</Text>
            </View>
            <View style={styles.rewardPending}>
              <Text style={styles.rewardPendingLabel}>Pending</Text>
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
                {!isConnected ? 'Connect Wallet' : 'Claim Rewards'}
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
            <Text style={styles.functionText}>My Nodes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.functionBtn}>
            <View style={styles.functionIconContainer}>
              <FontAwesome6 name="book" size={18} color={COLORS.primary} />
            </View>
            <Text style={styles.functionText}>Tutorial</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.functionBtn}>
            <View style={styles.functionIconContainer}>
              <FontAwesome6 name="gear" size={18} color={COLORS.primary} />
            </View>
            <Text style={styles.functionText}>Settings</Text>
          </TouchableOpacity>
        </View>

        {/* Disconnect Button */}
        {isConnected && (
          <TouchableOpacity style={styles.disconnectBtn} onPress={disconnect}>
            <Text style={styles.disconnectText}>Disconnect Wallet</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 56, paddingBottom: 100, paddingHorizontal: 16 },
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
});
