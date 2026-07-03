import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useWallet } from '@/contexts/WalletContext';
import { useFocusEffect } from 'expo-router';
import { COLORS } from '@/utils/theme';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';

interface Balances {
  tftBalance: number;
  usdtBalance: number;
  lpBalance: number;
  tftPrice: number;
  totalLP: number;
  poolTFT: number;
  poolUSDT: number;
}

interface SwapQuote {
  inputAmount: number;
  outputAmount: number;
  rate: number;
  slippage: number;
  fee: number;
}

export default function SwapScreen() {
  const { isConnected } = useWallet();
  const [balances, setBalances] = useState<Balances | null>(null);
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [fromToken, setFromToken] = useState<'TFT' | 'USDT'>('TFT');
  const [toToken, setToToken] = useState<'TFT' | 'USDT'>('USDT');
  const [inputAmount, setInputAmount] = useState('');
  const [swapping, setSwapping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [addTft, setAddTft] = useState('');
  const [removeLp, setRemoveLp] = useState('');

  const fetchBalances = useCallback(async () => {
    try {
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/swap/balances`);
      const result = await res.json();
      if (result.success) {
        setBalances(result.data);
      }
    } catch (error) {
      console.error('Fetch balances error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchBalances();
    }, [fetchBalances])
  );

  const fetchQuote = useCallback(async (amount: string) => {
    if (!amount || parseFloat(amount) <= 0) {
      setQuote(null);
      return;
    }
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：GET /api/v1/swap/quote
       * Query 参数：fromToken: string, toToken: string, amount: string
       */
      const res = await fetch(
        `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/swap/quote?fromToken=${fromToken}&toToken=${toToken}&amount=${amount}`
      );
      const result = await res.json();
      if (result.success) {
        setQuote(result.data);
      }
    } catch (error) {
      console.error('Fetch quote error:', error);
    }
  }, [fromToken, toToken]);

  const handleInputChange = (text: string) => {
    setInputAmount(text);
    fetchQuote(text);
  };

  const handleFlip = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setInputAmount('');
    setQuote(null);
  };

  const handleMax = () => {
    if (!balances) return;
    const max = fromToken === 'TFT' ? balances.tftBalance : balances.usdtBalance;
    setInputAmount(max.toFixed(4));
    fetchQuote(max.toFixed(4));
  };

  const handleSwap = async () => {
    if (!isConnected) {
      Alert.alert('需要钱包', '请先连接钱包');
      return;
    }
    if (!inputAmount || parseFloat(inputAmount) <= 0) {
      Alert.alert('金额无效', '请输入金额');
      return;
    }
    setSwapping(true);
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/swap/execute
       * Body 参数：fromToken: string, toToken: string, amount: string
       */
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/swap/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromToken, toToken, amount: inputAmount }),
      });
      const result = await res.json();
      if (result.success) {
        Alert.alert('成功', `已将 ${inputAmount} ${fromToken} 兑换为 ${toToken}`);
        setInputAmount('');
        setQuote(null);
        fetchBalances();
      }
    } catch (error) {
      console.error('Swap error:', error);
    } finally {
      setSwapping(false);
    }
  };

  const handleAddLiquidity = async () => {
    if (!isConnected || !addTft) return;
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/swap/add-liquidity
       * Body 参数：tftAmount: string, usdtAmount: string
       */
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/swap/add-liquidity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tftAmount: addTft, usdtAmount: (parseFloat(addTft) * 0.5).toString() }),
      });
      const result = await res.json();
      if (result.success) {
        Alert.alert('成功', `已添加流动性: ${result.data.lpReceived.toFixed(2)} LP`);
        setAddTft('');
        fetchBalances();
      }
    } catch (error) {
      console.error('Add liquidity error:', error);
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!isConnected || !removeLp) return;
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/swap/remove-liquidity
       * Body 参数：lpAmount: string
       */
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/swap/remove-liquidity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lpAmount: removeLp }),
      });
      const result = await res.json();
      if (result.success) {
        Alert.alert('成功', `已移除流动性: ${result.data.tftReturned.toFixed(2)} TFT + ${result.data.usdtReturned.toFixed(2)} USDT`);
        setRemoveLp('');
        fetchBalances();
      }
    } catch (error) {
      console.error('Remove liquidity error:', error);
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>兑换</Text>
          <Text style={styles.subtitle}>TFT / USDT 双向兑换</Text>
        </View>

        {/* Balances */}
        <View style={styles.balancesCard}>
          <View style={styles.balanceRow}>
            <View style={styles.balanceItem}>
              <Text style={styles.balanceLabel}>TFT</Text>
              <Text style={styles.balanceValue}>{balances?.tftBalance.toLocaleString() || '0'}</Text>
              <Text style={styles.balanceUsd}>≈ ${((balances?.tftBalance || 0) * (balances?.tftPrice || 0.5)).toFixed(2)}</Text>
            </View>
            <View style={styles.balanceDivider} />
            <View style={styles.balanceItem}>
              <Text style={styles.balanceLabel}>USDT</Text>
              <Text style={styles.balanceValue}>{balances?.usdtBalance.toLocaleString() || '0'}</Text>
            </View>
            <View style={styles.balanceDivider} />
            <View style={styles.balanceItem}>
              <Text style={styles.balanceLabel}>LP</Text>
              <Text style={styles.balanceValue}>{balances?.lpBalance.toLocaleString() || '0'}</Text>
              <Text style={styles.balanceUsd}>
                {balances ? `${((balances.lpBalance / balances.totalLP) * 100).toFixed(2)}%` : '0%'}
              </Text>
            </View>
          </View>
        </View>

        {/* Swap Panel */}
        <View style={styles.swapCard}>
          <View style={styles.swapHeader}>
            <Text style={styles.swapTitle}>
              {fromToken} → {toToken}
            </Text>
            <TouchableOpacity style={styles.flipBtn} onPress={handleFlip}>
              <FontAwesome6 name="arrows-rotate" size={14} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          {/* Input */}
          <View style={styles.swapInputContainer}>
            <Text style={styles.swapInputLabel}>卖出 {fromToken}</Text>
            <View style={styles.swapInputRow}>
              <TextInput
                style={styles.swapInput}
                value={inputAmount}
                onChangeText={handleInputChange}
                placeholder="0.00"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="decimal-pad"
              />
              <TouchableOpacity style={styles.maxBtn} onPress={handleMax}>
                <Text style={styles.maxBtnText}>最大</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Arrow */}
          <View style={styles.swapArrow}>
            <FontAwesome6 name="arrow-down" size={14} color={COLORS.textSecondary} />
          </View>

          {/* Output */}
          <View style={styles.swapOutputContainer}>
            <Text style={styles.swapInputLabel}>买入 {toToken}</Text>
            <Text style={styles.swapOutputValue}>
              {quote?.outputAmount?.toFixed(4) || '0.00'}
            </Text>
          </View>

          {/* Rate Info */}
          {quote && (
            <View style={styles.rateInfo}>
              <Text style={styles.rateText}>
                汇率: 1 {fromToken} = {quote.rate} {toToken}
              </Text>
              <Text style={styles.rateText}>滑点: {quote.slippage}%</Text>
            </View>
          )}

          <View style={styles.slippageNotice}>
            <FontAwesome6 name="bolt" size={10} color={COLORS.primary} />
            <Text style={styles.slippageText}>1%滑点自动分配给做市商</Text>
          </View>

          {/* Swap Button */}
          <TouchableOpacity
            style={[styles.swapBtn, (!isConnected || swapping) && styles.swapBtnDisabled]}
            onPress={handleSwap}
            disabled={!isConnected || swapping}
          >
            <LinearGradient
              colors={isConnected ? COLORS.GRADIENT_PRIMARY : ['#333', '#444']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.swapGradient}
            >
              {swapping ? (
                <ActivityIndicator color={COLORS.background} size="small" />
              ) : (
                <Text style={styles.swapBtnText}>
                  {!isConnected ? '请先连接钱包' : !inputAmount ? '输入兑换金额' : '确认兑换'}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Liquidity Management */}
        <View style={styles.liquiditySection}>
          <Text style={styles.sectionTitle}>流动性管理</Text>

          {/* Add Liquidity */}
          <View style={styles.liquidityCard}>
            <Text style={styles.liquidityTitle}>
              <FontAwesome6 name="circle-plus" size={14} color={COLORS.success} /> 添加流动性
            </Text>
            <View style={styles.liquidityInputs}>
              <View style={styles.liquidityInputRow}>
                <TextInput
                  style={styles.liquidityInput}
                  value={addTft}
                  onChangeText={setAddTft}
                  placeholder="TFT数量"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.liquiditySuffix}>TFT</Text>
              </View>
              <View style={styles.liquidityInputRow}>
                <TextInput
                  style={styles.liquidityInput}
                  value={addTft ? (parseFloat(addTft) * 0.5).toFixed(2) : ''}
                  editable={false}
                  placeholder="自动计算"
                  placeholderTextColor={COLORS.textSecondary}
                />
                <Text style={styles.liquiditySuffix}>USDT</Text>
              </View>
            </View>
            <Text style={styles.poolRatio}>
              池子比例: 1 TFT = {balances?.tftPrice?.toFixed(2) || '0.50'} USDT
            </Text>
            <TouchableOpacity
              style={[styles.liquidityBtn, !isConnected && styles.liquidityBtnDisabled]}
              onPress={handleAddLiquidity}
              disabled={!isConnected}
            >
              <Text style={[styles.liquidityBtnText, { color: COLORS.success }]}>
                {!isConnected ? '请先连接钱包' : '添加流动性'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Remove Liquidity */}
          <View style={styles.liquidityCard}>
            <Text style={styles.liquidityTitle}>
              <FontAwesome6 name="arrow-up-from-bracket" size={14} color={COLORS.danger} /> 移除流动性
            </Text>
            <View style={styles.liquidityInputRow}>
              <TextInput
                style={styles.liquidityInput}
                value={removeLp}
                onChangeText={setRemoveLp}
                placeholder="LP数量"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="decimal-pad"
              />
              <TouchableOpacity onPress={() => setRemoveLp(balances?.lpBalance.toString() || '0')}>
                <Text style={styles.maxLpText}>最大</Text>
              </TouchableOpacity>
            </View>
            {removeLp && (
              <Text style={styles.removeEstimate}>
                预计赎回: {(parseFloat(removeLp) * 0.5).toFixed(2)} TFT + {(parseFloat(removeLp) * 0.25).toFixed(2)} USDT
              </Text>
            )}
            <TouchableOpacity
              style={[styles.liquidityBtn, (!isConnected || !removeLp) && styles.liquidityBtnDisabled]}
              onPress={handleRemoveLiquidity}
              disabled={!isConnected || !removeLp}
            >
              <Text style={[styles.liquidityBtnText, { color: COLORS.danger }]}>
                {!isConnected ? '请先连接钱包' : '移除流动性'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 56, paddingBottom: 100, paddingHorizontal: 16 },
  header: { marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
  subtitle: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  // Balances
  balancesCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  balanceRow: { flexDirection: 'row', alignItems: 'center' },
  balanceItem: { flex: 1, alignItems: 'center' },
  balanceLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 4, fontWeight: '600' },
  balanceValue: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, fontFamily: 'monospace' },
  balanceUsd: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  balanceDivider: { width: 1, height: 36, backgroundColor: COLORS.border },
  // Swap Card
  swapCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  swapHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  swapTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  tokenIcon: { fontSize: 14 },
  flipBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(245,166,35,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  swapInputContainer: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  swapInputLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 8, fontWeight: '500' },
  swapInputRow: { flexDirection: 'row', alignItems: 'center' },
  swapInput: { flex: 1, fontSize: 22, fontWeight: '700', color: COLORS.textPrimary, fontFamily: 'monospace' },
  maxBtn: {
    backgroundColor: 'rgba(245,166,35,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  maxBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  swapArrow: { alignItems: 'center', paddingVertical: 8 },
  swapOutputContainer: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  swapOutputValue: { fontSize: 22, fontWeight: '700', color: COLORS.success, fontFamily: 'monospace' },
  rateInfo: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  rateText: { fontSize: 12, color: COLORS.textSecondary },
  slippageNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
  },
  slippageText: { fontSize: 11, color: COLORS.textSecondary, flex: 1 },
  swapBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 16 },
  swapBtnDisabled: { opacity: 0.6 },
  swapGradient: { paddingVertical: 16, alignItems: 'center', borderRadius: 12 },
  swapBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.background, letterSpacing: 1, textTransform: 'uppercase' },
  // Liquidity
  liquiditySection: { marginBottom: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 12 },
  liquidityCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  liquidityTitle: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 12 },
  liquidityInputs: { gap: 8, marginBottom: 8 },
  liquidityInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  liquidityInput: { flex: 1, padding: 12, fontSize: 15, fontWeight: '600', color: COLORS.textPrimary, fontFamily: 'monospace' },
  liquiditySuffix: { paddingRight: 12, fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  maxLpText: { fontSize: 11, fontWeight: '700', color: COLORS.primary, paddingRight: 12 },
  poolRatio: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 12 },
  removeEstimate: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 12 },
  liquidityBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  liquidityBtnDisabled: { opacity: 0.5 },
  liquidityBtnText: { fontSize: 13, fontWeight: '700' },
});
