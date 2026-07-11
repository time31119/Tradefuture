import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ethers } from 'ethers';
import { CURRENT_NETWORK, getChainInfo, hasMetaMask, getEthereum, isBrowser } from '@/utils/web3Config';

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
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalances: () => Promise<void>;
  switchToBSC: () => Promise<void>;
  getProvider: () => ethers.BrowserProvider | null;
  getSigner: () => Promise<ethers.JsonRpcSigner | null>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Helper function to shorten address
const shortenAddress = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Format balance
const formatBalance = (balance: ethers.BigNumberish, decimals: number = 18): string => {
  try {
    return parseFloat(ethers.formatUnits(balance, decimals)).toFixed(4);
  } catch {
    return '0.0000';
  }
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      console.error('Failed to connect to backend:', err);
    }
  }, []);

  // 获取余额
  const fetchBalances = useCallback(async (address: string, provider: ethers.BrowserProvider) => {
    try {
      // 获取 BNB 余额
      const nativeBalance = await provider.getBalance(address);
      
      // 获取 TFT 和 USDT 余额（需要合约地址后更新）
      // const tftContract = new ethers.Contract(TFT_TOKEN, TFT_ABI, provider);
      // const tftBalance = await tftContract.balanceOf(address);
      
      return {
        nativeBalance: formatBalance(nativeBalance),
        tftBalance: '0.0000', // 待合约部署后更新
        usdtBalance: '0.0000', // 待合约部署后更新
      };
    } catch (err) {
      console.error('Failed to fetch balances:', err);
      return {
        nativeBalance: '0.0000',
        tftBalance: '0.0000',
        usdtBalance: '0.0000',
      };
    }
  }, []);

  // 连接钱包
  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    
    try {
      // 检查是否在浏览器环境
      if (!isBrowser()) {
        throw new Error('钱包连接仅在 Web 端可用');
      }
      
      // 检查是否安装了 MetaMask
      if (!hasMetaMask()) {
        throw new Error('请安装 MetaMask 钱包');
      }
      
      const ethereum = getEthereum();
      if (!ethereum) {
        throw new Error('无法找到钱包提供者');
      }
      
      // 请求连接账户
      const accounts = await ethereum.request({ 
        method: 'eth_requestAccounts' 
      }) as string[];
      
      if (!accounts || accounts.length === 0) {
        throw new Error('用户拒绝连接');
      }
      
      const address = accounts[0];
      
      // 获取链 ID
      const chainIdHex = await ethereum.request({ method: 'eth_chainId' }) as string;
      const chainId = parseInt(chainIdHex, 16);
      
      // 检查是否在 BSC 链上
      if (chainId !== CURRENT_NETWORK.chainId) {
        // 尝试切换到 BSC
        try {
          await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: CURRENT_NETWORK.chainIdHex }],
          });
        } catch (switchError: unknown) {
          // 如果链不存在，添加链
          const err = switchError as { code?: number };
          if (err.code === 4902) {
            await ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: CURRENT_NETWORK.chainIdHex,
                chainName: CURRENT_NETWORK.name,
                nativeCurrency: {
                  name: CURRENT_NETWORK.symbol,
                  symbol: CURRENT_NETWORK.symbol,
                  decimals: 18,
                },
                rpcUrls: [CURRENT_NETWORK.rpcUrl],
                blockExplorerUrls: [CURRENT_NETWORK.explorerUrl],
              }],
            });
          } else {
            throw new Error('请切换到 BSC 网络');
          }
        }
      }
      
      // 创建 provider
      const provider = new ethers.BrowserProvider(ethereum);
      
      // 获取余额
      const balances = await fetchBalances(address, provider);
      
      const chainInfo = getChainInfo(CURRENT_NETWORK.chainId);
      
      const walletData: WalletData = {
        address,
        shortAddress: shortenAddress(address),
        chainId: CURRENT_NETWORK.chainId,
        chainName: chainInfo?.name || 'BSC',
        ...balances,
      };
      
      setWallet(walletData);
      await AsyncStorage.setItem('wallet_address', address);
      await connectToBackend(address);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '连接失败';
      setError(errorMessage);
      console.error('Failed to connect wallet:', err);
    } finally {
      setIsConnecting(false);
    }
  }, [connectToBackend, fetchBalances]);

  // 断开连接
  const handleDisconnect = useCallback(async () => {
    setWallet(null);
    setError(null);
    await AsyncStorage.removeItem('auth_token');
    await AsyncStorage.removeItem('wallet_address');
  }, []);

  // 刷新余额
  const refreshBalances = useCallback(async () => {
    if (!wallet || !isBrowser() || !hasMetaMask()) return;
    
    try {
      const ethereum = getEthereum();
      if (!ethereum) return;
      
      const provider = new ethers.BrowserProvider(ethereum);
      const balances = await fetchBalances(wallet.address, provider);
      
      setWallet(prev => prev ? { ...prev, ...balances } : null);
    } catch (err) {
      console.error('Failed to refresh balances:', err);
    }
  }, [wallet, fetchBalances]);

  // 切换到 BSC
  const switchToBSC = useCallback(async () => {
    if (!isBrowser() || !hasMetaMask()) return;
    
    try {
      const ethereum = getEthereum();
      if (!ethereum) return;
      
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CURRENT_NETWORK.chainIdHex }],
      });
    } catch (err) {
      console.error('Failed to switch chain:', err);
    }
  }, []);

  // 获取 Provider
  const getProvider = useCallback(() => {
    if (!isBrowser() || !hasMetaMask()) return null;
    const ethereum = getEthereum();
    if (!ethereum) return null;
    return new ethers.BrowserProvider(ethereum);
  }, []);

  // 获取 Signer
  const getSigner = useCallback(async () => {
    const provider = getProvider();
    if (!provider) return null;
    try {
      return await provider.getSigner();
    } catch {
      return null;
    }
  }, [getProvider]);

  // 监听账户变化
  useEffect(() => {
    if (!isBrowser() || !hasMetaMask()) return;
    
    const ethereum = getEthereum();
    if (!ethereum) return;
    
    const handleAccountsChanged = (accounts: unknown) => {
      const accs = accounts as string[];
      if (accs.length === 0) {
        handleDisconnect();
      } else if (accs[0] !== wallet?.address) {
        // 账户变化，重新连接
        handleConnect();
      }
    };
    
    const handleChainChanged = () => {
      // 链变化，刷新页面
      window.location.reload();
    };
    
    ethereum.on('accountsChanged', handleAccountsChanged);
    ethereum.on('chainChanged', handleChainChanged);
    
    return () => {
      if (ethereum.removeListener) {
        ethereum.removeListener('accountsChanged', handleAccountsChanged);
        ethereum.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, [wallet?.address, handleConnect, handleDisconnect]);

  // 检查是否已连接（自动连接）
  useEffect(() => {
    const checkConnection = async () => {
      if (!isBrowser() || !hasMetaMask()) return;
      
      const savedAddress = await AsyncStorage.getItem('wallet_address');
      if (savedAddress) {
        const ethereum = getEthereum();
        if (!ethereum) return;
        
        try {
          const accounts = await ethereum.request({ method: 'eth_accounts' }) as string[];
          if (accounts.length > 0 && accounts[0].toLowerCase() === savedAddress.toLowerCase()) {
            // 自动连接
            await handleConnect();
          }
        } catch {
          // 忽略错误
        }
      }
    };
    
    checkConnection();
  }, [handleConnect]);

  const value: WalletContextType = {
    wallet,
    isConnected: !!wallet,
    isConnecting,
    error,
    connect: handleConnect,
    disconnect: handleDisconnect,
    refreshBalances,
    switchToBSC,
    getProvider,
    getSigner,
  };

  return (
    <WalletContext.Provider value={value}>
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
