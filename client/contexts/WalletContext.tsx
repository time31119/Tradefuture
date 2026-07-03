import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

const WALLET_STORAGE_KEY = '@tradefuture_wallet';

interface WalletData {
  address: string;
  shortAddress: string;
  chainId: number;
  chainName: string;
  tftBalance: number;
  usdtBalance: number;
  bnbBalance: number;
}

interface WalletContextType {
  isConnected: boolean;
  wallet: WalletData | null;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType>({
  isConnected: false,
  wallet: null,
  isConnecting: false,
  connect: async () => {
    // Default implementation - overridden by WalletProvider
  },
  disconnect: async () => {
    // Default implementation - overridden by WalletProvider
  },
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const connect = useCallback(async () => {
    if (isConnecting) return;
    
    setIsConnecting(true);
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/wallet/connect
       */
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/wallet/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await response.json();
      if (result.success) {
        setWallet(result.data);
        // Persist wallet data
        await AsyncStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(result.data));
      }
    } catch (error) {
      console.error('Wallet connect error:', error);
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting]);

  const disconnect = useCallback(async () => {
    setWallet(null);
    // Remove persisted wallet data
    await AsyncStorage.removeItem(WALLET_STORAGE_KEY);
  }, []);

  // Load persisted wallet on mount
  useEffect(() => {
    const loadWallet = async () => {
      try {
        const storedWallet = await AsyncStorage.getItem(WALLET_STORAGE_KEY);
        if (storedWallet) {
          setWallet(JSON.parse(storedWallet));
        }
      } catch (error) {
        console.error('Load wallet error:', error);
      } finally {
        setIsInitialized(true);
      }
    };
    loadWallet();
  }, []);

  // Auto-connect if no persisted wallet (first time user)
  useEffect(() => {
    if (isInitialized && !wallet) {
      connect();
    }
  }, [isInitialized, wallet, connect]);

  return (
    <WalletContext.Provider
      value={{
        isConnected: wallet !== null,
        wallet,
        isConnecting,
        connect,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
