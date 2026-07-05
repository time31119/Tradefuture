import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getChainInfo } from '@/utils/wagmiConfig';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';

interface WalletData {
  address: string;
  shortAddress: string;
  chainId: number;
  chainName: string;
  tftBalance: string;
  usdtBalance: string;
  nativeBalance: string;
}

interface WalletContextType {
  wallet: WalletData | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => void;
  disconnect: () => void;
  refreshBalances: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Helper function to shorten address
const shortenAddress = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // 连接后端
  const connectToBackend = useCallback(async (walletAddress: string) => {
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/users/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          await AsyncStorage.setItem('auth_token', data.token);
        }
      }
    } catch (error) {
      console.error('Failed to connect to backend:', error);
    }
  }, []);

  // 连接钱包 - 临时使用模拟地址
  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    try {
      // 使用用户提供的真实 BNB Chain 钱包地址
      const walletAddress = '0x26301C7918aeD704c1A420934AA82aEC42DCEE81';
      const chainId = 56; // BSC
      const chainInfo = getChainInfo(chainId);
      
      const walletData: WalletData = {
        address: walletAddress,
        shortAddress: shortenAddress(walletAddress),
        chainId,
        chainName: chainInfo?.name || 'Unknown',
        tftBalance: '0.00',
        usdtBalance: '0.00',
        nativeBalance: '0.00',
      };
      
      setWallet(walletData);
      await connectToBackend(walletAddress);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    } finally {
      setIsConnecting(false);
    }
  }, [connectToBackend]);

  // 断开连接
  const handleDisconnect = useCallback(async () => {
    setWallet(null);
    await AsyncStorage.removeItem('auth_token');
  }, []);

  // 刷新余额
  const refreshBalances = useCallback(async () => {
    // 临时返回模拟余额
    if (wallet) {
      setWallet({
        ...wallet,
        tftBalance: '0.00',
        usdtBalance: '0.00',
        nativeBalance: '0.00',
      });
    }
  }, [wallet]);

  return (
    <WalletContext.Provider
      value={{
        wallet,
        isConnected: !!wallet,
        isConnecting,
        connect: handleConnect,
        disconnect: handleDisconnect,
        refreshBalances,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
