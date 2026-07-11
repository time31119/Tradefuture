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

interface NodeData {
  activeNodes: number;
  maxNodes: number;
  pendingRewardsUSDT: number;
  pendingRewardsTFT: number;
  totalClaimedRewards: number;
  lpLocked: number;
  lpWithdrawable: number;
  lpUnlockProgress: { current: number; total: number };
  nextUnlockAmount: number;
  nextUnlockDays: number;
  tftPrice: number;
}

export default function ProfileScreen() {
  const { isConnected, wallet, connect, disconnect } = useWallet();
  const router = useSafeRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimingNode, setClaimingNode] = useState(false);
  const [withdrawingLp, setWithdrawingLp] = useState(false);
  const [nodeData, setNodeData] = useState<NodeData | null>(null);
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

  const fetchNodeData = useCallback(async () => {
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：GET /api/v1/node/overview
       */
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/node/overview`);
      const result = await res.json();
      if (result.success) {
        setNodeData(result.data);
      }
    } catch (error) {
      console.error('Fetch node data error:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
      fetchNodeData();
    }, [fetchProfile, fetchNodeData])
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

  const handleClaimNodeRewards = async () => {
    if (!isConnected) {
      connect();
      return;
    }
    if (!nodeData || (nodeData.pendingRewardsUSDT <= 0 && nodeData.pendingRewardsTFT <= 0)) {
      Alert.alert('提示', '暂无可领取的节点收益');
      return;
    }
    setClaimingNode(true);
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/node/claim
       */
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/node/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await res.json();
      if (result.success) {
        Alert.alert(
          '领取成功',
          `已领取 ${result.data.claimedUSDT} USDT + ${result.data.claimedTFT} TFT\n\n交易哈希：\n${result.data.txHash.slice(0, 10)}...${result.data.txHash.slice(-8)}`
        );
        fetchNodeData();
      }
    } catch (error) {
      console.error('Claim node rewards error:', error);
    } finally {
      setClaimingNode(false);
    }
  };

  const handleWithdrawLp = async () => {
    if (!isConnected) {
      connect();
      return;
    }
    if (!nodeData || nodeData.lpWithdrawable <= 0) {
      Alert.alert('提示', '暂无可撤回的LP');
      return;
    }
    setWithdrawingLp(true);
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/node/withdraw-lp
       */
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/node/withdraw-lp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await res.json();
      if (result.success) {
        Alert.alert(
          '撤回成功',
          `已撤回 ${result.data.withdrawn} TFT\n\n交易哈希：\n${result.data.txHash.slice(0, 10)}...${result.data.txHash.slice(-8)}`
        );
        fetchNodeData();
      }
    } catch (error) {
      console.error('Withdraw LP error:', error);
    } finally {
      setWithdrawingLp(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!profile) return;
    const inviteCode = profile.inviteCode;
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(inviteCode);
        Alert.alert('复制成功', `邀请码 ${inviteCode} 已复制到剪贴板`);
      } else {
        // Mobile: use Share API to share the invite code
        await Share.share({
          message: `我的TradeFuture邀请码: ${inviteCode}`,
          title: 'TradeFuture 邀请码',
        });
      }
    } catch (error) {
      // Fallback: show the code for manual copy
      Alert.alert('邀请码', inviteCode);
    }
  };

  const handleShareLink = async () => {
    if (!profile) return;
    const inviteLink = `https://tradefuture.app?ref=${profile.inviteCode}`;
    const shareMessage = `加入 TradeFuture，一起预测BTC价格赢取奖励！\n\n使用我的邀请码: ${profile.inviteCode}\n${inviteLink}`;
    
    try {
      if (Platform.OS === 'web') {
        // Web: use clipboard API
        await navigator.clipboard.writeText(inviteLink);
        Alert.alert('复制成功', `邀请链接已复制到剪贴板\n${inviteLink}`);
      } else {
        // Mobile: use Share API
        const result = await Share.share({
          message: shareMessage,
          title: 'TradeFuture 邀请',
        });
        if (result.action === Share.sharedAction) {
          // Share completed
        } else if (result.action === Share.dismissedAction) {
          // Share dismissed
        }
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
        // Directly save the captured image to media library
        await MediaLibrary.createAssetAsync(uri);
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
              <TouchableOpacity style={styles.avatarContainer} onPress={isConnected ? handlePickAvatar : connect}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                ) : (
                  <FontAwesome6 name="circle-user" size={40} color={isConnected ? COLORS.primary : COLORS.textSecondary} />
                )}
                {isConnected && (
                  <View style={styles.avatarEditBadge}>
                    <FontAwesome6 name="camera" size={10} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
              <View style={styles.userInfo}>
                {isConnected ? (
                  <TouchableOpacity onPress={handleCopyAddress}>
                    <Text style={styles.userAddress}>{wallet?.shortAddress}</Text>
                    <Text style={styles.copyHint}>点击复制地址</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={connect} style={styles.connectWalletBtn}>
                    <FontAwesome6 name="wallet" size={14} color={COLORS.primary} />
                    <Text style={styles.connectWalletText}>连接钱包</Text>
                  </TouchableOpacity>
                )}
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

        {/* Node Earnings Section */}
        <View style={styles.nodeEarningsCard}>
          {/* Node Status Header */}
          <View style={styles.nodeStatusHeader}>
            <View style={styles.nodeStatusLeft}>
              <FontAwesome6 name="cubes" size={16} color={COLORS.primary} />
              <Text style={styles.nodeStatusText}>
                {nodeData?.activeNodes || 0}/{nodeData?.maxNodes || 0} 活跃节点
              </Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/node')}>
              <Text style={styles.nodeManageText}>管理节点</Text>
            </TouchableOpacity>
          </View>

          {/* Asset Data Grid */}
          <View style={styles.nodeDataGrid}>
            {/* Left Column - USD Related */}
            <View style={styles.nodeDataColumn}>
              <View style={styles.nodeDataItem}>
                <Text style={styles.nodeDataLabel}>待领USDT</Text>
                <Text style={styles.nodeDataValue}>
                  ${(nodeData?.pendingRewardsUSDT || 0).toFixed(2)}
                </Text>
              </View>
              <View style={styles.nodeDataItem}>
                <Text style={styles.nodeDataLabel}>已领USDT</Text>
                <Text style={styles.nodeDataValue}>
                  ${((nodeData?.totalClaimedRewards || 0) * 0.8).toFixed(2)}
                </Text>
              </View>
              <View style={styles.nodeDataItem}>
                <Text style={styles.nodeDataLabel}>我的节点</Text>
                <Text style={styles.nodeDataValue}>{nodeData?.activeNodes || 0}</Text>
              </View>
              <View style={styles.nodeDataItem}>
                <Text style={styles.nodeDataLabel}>已撤回LP</Text>
                <Text style={styles.nodeDataValue}>
                  {((nodeData?.lpLocked || 0) * 0.02 * (nodeData?.lpUnlockProgress?.current || 0)).toLocaleString()}
                </Text>
              </View>
            </View>

            {/* Right Column - TFT/LP Related */}
            <View style={styles.nodeDataColumn}>
              <View style={styles.nodeDataItem}>
                <Text style={styles.nodeDataLabel}>待领TFT</Text>
                <Text style={styles.nodeDataValue}>
                  {(nodeData?.pendingRewardsTFT || 0).toFixed(2)}
                </Text>
              </View>
              <View style={styles.nodeDataItem}>
                <Text style={styles.nodeDataLabel}>总锁仓LP</Text>
                <Text style={styles.nodeDataValue}>
                  {(nodeData?.lpLocked || 0).toLocaleString()}
                </Text>
              </View>
              <View style={styles.nodeDataItem}>
                <Text style={styles.nodeDataLabel}>可撤回LP</Text>
                <Text style={[styles.nodeDataValue, (nodeData?.lpWithdrawable || 0) > 0 && styles.nodeDataValueHighlight]}>
                  {(nodeData?.lpWithdrawable || 0).toLocaleString()}
                </Text>
              </View>
              <View style={styles.nodeDataItem}>
                <Text style={styles.nodeDataLabel}>解锁进度</Text>
                <Text style={styles.nodeDataValue}>
                  {nodeData?.lpUnlockProgress?.current || 0}/{nodeData?.lpUnlockProgress?.total || 50}期
                </Text>
              </View>
            </View>
          </View>

          {/* Next Unlock Info */}
          {nodeData && nodeData.nextUnlockDays > 0 && (
            <View style={styles.nextUnlockInfo}>
              <FontAwesome6 name="clock" size={12} color={COLORS.textSecondary} />
              <Text style={styles.nextUnlockText}>
                {nodeData.nextUnlockDays}天后解锁 {(nodeData.nextUnlockAmount || 0).toLocaleString()} TFT
              </Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.nodeActionButtons}>
            <TouchableOpacity
              style={[
                styles.nodeActionBtn,
                styles.nodeActionBtnPrimary,
                (!isConnected || !nodeData || (nodeData.pendingRewardsUSDT <= 0 && nodeData.pendingRewardsTFT <= 0)) && styles.nodeActionBtnDisabled,
              ]}
              onPress={handleClaimNodeRewards}
              disabled={claimingNode}
            >
              {claimingNode ? (
                <ActivityIndicator color={COLORS.background} size="small" />
              ) : (
                <Text style={styles.nodeActionBtnText}>
                  {!isConnected ? '连接钱包' : (nodeData && (nodeData.pendingRewardsUSDT > 0 || nodeData.pendingRewardsTFT > 0)) ? '领取节点收益' : '暂无可领取'}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.nodeActionBtn,
                (!isConnected || !nodeData || nodeData.lpWithdrawable <= 0) && styles.nodeActionBtnDisabled,
              ]}
              onPress={handleWithdrawLp}
              disabled={withdrawingLp}
            >
              {withdrawingLp ? (
                <ActivityIndicator color={COLORS.textSecondary} size="small" />
              ) : (
                <Text style={[styles.nodeActionBtnText, styles.nodeActionBtnTextSecondary]}>
                  {!isConnected ? '连接钱包' : (nodeData && nodeData.lpWithdrawable > 0) ? '撤回LP' : '无可撤回'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Invite Section - Optimized */}
        <View style={styles.inviteCardNew}>
          {/* Header with gradient effect */}
          <View style={styles.inviteHeader}>
            <View style={styles.inviteHeaderLeft}>
              <View style={styles.inviteIconBox}>
                <FontAwesome6 name="user-plus" size={18} color={COLORS.primary} />
              </View>
              <View>
                <Text style={styles.inviteTitleNew}>邀请好友 赚取奖励</Text>
                <Text style={styles.inviteSubtitle}>分享链接，获得推荐奖励</Text>
              </View>
            </View>
          </View>

          {/* Invite Code Display - Tap to copy */}
          <TouchableOpacity style={styles.inviteCodeBox} onPress={handleCopyInvite} activeOpacity={0.7}>
            <View style={styles.inviteCodeLeft}>
              <Text style={styles.inviteCodeLabel}>我的邀请码 (点击复制)</Text>
              <Text style={styles.inviteCodeValue}>{profile?.inviteCode || '--'}</Text>
            </View>
            <View style={styles.inviteCopyBtn}>
              <FontAwesome6 name="copy" size={14} color={COLORS.primary} />
            </View>
          </TouchableOpacity>

          {/* Stats Row */}
          <View style={styles.inviteStatsRow}>
            <View style={styles.inviteStatBox}>
              <Text style={styles.inviteStatNum}>{profile?.directReferrals || 0}</Text>
              <Text style={styles.inviteStatDesc}>直推人数</Text>
            </View>
            <View style={styles.inviteStatDivider} />
            <View style={styles.inviteStatBox}>
              <Text style={styles.inviteStatNum}>${(profile?.teamVolume || 0).toLocaleString()}</Text>
              <Text style={styles.inviteStatDesc}>团队预测额</Text>
            </View>
            <View style={styles.inviteStatDivider} />
            <View style={styles.inviteStatBox}>
              <Text style={styles.inviteStatNum}>{profile?.inviter ? '已绑定' : '无'}</Text>
              <Text style={styles.inviteStatDesc}>邀请人</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.inviteActionRow}>
            <TouchableOpacity style={styles.inviteShareBtn} onPress={handleShareLink}>
              <FontAwesome6 name="share-nodes" size={14} color={COLORS.background} />
              <Text style={styles.inviteShareBtnText}>分享链接</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.invitePosterBtn} onPress={handleInvitePoster}>
              <FontAwesome6 name="image" size={14} color={COLORS.primary} />
              <Text style={styles.invitePosterBtnText}>邀请海报</Text>
            </TouchableOpacity>
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

      {/* Tutorial Modal */}
      <Modal visible={showTutorial} transparent animationType="slide" onRequestClose={() => setShowTutorial(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>使用教程</Text>
              <TouchableOpacity onPress={() => setShowTutorial(false)}>
                <FontAwesome6 name="xmark" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <View style={styles.tutorialSection}>
                <View style={styles.tutorialStep}>
                  <View style={styles.tutorialStepNumber}>
                    <Text style={styles.tutorialStepNumberText}>1</Text>
                  </View>
                  <View style={styles.tutorialStepContent}>
                    <Text style={styles.tutorialStepTitle}>连接钱包</Text>
                    <Text style={styles.tutorialStepDesc}>点击「连接钱包」按钮，授权连接你的 BSC 钱包（支持 MetaMask、Trust Wallet 等）。</Text>
                  </View>
                </View>
                <View style={styles.tutorialStep}>
                  <View style={styles.tutorialStepNumber}>
                    <Text style={styles.tutorialStepNumberText}>2</Text>
                  </View>
                  <View style={styles.tutorialStepContent}>
                    <Text style={styles.tutorialStepTitle}>激活 VIP</Text>
                    <Text style={styles.tutorialStepDesc}>支付 100 USDT 激活 VIP 会员，获得无限次预测资格、直推奖励、见点奖励等权益。</Text>
                  </View>
                </View>
                <View style={styles.tutorialStep}>
                  <View style={styles.tutorialStepNumber}>
                    <Text style={styles.tutorialStepNumberText}>3</Text>
                  </View>
                  <View style={styles.tutorialStepContent}>
                    <Text style={styles.tutorialStepTitle}>参与预测</Text>
                    <Text style={styles.tutorialStepDesc}>在预测页面选择 BTC 涨跌方向和下注金额，每 5 分钟一期，赢家瓜分 80% 奖池。</Text>
                  </View>
                </View>
                <View style={styles.tutorialStep}>
                  <View style={styles.tutorialStepNumber}>
                    <Text style={styles.tutorialStepNumberText}>4</Text>
                  </View>
                  <View style={styles.tutorialStepContent}>
                    <Text style={styles.tutorialStepTitle}>邀请好友</Text>
                    <Text style={styles.tutorialStepDesc}>分享邀请链接或海报，好友激活 VIP 后你可获得 50 USDT 直推奖励，以及 20 级见点奖励。</Text>
                  </View>
                </View>
                <View style={styles.tutorialStep}>
                  <View style={styles.tutorialStepNumber}>
                    <Text style={styles.tutorialStepNumberText}>5</Text>
                  </View>
                  <View style={styles.tutorialStepContent}>
                    <Text style={styles.tutorialStepTitle}>升级节点/做市商</Text>
                    <Text style={styles.tutorialStepDesc}>销毁 TFT 或添加 LP 获得节点合伙人资格，或达成推荐业绩成为做市商，享受更多分红权益。</Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Settings Modal */}
      <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>设置</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <FontAwesome6 name="xmark" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>账户</Text>
                <View style={styles.settingsItem}>
                  <View style={styles.settingsItemLeft}>
                    <FontAwesome6 name="wallet" size={18} color={COLORS.primary} />
                    <Text style={styles.settingsItemText}>钱包地址</Text>
                  </View>
                  <Text style={styles.settingsItemValue} numberOfLines={1} ellipsizeMode="middle">
                    {isConnected ? wallet?.shortAddress : '未连接'}
                  </Text>
                </View>
                <View style={styles.settingsItem}>
                  <View style={styles.settingsItemLeft}>
                    <FontAwesome6 name="shield-halved" size={18} color={COLORS.primary} />
                    <Text style={styles.settingsItemText}>VIP 状态</Text>
                  </View>
                  <Text style={[styles.settingsItemValue, { color: profile?.isVIP ? COLORS.primary : COLORS.textSecondary }]}>
                    {profile?.isVIP ? '已激活' : '未激活'}
                  </Text>
                </View>
              </View>

              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>网络</Text>
                <View style={styles.settingsItem}>
                  <View style={styles.settingsItemLeft}>
                    <FontAwesome6 name="link" size={18} color={COLORS.primary} />
                    <Text style={styles.settingsItemText}>当前网络</Text>
                  </View>
                  <Text style={styles.settingsItemValue}>BSC (BEP-20)</Text>
                </View>
              </View>

              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>关于</Text>
                <View style={styles.settingsItem}>
                  <View style={styles.settingsItemLeft}>
                    <FontAwesome6 name="circle-info" size={18} color={COLORS.primary} />
                    <Text style={styles.settingsItemText}>版本</Text>
                  </View>
                  <Text style={styles.settingsItemValue}>v1.0.0</Text>
                </View>
                <View style={styles.settingsItem}>
                  <View style={styles.settingsItemLeft}>
                    <FontAwesome6 name="file-contract" size={18} color={COLORS.primary} />
                    <Text style={styles.settingsItemText}>合约地址</Text>
                  </View>
                  <Text style={styles.settingsItemValue} numberOfLines={1} ellipsizeMode="middle">待部署</Text>
                </View>
              </View>

              {isConnected && (
                <View style={styles.settingsSection}>
                  <TouchableOpacity
                    style={styles.disconnectBtn}
                    onPress={() => {
                      disconnect();
                      setShowSettings(false);
                    }}
                  >
                    <FontAwesome6 name="right-from-bracket" size={16} color="#EF4444" />
                    <Text style={styles.disconnectBtnText}>断开钱包连接</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
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
  connectWalletBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(99,102,241,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  connectWalletText: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
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
  // Invite Card New (Optimized)
  inviteCardNew: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inviteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  inviteHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inviteIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(245,166,35,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteTitleNew: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  inviteSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  inviteCodeBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inviteCodeLeft: {
    gap: 4,
  },
  inviteCodeLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  inviteCodeValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  inviteCopyBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(245,166,35,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  inviteStatBox: {
    flex: 1,
    alignItems: 'center',
  },
  inviteStatNum: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontFamily: 'monospace',
  },
  inviteStatDesc: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  inviteStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.border,
  },
  inviteActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inviteShareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  inviteShareBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.background,
  },
  invitePosterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(245,166,35,0.12)',
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.3)',
  },
  invitePosterBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
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
  // Tutorial & Settings Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
  modalBody: { padding: 20, maxHeight: 400 },
  // Tutorial
  tutorialSection: { gap: 16 },
  tutorialStep: { flexDirection: 'row', gap: 12 },
  tutorialStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(245,166,35,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tutorialStepNumberText: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  tutorialStepContent: { flex: 1 },
  tutorialStepTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 4 },
  tutorialStepDesc: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
  // Settings
  settingsSection: { marginBottom: 20 },
  settingsSectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 10, letterSpacing: 0.5 },
  settingsItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  settingsItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  settingsItemText: { fontSize: 14, color: COLORS.textPrimary },
  settingsItemValue: { fontSize: 13, color: COLORS.textSecondary, fontFamily: 'monospace', maxWidth: 160 },
  disconnectBtnText: { fontSize: 14, fontWeight: '700', color: '#EF4444', marginLeft: 8 },
  // Node Earnings Section
  nodeEarningsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  nodeStatusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  nodeStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nodeStatusText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  nodeManageText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },
  nodeDataGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  nodeDataColumn: {
    flex: 1,
    gap: 8,
  },
  nodeDataItem: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: 10,
  },
  nodeDataLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  nodeDataValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontFamily: 'monospace',
  },
  nodeDataValueHighlight: {
    color: COLORS.success,
  },
  nextUnlockInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245,166,35,0.08)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  nextUnlockText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  nodeActionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  nodeActionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  nodeActionBtnPrimary: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  nodeActionBtnDisabled: {
    opacity: 0.5,
  },
  nodeActionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.background,
  },
  nodeActionBtnTextSecondary: {
    color: COLORS.textSecondary,
  },
});
