import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

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
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType>({
  isConnected: false,
  wallet: null,
  isConnecting: false,
  connect: async () => {
    // Default implementation - overridden by WalletProvider
  },
  disconnect: () => {
    // Default implementation - overridden by WalletProvider
  },
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const connect = useCallback(async () => {
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
      }
    } catch (error) {
      console.error('Wallet connect error:', error);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet(null);
  }, []);

  // Auto-connect on mount (simulate returning user)
  useEffect(() => {
    connect();
  }, [connect]);

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
