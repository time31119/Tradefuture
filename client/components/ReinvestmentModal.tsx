import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome6 } from '@expo/vector-icons';
import { COLORS } from '@/utils/theme';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';

export interface ReinvestmentData {
  cumulativeLevelRewards: number;
  reinvestmentAmount: number;
  deadline: string; // ISO string
  triggeredAt: string; // ISO string
  benefitsPaused: boolean;
}

interface ReinvestmentModalProps {
  visible: boolean;
  data: ReinvestmentData | null;
  onClose: () => void;
  onReinvest: () => void;
  onDismiss: () => void;
}

export function ReinvestmentModal({
  visible,
  data,
  onClose,
  onReinvest,
  onDismiss,
}: ReinvestmentModalProps) {
  const [timeRemaining, setTimeRemaining] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const cumulativeRewards = data?.cumulativeLevelRewards || 0;
  const reinvestAmount = data?.reinvestmentAmount || 100;
  const deadline = data ? new Date(data.deadline).getTime() : 0;
  const isPaused = data?.benefitsPaused || false;

  // Countdown timer
  useEffect(() => {
    if (!visible || !deadline) return;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = deadline - now;

      if (remaining <= 0) {
        setTimeRemaining('00:00:00');
        return;
      }

      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

      setTimeRemaining(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [visible, deadline]);

  const handleReinvest = async () => {
    setIsProcessing(true);
    try {
      // In production, this would trigger wallet signature
      await onReinvest();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.warningIcon}>
              <FontAwesome6 name="triangle-exclamation" size={24} color="#F59E0B" />
            </View>
            <Text style={styles.title}>
              {isPaused ? '权益已暂停' : 'VIP复投提醒'}
            </Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <FontAwesome6 name="xmark" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {isPaused ? (
              <View style={styles.pausedContent}>
                <Text style={styles.pausedText}>
                  您的推广权益已被暂停。
                </Text>
                <Text style={styles.pausedSubtext}>
                  由于未在48小时内完成复投，您的见点奖励、直推奖励及滑点分红等推广权益已被暂停。
                </Text>
                <Text style={styles.pausedAction}>
                  请立即完成复投以恢复权益。
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.description}>
                  您累计获得的见点奖励已达到{' '}
                  <Text style={styles.highlight}>{cumulativeRewards.toFixed(2)} USDT</Text>
                  。
                </Text>
                
                <Text style={styles.description}>
                  根据规则，需使用其中{' '}
                  <Text style={styles.highlight}>{reinvestAmount} USDT</Text>{' '}
                  进行VIP复投，方可继续享有后续见点奖励、直推奖励及滑点分红等全部推广权益。
                </Text>

                <Text style={styles.subDescription}>
                  复投的 {reinvestAmount} USDT 将按VIP激活费分配规则执行：
                </Text>

                {/* Distribution breakdown */}
                <View style={styles.distributionList}>
                  <View style={styles.distributionItem}>
                    <Text style={styles.distributionPercent}>3%</Text>
                    <Text style={styles.distributionDesc}>节点分红池</Text>
                  </View>
                  <View style={styles.distributionItem}>
                    <Text style={styles.distributionPercent}>1%</Text>
                    <Text style={styles.distributionDesc}>运营钱包</Text>
                  </View>
                  <View style={styles.distributionItem}>
                    <Text style={styles.distributionPercent}>1%</Text>
                    <Text style={styles.distributionDesc}>做市商池</Text>
                  </View>
                  <View style={styles.distributionItem}>
                    <Text style={styles.distributionPercent}>5%</Text>
                    <Text style={styles.distributionDesc}>自动销毁</Text>
                  </View>
                  <View style={styles.distributionItem}>
                    <Text style={styles.distributionPercent}>20%</Text>
                    <Text style={styles.distributionDesc}>见点奖励（上级20级）</Text>
                  </View>
                  <View style={styles.distributionItem}>
                    <Text style={styles.distributionPercent}>50%</Text>
                    <Text style={styles.distributionDesc}>直推奖励（直接上级）</Text>
                  </View>
                  <View style={styles.distributionItem}>
                    <Text style={styles.distributionPercent}>20%</Text>
                    <Text style={styles.distributionDesc}>等值TFT返还给您</Text>
                  </View>
                </View>

                {/* Countdown */}
                <View style={styles.countdownContainer}>
                  <FontAwesome6 name="clock" size={16} color="#F59E0B" />
                  <Text style={styles.countdownLabel}>剩余时间：</Text>
                  <Text style={styles.countdownTime}>{timeRemaining}</Text>
                </View>

                <Text style={styles.warningText}>
                  若超时未复投，您的后续推广权益将被暂停。
                </Text>
              </>
            )}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            {!isPaused && (
              <TouchableOpacity
                style={styles.deferBtn}
                onPress={onDismiss}
                disabled={isProcessing}
              >
                <Text style={styles.deferBtnText}>稍后处理</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={styles.reinvestBtn}
              onPress={handleReinvest}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <LinearGradient
                  colors={['#6366F1', '#8B5CF6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.gradient}
                >
                  <Text style={styles.reinvestBtnText}>
                    {isPaused ? '立即复投恢复权益' : '立即复投'}
                  </Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Reminder Banner for homepage
interface ReinvestmentBannerProps {
  visible: boolean;
  onPress: () => void;
  timeRemaining: string;
  isPaused: boolean;
}

export function ReinvestmentBanner({
  visible,
  onPress,
  timeRemaining,
  isPaused,
}: ReinvestmentBannerProps) {
  if (!visible) return null;

  return (
    <TouchableOpacity style={styles.banner} onPress={onPress}>
      <View style={styles.bannerContent}>
        <FontAwesome6
          name={isPaused ? 'ban' : 'triangle-exclamation'}
          size={16}
          color={isPaused ? '#EF4444' : '#F59E0B'}
        />
        <Text style={styles.bannerText}>
          {isPaused
            ? '推广权益已暂停，请立即复投'
            : `待复投 · 剩余 ${timeRemaining}`}
        </Text>
      </View>
      <FontAwesome6 name="chevron-right" size={14} color={COLORS.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  warningIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  closeBtn: {
    padding: 8,
  },
  content: {
    padding: 20,
  },
  pausedContent: {
    alignItems: 'center',
  },
  pausedText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#EF4444',
    marginBottom: 12,
  },
  pausedSubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  pausedAction: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  description: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 22,
    marginBottom: 12,
  },
  highlight: {
    fontWeight: '700',
    color: '#6366F1',
  },
  subDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  distributionList: {
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  distributionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  distributionPercent: {
    width: 40,
    fontSize: 13,
    fontWeight: '700',
    color: '#6366F1',
  },
  distributionDesc: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  countdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  countdownLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginLeft: 8,
  },
  countdownTime: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F59E0B',
    marginLeft: 4,
    fontVariant: ['tabular-nums'],
  },
  warningText: {
    fontSize: 12,
    color: '#EF4444',
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    paddingTop: 0,
    gap: 12,
  },
  deferBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  deferBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  reinvestBtn: {
    flex: 2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  gradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  reinvestBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  // Banner styles
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  bannerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginLeft: 8,
  },
});
