import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAccount, useConnect, useDisconnect, useChainId, useBalance } from 'wagmi';
import { formatUnits } from 'viem';
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
  const { address, isConnected: wagmiConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const currentChainId = useChainId();
  
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // 获取余额
  const { data: nativeBalance } = useBalance({
    address: address as `0x${string}`,
  });

  // 连接后端
  const connectToBackend = useCallback(async (walletAddress: string) => {
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/wallet/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setWallet(prev => prev ? {
          ...prev,
          tftBalance: data.data?.tftBalance || '0',
          usdtBalance: data.data?.usdtBalance || '0',
        } : null);
      }
    } catch (error) {
      console.error('Failed to connect to backend:', error);
    }
  }, []);

  // 当wagmi连接状态变化时更新wallet
  useEffect(() => {
    if (wagmiConnected && address) {
      const chainInfo = getChainInfo(chainId || 1);
      const formattedNativeBalance = nativeBalance 
        ? formatUnits(nativeBalance.value, nativeBalance.decimals)
        : '0';
      
      setWallet({
        address,
        shortAddress: shortenAddress(address),
        chainId: chainId || 1,
        chainName: chainInfo?.name || 'Unknown',
        tftBalance: '0',
        usdtBalance: '0',
        nativeBalance: formattedNativeBalance,
      });
      
      // 连接后端
      connectToBackend(address);
    } else {
      setWallet(null);
    }
  }, [wagmiConnected, address, chainId, nativeBalance, connectToBackend]);

  // 刷新余额
  const refreshBalances = useCallback(async () => {
    if (!address) return;
    
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/wallet/balances?address=${address}`);
      if (response.ok) {
        const data = await response.json();
        setWallet(prev => prev ? {
          ...prev,
          tftBalance: data.data?.tftBalance || prev.tftBalance,
          usdtBalance: data.data?.usdtBalance || prev.usdtBalance,
        } : null);
      }
    } catch (error) {
      console.error('Failed to refresh balances:', error);
    }
  }, [address]);

  // 连接钱包
  const handleConnect = useCallback(() => {
    const injectedConnector = connectors.find(c => c.id === 'injected');
    if (injectedConnector) {
      setIsConnecting(true);
      connect({ connector: injectedConnector });
    }
  }, [connectors, connect]);

  // 断开连接
  const handleDisconnect = useCallback(() => {
    wagmiDisconnect();
    setWallet(null);
  }, [wagmiDisconnect]);

  return (
    <WalletContext.Provider
      value={{
        wallet,
        isConnected: wagmiConnected,
        isConnecting: isConnecting || isPending,
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
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
}
