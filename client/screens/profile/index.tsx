import React, { useState, useCallback, useRef } from 'react';
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
  Linking,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useWallet } from '@/contexts/WalletContext';
import { useFocusEffect } from 'expo-router';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { COLORS } from '@/utils/theme';
import QRCode from 'react-native-qrcode-svg';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';

interface ProfileData {
  address: string;
  fullAddress: string;
  isVIP: boolean;
  vipExpiry: string;
  vipDaysLeft: number;
  accountValue: number;
  tftBalance: number;
  usdtBalance: number;
  profit24h: number;
  avatarUrl?: string;
  inviter: string;
  inviteCode: string;
  totalReferralReward: number;
  pendingReferralReward: number;
  directReward: number;
  levelReward: number;
  claimedReward: number;
  rewardHistory: Array<{
    id: number;
    type: 'direct' | 'level';
    amount: number;
    from: string;
    date: string;
    level?: number;
  }>;
  directReferrals: number;
  teamVolume: number;
  teamMembers: Array<{
    id: number;
    address: string;
    level: number;
    volume: number;
    contribution: number;
    isDirect: boolean;
    joinDate: string;
  }>;
}

export default function ProfileScreen() {
  const { isConnected, wallet, connect, disconnect } = useWallet();
  const router = useSafeRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [showPoster, setShowPoster] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamFilter, setTeamFilter] = useState<'all' | 'direct' | 'indirect'>('all');
  const [teamSort, setTeamSort] = useState<'volume' | 'contribution' | 'level' | 'date'>('volume');
  const [isSavingPoster, setIsSavingPoster] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [showFullAddress, setShowFullAddress] = useState(false);
  const [showRewardHistory, setShowRewardHistory] = useState(false);
  const [lastClaimTx, setLastClaimTx] = useState<string | null>(null);
  const posterRef = useRef<View>(null);

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
    if (!isConnected) {
      connect();
      return;
    }
    if (!profile?.pendingReferralReward || profile.pendingReferralReward <= 0) {
      Alert.alert('提示', '暂无可领取的奖励');
      return;
    }
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
        setLastClaimTx(result.data.txHash);
        Alert.alert(
          '领取成功',
          `已领取 ${result.data.claimed} TFT\n\n交易哈希：\n${result.data.txHash.slice(0, 10)}...${result.data.txHash.slice(-8)}`
        );
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

  const handlePickAvatar = async () => {
    try {
      // Request permission first
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('权限不足', '需要相册权限才能选择头像');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setAvatarUri(result.assets[0].uri);
        // NOTE: Avatar upload to server will be integrated later
      }
    } catch (error) {
      console.error('Pick avatar error:', error);
    }
  };

  const handleCopyAddress = async () => {
    if (!wallet?.address) return;
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(wallet.address);
        Alert.alert('已复制', '钱包地址已复制到剪贴板');
      } else {
        await Share.share({
          message: wallet.address,
          title: '钱包地址',
        });
      }
    } catch (error) {
      console.error('Copy address error:', error);
    }
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

  const handleSavePoster = async () => {
    if (!posterRef.current) return;
    setIsSavingPoster(true);
    try {
      const uri = await captureRef(posterRef, {
        format: 'png',
        quality: 1,
      });
      if (Platform.OS === 'web') {
        // Web: 下载图片
        const link = document.createElement('a');
        link.href = uri;
        link.download = `tradefuture-invite-${profile?.inviteCode || 'poster'}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        Alert.alert('成功', '海报已下载');
      } else {
        // Mobile: 保存到相册
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('权限不足', '请允许访问相册以保存海报');
          return;
        }
        // Copy to a persistent location
        const docDir = (FileSystem as any).documentDirectory || '/tmp/';
        const destPath = docDir + `tradefuture-invite-${Date.now()}.png`;
        await (FileSystem as any).copyAsync({ from: uri, to: destPath });
        await MediaLibrary.createAssetAsync(destPath);
        Alert.alert('成功', '海报已保存到相册');
      }
    } catch (error) {
      console.error('Save poster error:', error);
      Alert.alert('错误', '保存海报失败');
    } finally {
      setIsSavingPoster(false);
    }
  };

  const handleNavigateToNode = () => {
    router.push('/node');
  };

  const handleNavigateToMarketMaker = () => {
    router.push('/marketmaker');
  };

  const handleNavigateToTokenomics = () => {
    router.push('/tokenomics');
  };

  const handleShowTutorial = () => {
    setShowTutorial(true);
  };

  const handleShowSettings = () => {
    setShowSettings(true);
  };

  const handleShowTeamModal = () => {
    setShowTeamModal(true);
  };

  const handleActivateVIP = async () => {
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/profile/activate-vip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (data.success) {
        Alert.alert('成功', 'VIP已激活！');
        fetchProfile();
      }
    } catch (error) {
      console.error('Activate VIP error:', error);
    }
  };

  const handleContactSupport = () => {
    // Open support link or show contact info
    Alert.alert('联系客服', '客服微信: TradeFuture_Support\n客服邮箱: support@tradefuture.app');
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
              <TouchableOpacity style={styles.avatarContainer} onPress={handlePickAvatar}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                ) : (
                  <FontAwesome6 name="circle-user" size={40} color={COLORS.primary} />
                )}
                <View style={styles.avatarEditBadge}>
                  <FontAwesome6 name="camera" size={10} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
              <View style={styles.userInfo}>
                <TouchableOpacity onPress={handleCopyAddress}>
                  <Text style={styles.userAddress}>
                    {isConnected ? wallet?.shortAddress : '未连接'}
                  </Text>
                  {isConnected && (
                    <Text style={styles.copyHint}>点击复制地址</Text>
                  )}
                </TouchableOpacity>
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
              <TouchableOpacity style={styles.renewBtn} onPress={handleActivateVIP}>
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
              <TouchableOpacity style={styles.activateBtn} onPress={handleActivateVIP}>
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
            <TouchableOpacity style={styles.viewAllBtn} onPress={handleShowTeamModal}>
              <Text style={styles.viewAllText}>查看全部成员 →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Referral Rewards */}
        <View style={styles.rewardCard}>
          {/* Main Reward Info */}
          <View style={styles.rewardInfo}>
            <View style={styles.rewardMainLeft}>
              <Text style={styles.rewardLabel}>累计推荐奖励</Text>
              <View style={styles.rewardValueRow}>
                <Text style={styles.rewardValue}>{(profile?.totalReferralReward || 0).toFixed(2)}</Text>
                <Text style={styles.rewardValueUnit}>TFT</Text>
              </View>
            </View>
            <View style={styles.rewardPending}>
              <Text style={styles.rewardPendingLabel}>待领取</Text>
              <View style={styles.rewardPendingRow}>
                <Text style={[styles.rewardPendingValue, (profile?.pendingReferralReward ?? 0) <= 0 && styles.rewardPendingZero]}>
                  {(profile?.pendingReferralReward || 0).toFixed(2)}
                </Text>
                <Text style={styles.rewardPendingUnit}>TFT</Text>
              </View>
            </View>
          </View>

          {/* Reward Breakdown */}
          <View style={styles.rewardBreakdown}>
            <View style={styles.rewardBreakdownItem}>
              <Text style={styles.rewardBreakdownLabel}>直推奖励</Text>
              <Text style={styles.rewardBreakdownValue}>{(profile?.directReward || 0).toFixed(2)}</Text>
              <Text style={styles.rewardBreakdownUnit}>TFT</Text>
            </View>
            <View style={styles.rewardBreakdownDivider} />
            <View style={styles.rewardBreakdownItem}>
              <Text style={styles.rewardBreakdownLabel}>见点奖励</Text>
              <Text style={styles.rewardBreakdownValue}>{(profile?.levelReward || 0).toFixed(2)}</Text>
              <Text style={styles.rewardBreakdownUnit}>TFT</Text>
            </View>
            <View style={styles.rewardBreakdownDivider} />
            <View style={styles.rewardBreakdownItem}>
              <Text style={styles.rewardBreakdownLabel}>已领取</Text>
              <Text style={styles.rewardBreakdownValue}>{(profile?.claimedReward || 0).toFixed(2)}</Text>
              <Text style={styles.rewardBreakdownUnit}>TFT</Text>
            </View>
          </View>

          {/* Last Claim TxHash */}
          {lastClaimTx && (
            <View style={styles.lastClaimRow}>
              <FontAwesome6 name="circle-check" size={12} color={COLORS.success} />
              <Text style={styles.lastClaimText} numberOfLines={1}>
                上次领取：{lastClaimTx.slice(0, 8)}...{lastClaimTx.slice(-6)}
              </Text>
            </View>
          )}

          {/* Claim Button */}
          <TouchableOpacity
            style={[
              styles.claimRewardBtn,
              (!isConnected) && styles.claimRewardBtnConnect,
              (claiming || !profile?.pendingReferralReward || (profile?.pendingReferralReward ?? 0) <= 0) && styles.claimRewardBtnDisabled,
            ]}
            onPress={handleClaimReferral}
            disabled={claiming}
          >
            {claiming ? (
              <ActivityIndicator color={isConnected ? COLORS.primary : COLORS.textPrimary} size="small" />
            ) : (
              <Text style={[styles.claimRewardText, (!isConnected) && styles.claimRewardTextConnect]}>
                {!isConnected ? '连接钱包领取' : (profile?.pendingReferralReward && profile.pendingReferralReward > 0) ? '领取奖励' : '暂无可领取'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Reward History Toggle */}
          {profile?.rewardHistory && profile.rewardHistory.length > 0 && (
            <TouchableOpacity
              style={styles.rewardHistoryToggle}
              onPress={() => setShowRewardHistory(!showRewardHistory)}
            >
              <Text style={styles.rewardHistoryToggleText}>
                {showRewardHistory ? '收起明细' : '奖励明细'} ({profile.rewardHistory.length})
              </Text>
              <FontAwesome6
                name={showRewardHistory ? 'chevron-up' : 'chevron-down'}
                size={10}
                color={COLORS.textSecondary}
              />
            </TouchableOpacity>
          )}

          {/* Reward History List */}
          {showRewardHistory && profile?.rewardHistory?.map((item) => (
            <View key={item.id} style={styles.rewardHistoryItem}>
              <View style={styles.rewardHistoryLeft}>
                <View style={[
                  styles.rewardHistoryTypeIcon,
                  item.type === 'direct' ? { backgroundColor: 'rgba(245,166,35,0.12)' } : { backgroundColor: 'rgba(99,102,241,0.12)' },
                ]}>
                  <FontAwesome6
                    name={item.type === 'direct' ? 'user-plus' : 'layer-group'}
                    size={10}
                    color={item.type === 'direct' ? COLORS.primary : '#818cf8'}
                  />
                </View>
                <View>
                  <Text style={styles.rewardHistoryType}>
                    {item.type === 'direct' ? '直推奖励' : `见点奖励${item.level ? ` L${item.level}` : ''}`}
                  </Text>
                  <Text style={styles.rewardHistoryFrom}>来自 {item.from}</Text>
                </View>
              </View>
              <View style={styles.rewardHistoryRight}>
                <Text style={styles.rewardHistoryAmount}>+{item.amount.toFixed(2)}</Text>
                <Text style={styles.rewardHistoryDate}>{item.date}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Function Entries */}
        <View style={styles.functionGrid}>
          <TouchableOpacity style={styles.functionBtn} onPress={handleNavigateToNode}>
            <View style={styles.functionIconContainer}>
              <FontAwesome6 name="cubes" size={18} color={COLORS.primary} />
            </View>
            <Text style={styles.functionText}>我的节点</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.functionBtn} onPress={handleNavigateToMarketMaker}>
            <View style={styles.functionIconContainer}>
              <FontAwesome6 name="chart-line" size={18} color={COLORS.primary} />
            </View>
            <Text style={styles.functionText}>做市商</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.functionBtn} onPress={handleNavigateToTokenomics}>
            <View style={styles.functionIconContainer}>
              <FontAwesome6 name="coins" size={18} color={COLORS.primary} />
            </View>
            <Text style={styles.functionText}>代币经济</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.functionBtn} onPress={handleShowTutorial}>
            <View style={styles.functionIconContainer}>
              <FontAwesome6 name="book" size={18} color={COLORS.primary} />
            </View>
            <Text style={styles.functionText}>使用教程</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.functionBtn} onPress={handleShowSettings}>
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
                <FontAwesome6 name="xmark" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.posterContent}>
              <View ref={posterRef} collapsable={false}>
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
                  <View style={styles.posterQrContainer}>
                    {profile?.inviteCode ? (
                      <View style={styles.qrCodeWrapper}>
                        <QRCode
                          value={`tradefuture://invite?code=${profile.inviteCode}`}
                          size={120}
                          color="#000000"
                          backgroundColor="#FFFFFF"
                        />
                      </View>
                    ) : (
                      <View style={styles.posterQrPlaceholder}>
                        <FontAwesome6 name="qrcode" size={80} color={COLORS.textSecondary} />
                      </View>
                    )}
                    <Text style={styles.posterQrText}>扫码加入</Text>
                  </View>
                  <Text style={styles.posterFooter}>预测 BTC 价格 · 赢取丰厚奖励</Text>
                </LinearGradient>
              </View>
            </View>
            <View style={styles.posterActions}>
              <TouchableOpacity 
                style={styles.posterSaveBtn} 
                onPress={handleSavePoster}
                disabled={isSavingPoster}
              >
                {isSavingPoster ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <>
                    <FontAwesome6 name="download" size={16} color={COLORS.primary} />
                    <Text style={styles.posterSaveText}>保存海报</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.posterShareBtn} onPress={handleSharePoster}>
                <FontAwesome6 name="share-nodes" size={16} color={COLORS.background} />
                <Text style={styles.posterShareText}>分享邀请</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Team Members Modal */}
      <Modal visible={showTeamModal} transparent animationType="slide" onRequestClose={() => setShowTeamModal(false)}>
        <View style={styles.teamModalOverlay}>
          <View style={styles.teamModal}>
            {/* Header */}
            <View style={styles.teamModalHeader}>
              <Text style={styles.teamModalTitle}>团队成员</Text>
              <TouchableOpacity onPress={() => setShowTeamModal(false)}>
                <FontAwesome6 name="xmark" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Stats Summary */}
            <View style={styles.teamStatsRow}>
              <View style={styles.teamStatItem}>
                <Text style={styles.teamStatValue}>{profile?.teamMembers.length || 0}</Text>
                <Text style={styles.teamStatLabel}>总成员</Text>
              </View>
              <View style={styles.teamStatDivider} />
              <View style={styles.teamStatItem}>
                <Text style={styles.teamStatValue}>{profile?.teamMembers.filter(m => m.isDirect).length || 0}</Text>
                <Text style={styles.teamStatLabel}>直推</Text>
              </View>
              <View style={styles.teamStatDivider} />
              <View style={styles.teamStatItem}>
                <Text style={styles.teamStatValue}>${(profile?.teamMembers.reduce((s, m) => s + m.volume, 0) || 0).toLocaleString()}</Text>
                <Text style={styles.teamStatLabel}>总预测额</Text>
              </View>
              <View style={styles.teamStatDivider} />
              <View style={styles.teamStatItem}>
                <Text style={styles.teamStatValue}>${(profile?.teamMembers.reduce((s, m) => s + m.contribution, 0) || 0).toFixed(0)}</Text>
                <Text style={styles.teamStatLabel}>总贡献</Text>
              </View>
            </View>

            {/* Filter Tabs */}
            <View style={styles.teamFilterRow}>
              {([['all', '全部'], ['direct', '直推'], ['indirect', '间推']] as const).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.teamFilterTab, teamFilter === key && styles.teamFilterTabActive]}
                  onPress={() => setTeamFilter(key)}
                >
                  <Text style={[styles.teamFilterTabText, teamFilter === key && styles.teamFilterTabTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Sort Options */}
            <View style={styles.teamSortRow}>
              <Text style={styles.teamSortLabel}>排序：</Text>
              {([['volume', '预测额'], ['contribution', '贡献'], ['level', '等级'], ['date', '时间']] as const).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.teamSortBtn, teamSort === key && styles.teamSortBtnActive]}
                  onPress={() => setTeamSort(key)}
                >
                  <Text style={[styles.teamSortBtnText, teamSort === key && styles.teamSortBtnTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Member List */}
            <ScrollView style={styles.teamListScroll} showsVerticalScrollIndicator={false}>
              {profile?.teamMembers
                .filter(m => teamFilter === 'all' || (teamFilter === 'direct' ? m.isDirect : !m.isDirect))
                .sort((a, b) => {
                  if (teamSort === 'volume') return b.volume - a.volume;
                  if (teamSort === 'contribution') return b.contribution - a.contribution;
                  if (teamSort === 'level') return b.level - a.level;
                  return new Date(b.joinDate).getTime() - new Date(a.joinDate).getTime();
                })
                .map((member) => (
                  <View key={member.id} style={styles.teamModalItem}>
                    <View style={styles.teamModalItemLeft}>
                      <View style={[styles.teamModalAvatar, member.isDirect ? styles.teamDirectAvatar : styles.teamIndirectAvatar]}>
                        <Text style={styles.teamModalAvatarText}>L{member.level}</Text>
                      </View>
                      <View style={styles.teamModalInfo}>
                        <View style={styles.teamModalAddrRow}>
                          <Text style={styles.teamModalAddress}>{member.address}</Text>
                          <View style={[styles.teamBadge, member.isDirect ? styles.teamBadgeDirect : styles.teamBadgeIndirect]}>
                            <Text style={[styles.teamBadgeText, member.isDirect ? styles.teamBadgeTextDirect : styles.teamBadgeTextIndirect]}>
                              {member.isDirect ? '直推' : '间推'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.teamModalDate}>加入时间：{member.joinDate}</Text>
                      </View>
                    </View>
                    <View style={styles.teamModalItemRight}>
                      <Text style={styles.teamModalVolume}>${member.volume.toLocaleString()}</Text>
                      <Text style={styles.teamModalContribution}>+${member.contribution.toFixed(2)}</Text>
                    </View>
                  </View>
                ))}
            </ScrollView>

            {/* Footer */}
            <View style={styles.teamModalFooter}>
              <TouchableOpacity style={styles.teamModalCloseBtn} onPress={() => setShowTeamModal(false)}>
                <Text style={styles.teamModalCloseText}>关闭</Text>
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
    position: 'relative',
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  userInfo: { flex: 1 },
  userAddress: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, fontFamily: 'monospace' },
  copyHint: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
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
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  rewardInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 },
  rewardMainLeft: { flex: 1 },
  rewardLabel: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 8, letterSpacing: 0.5 },
  rewardValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  rewardValue: { fontSize: 28, fontWeight: '800', color: COLORS.primary, fontFamily: 'monospace', lineHeight: 32 },
  rewardValueUnit: { fontSize: 12, color: COLORS.primary, fontWeight: '600', opacity: 0.7 },
  rewardPending: { alignItems: 'flex-end' },
  rewardPendingLabel: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 8, letterSpacing: 0.5 },
  rewardPendingRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  rewardPendingValue: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, fontFamily: 'monospace', lineHeight: 24 },
  rewardPendingUnit: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },
  rewardPendingZero: { color: COLORS.textSecondary, opacity: 0.5 },
  claimRewardBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  claimRewardBtnDisabled: { opacity: 0.45 },
  claimRewardBtnConnect: { borderColor: COLORS.primary, backgroundColor: 'rgba(245,166,35,0.08)' },
  claimRewardText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  claimRewardTextConnect: { color: COLORS.primary },
  // Reward Breakdown
  rewardBreakdown: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-around',
    paddingVertical: 14,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  rewardBreakdownItem: { flex: 1, alignItems: 'center', gap: 2 },
  rewardBreakdownLabel: { fontSize: 11, color: COLORS.textSecondary },
  rewardBreakdownValue: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, fontFamily: 'monospace' },
  rewardBreakdownUnit: { fontSize: 9, color: COLORS.textSecondary, marginTop: -1 },
  rewardBreakdownDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.08)', alignSelf: 'center' },
  // Last Claim
  lastClaimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  lastClaimText: { fontSize: 11, color: COLORS.textSecondary, fontFamily: 'monospace', flex: 1 },
  // Reward History
  rewardHistoryToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  rewardHistoryToggleText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' },
  rewardHistoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  rewardHistoryLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rewardHistoryTypeIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rewardHistoryType: { fontSize: 12, fontWeight: '600', color: COLORS.textPrimary },
  rewardHistoryFrom: { fontSize: 10, color: COLORS.textSecondary, fontFamily: 'monospace', marginTop: 1 },
  rewardHistoryRight: { alignItems: 'flex-end' },
  rewardHistoryAmount: { fontSize: 13, fontWeight: '700', color: COLORS.success, fontFamily: 'monospace' },
  rewardHistoryDate: { fontSize: 10, color: COLORS.textSecondary, marginTop: 1 },
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
  posterQrContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  qrCodeWrapper: {
    width: 140,
    height: 140,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
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
  posterActions: { padding: 16, paddingTop: 0, flexDirection: 'row', gap: 12 },
  posterSaveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  posterSaveText: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  posterShareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  posterShareText: { fontSize: 15, fontWeight: '700', color: COLORS.background },
  // Team Modal
  teamModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
    padding: 0,
  },
  teamModal: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  teamModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  teamModalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
  teamStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(245,166,35,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.12)',
  },
  teamStatItem: { alignItems: 'center' },
  teamStatValue: { fontSize: 16, fontWeight: '800', color: COLORS.primary, fontFamily: 'monospace' },
  teamStatLabel: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2 },
  teamStatDivider: { width: 1, height: 28, backgroundColor: COLORS.border },
  teamFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 8,
  },
  teamFilterTab: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  teamFilterTabActive: {
    backgroundColor: 'rgba(245,166,35,0.12)',
    borderColor: COLORS.primary,
  },
  teamFilterTabText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  teamFilterTabTextActive: { color: COLORS.primary },
  teamSortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 6,
  },
  teamSortLabel: { fontSize: 12, color: COLORS.textSecondary },
  teamSortBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  teamSortBtnActive: {
    backgroundColor: 'rgba(245,166,35,0.1)',
  },
  teamSortBtnText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' },
  teamSortBtnTextActive: { color: COLORS.primary, fontWeight: '700' },
  teamListScroll: {
    maxHeight: 340,
    paddingHorizontal: 16,
    marginTop: 6,
  },
  teamModalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  teamModalItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  teamModalAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  teamDirectAvatar: {
    backgroundColor: 'rgba(245,166,35,0.15)',
  },
  teamIndirectAvatar: {
    backgroundColor: 'rgba(99,102,241,0.15)',
  },
  teamModalAvatarText: { fontSize: 11, fontWeight: '800', color: COLORS.primary },
  teamModalInfo: { flex: 1 },
  teamModalAddrRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  teamModalAddress: { fontSize: 13, color: COLORS.textPrimary, fontFamily: 'monospace' },
  teamBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  teamBadgeDirect: {
    backgroundColor: 'rgba(245,166,35,0.12)',
  },
  teamBadgeIndirect: {
    backgroundColor: 'rgba(99,102,241,0.12)',
  },
  teamBadgeText: { fontSize: 9, fontWeight: '700' },
  teamBadgeTextDirect: { color: COLORS.primary },
  teamBadgeTextIndirect: { color: '#818cf8' },
  teamModalDate: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2 },
  teamModalItemRight: { alignItems: 'flex-end' },
  teamModalVolume: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, fontFamily: 'monospace' },
  teamModalContribution: { fontSize: 11, color: COLORS.success, marginTop: 2 },
  teamModalFooter: {
    padding: 16,
    paddingTop: 8,
  },
  teamModalCloseBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  teamModalCloseText: { fontSize: 15, fontWeight: '700', color: COLORS.textSecondary },
});
