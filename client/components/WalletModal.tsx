import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Platform, Linking } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { useWallet } from '@/contexts/WalletContext';
import { hasMetaMask } from '@/utils/web3Config';

export function WalletModal() {
  const { showWalletModal, setShowWalletModal, connectWithMetaMask, connectWithWalletConnect, isConnecting } = useWallet();

  // 处理 MetaMask 连接
  const handleMetaMaskConnect = async () => {
    if (Platform.OS === 'web') {
      // Web 端检查 MetaMask
      if (!hasMetaMask()) {
        // 打开 MetaMask 下载页面
        Linking.openURL('https://metamask.io/download/');
        return;
      }
    }
    await connectWithMetaMask();
  };

  // 处理 WalletConnect 连接
  const handleWalletConnect = async () => {
    await connectWithWalletConnect();
  };

  // 处理 TP Wallet 连接（通过 WalletConnect）
  const handleTPWallet = async () => {
    await connectWithWalletConnect();
  };

  // 处理 OKX Wallet 连接
  const handleOKXWallet = async () => {
    if (Platform.OS === 'web') {
      // 检查 OKX Wallet
      const ethereum = typeof window !== 'undefined' ? (window as any).okxwallet : undefined;
      if (ethereum) {
        // OKX Wallet 也支持 window.ethereum
        await connectWithMetaMask();
        return;
      }
      // 打开 OKX Wallet 下载页面
      Linking.openURL('https://www.okx.com/web3');
    }
  };

  if (!showWalletModal) return null;

  return (
    <Modal
      visible={showWalletModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowWalletModal(false)}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={() => setShowWalletModal(false)}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>连接钱包</Text>
            <TouchableOpacity onPress={() => setShowWalletModal(false)}>
              <FontAwesome6 name="xmark" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* Wallet List */}
          <View style={styles.walletList}>
            {/* MetaMask */}
            <TouchableOpacity
              style={styles.walletItem}
              onPress={handleMetaMaskConnect}
              disabled={isConnecting}
            >
              <View style={[styles.walletIcon, { backgroundColor: '#FF8C00' }]}>
                <FontAwesome6 name="ethereum" size={24} color="#FFFFFF" />
              </View>
              <View style={styles.walletInfo}>
                <Text style={styles.walletName}>MetaMask</Text>
                <Text style={styles.walletDesc}>浏览器扩展钱包</Text>
              </View>
              {hasMetaMask() && (
                <View style={styles.installedBadge}>
                  <Text style={styles.installedText}>已安装</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* WalletConnect */}
            <TouchableOpacity
              style={styles.walletItem}
              onPress={handleWalletConnect}
              disabled={isConnecting}
            >
              <View style={[styles.walletIcon, { backgroundColor: '#3B99FC' }]}>
                <FontAwesome6 name="wallet" size={24} color="#FFFFFF" />
              </View>
              <View style={styles.walletInfo}>
                <Text style={styles.walletName}>WalletConnect</Text>
                <Text style={styles.walletDesc}>扫码连接移动钱包</Text>
              </View>
            </TouchableOpacity>

            {/* TP Wallet */}
            <TouchableOpacity
              style={styles.walletItem}
              onPress={handleTPWallet}
              disabled={isConnecting}
            >
              <View style={[styles.walletIcon, { backgroundColor: '#2980FE' }]}>
                <Text style={styles.walletIconText}>TP</Text>
              </View>
              <View style={styles.walletInfo}>
                <Text style={styles.walletName}>TokenPocket</Text>
                <Text style={styles.walletDesc}>多链移动钱包</Text>
              </View>
            </TouchableOpacity>

            {/* OKX Wallet */}
            <TouchableOpacity
              style={styles.walletItem}
              onPress={handleOKXWallet}
              disabled={isConnecting}
            >
              <View style={[styles.walletIcon, { backgroundColor: '#000000' }]}>
                <Text style={styles.walletIconText}>OKX</Text>
              </View>
              <View style={styles.walletInfo}>
                <Text style={styles.walletName}>OKX Wallet</Text>
                <Text style={styles.walletDesc}>Web3 钱包</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              连接即表示您同意我们的
            </Text>
            <Text style={styles.footerLink}>服务条款和隐私政策</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#1F2937',
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  walletList: {
    padding: 16,
    gap: 12,
  },
  walletItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#374151',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  walletIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  walletIconText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  walletInfo: {
    flex: 1,
    marginLeft: 12,
  },
  walletName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  walletDesc: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  installedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#10B981',
    borderRadius: 6,
  },
  installedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#374151',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  footerLink: {
    fontSize: 12,
    color: '#3B82F6',
    marginTop: 4,
  },
});
