import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ethers } from 'ethers';
import { 
  CURRENT_NETWORK, 
  getChainInfo, 
  hasMetaMask, 
  getEthereum, 
  isBrowser,
  createWalletConnectProvider 
} from '@/utils/web3Config';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';

// 钱包类型
export type WalletType = 'metamask' | 'walletconnect' | null;

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
  walletType: WalletType;
  showWalletModal: boolean;
  connect: () => void;
  connectWithMetaMask: () => Promise<void>;
  connectWithWalletConnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalances: () => Promise<void>;
  switchToBSC: () => Promise<void>;
  getProvider: () => ethers.BrowserProvider | null;
  getSigner: () => Promise<ethers.JsonRpcSigner | null>;
  setShowWalletModal: (show: boolean) => void;
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
  const [walletType, setWalletType] = useState<WalletType>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const wcProviderRef = useRef<ReturnType<typeof createWalletConnectProvider> extends Promise<infer T> ? T : null>(null);

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
      const nativeBalance = await provider.getBalance(address);
      
      return {
        nativeBalance: formatBalance(nativeBalance),
        tftBalance: '0.0000',
        usdtBalance: '0.0000',
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

  // 创建钱包数据
  const createWalletData = useCallback(async (address: string, provider: ethers.BrowserProvider, type: WalletType) => {
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
    setWalletType(type);
    await AsyncStorage.setItem('wallet_address', address);
    await AsyncStorage.setItem('wallet_type', type || 'metamask');
    await connectToBackend(address);
  }, [fetchBalances, connectToBackend]);

  // 连接 MetaMask
  const connectWithMetaMask = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    setShowWalletModal(false);
    
    try {
      if (!isBrowser()) {
        throw new Error('钱包连接仅在 Web 端可用');
      }
      
      if (!hasMetaMask()) {
        throw new Error('请安装 MetaMask 钱包');
      }
      
      const ethereum = getEthereum();
      if (!ethereum) {
        throw new Error('无法找到钱包提供者');
      }
      
      const accounts = await ethereum.request({ 
        method: 'eth_requestAccounts' 
      }) as string[];
      
      if (!accounts || accounts.length === 0) {
        throw new Error('用户拒绝连接');
      }
      
      const address = accounts[0];
      
      // 检查链 ID
      const chainIdHex = await ethereum.request({ method: 'eth_chainId' }) as string;
      const chainId = parseInt(chainIdHex, 16);
      
      if (chainId !== CURRENT_NETWORK.chainId) {
        try {
          await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: CURRENT_NETWORK.chainIdHex }],
          });
        } catch (switchError: unknown) {
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
      
      const provider = new ethers.BrowserProvider(ethereum);
      await createWalletData(address, provider, 'metamask');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '连接失败';
      setError(errorMessage);
      console.error('Failed to connect MetaMask:', err);
    } finally {
      setIsConnecting(false);
    }
  }, [createWalletData]);

  // 连接 WalletConnect
  const connectWithWalletConnect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    setShowWalletModal(false);
    
    try {
      if (!isBrowser()) {
        throw new Error('钱包连接仅在 Web 端可用');
      }
      
      const provider = await createWalletConnectProvider();
      if (!provider) {
        throw new Error('无法创建 WalletConnect 提供者');
      }
      
      wcProviderRef.current = provider;
      
      // 连接钱包
      await provider.connect();
      
      // 等待连接完成，获取账户
      const accounts = provider.accounts as string[];
      
      if (!accounts || accounts.length === 0) {
        throw new Error('用户拒绝连接');
      }
      
      const address = accounts[0];
      
      // 创建 ethers provider
      const ethersProvider = new ethers.BrowserProvider(provider as unknown as ethers.Eip1193Provider);
      await createWalletData(address, ethersProvider, 'walletconnect');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '连接失败';
      setError(errorMessage);
      console.error('Failed to connect WalletConnect:', err);
    } finally {
      setIsConnecting(false);
    }
  }, [createWalletData]);

  // 显示钱包选择弹窗
  const connect = useCallback(() => {
    setShowWalletModal(true);
  }, []);

  // 断开连接
  const disconnect = useCallback(async () => {
    // 断开 WalletConnect
    if (walletType === 'walletconnect' && wcProviderRef.current) {
      try {
        await wcProviderRef.current.disconnect();
      } catch (err) {
        console.error('Failed to disconnect WalletConnect:', err);
      }
      wcProviderRef.current = null;
    }
    
    // 断开 MetaMask
    if (walletType === 'metamask' && isBrowser()) {
      const ethereum = getEthereum();
      if (ethereum?.disconnect) {
        ethereum.disconnect();
      }
    }
    
    setWallet(null);
    setWalletType(null);
    setError(null);
    await AsyncStorage.removeItem('auth_token');
    await AsyncStorage.removeItem('wallet_address');
    await AsyncStorage.removeItem('wallet_type');
  }, [walletType]);

  // 刷新余额
  const refreshBalances = useCallback(async () => {
    if (!wallet) return;
    
    try {
      let provider: ethers.BrowserProvider | null = null;
      
      if (walletType === 'metamask' && isBrowser() && hasMetaMask()) {
        const ethereum = getEthereum();
        if (ethereum) {
          provider = new ethers.BrowserProvider(ethereum);
        }
      } else if (walletType === 'walletconnect' && wcProviderRef.current) {
        provider = new ethers.BrowserProvider(wcProviderRef.current as unknown as ethers.Eip1193Provider);
      }
      
      if (provider) {
        const balances = await fetchBalances(wallet.address, provider);
        setWallet(prev => prev ? { ...prev, ...balances } : null);
      }
    } catch (err) {
      console.error('Failed to refresh balances:', err);
    }
  }, [wallet, walletType, fetchBalances]);

  // 切换到 BSC
  const switchToBSC = useCallback(async () => {
    if (walletType === 'metamask' && isBrowser() && hasMetaMask()) {
      const ethereum = getEthereum();
      if (ethereum) {
        try {
          await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: CURRENT_NETWORK.chainIdHex }],
          });
        } catch (err) {
          console.error('Failed to switch chain:', err);
        }
      }
    }
  }, [walletType]);

  // 获取 Provider
  const getProvider = useCallback(() => {
    if (walletType === 'metamask' && isBrowser() && hasMetaMask()) {
      const ethereum = getEthereum();
      if (ethereum) {
        return new ethers.BrowserProvider(ethereum);
      }
    } else if (walletType === 'walletconnect' && wcProviderRef.current) {
      return new ethers.BrowserProvider(wcProviderRef.current as unknown as ethers.Eip1193Provider);
    }
    return null;
  }, [walletType]);

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

  // 监听 MetaMask 账户变化
  useEffect(() => {
    if (walletType !== 'metamask' || !isBrowser() || !hasMetaMask()) return;
    
    const ethereum = getEthereum();
    if (!ethereum) return;
    
    const handleAccountsChanged = (accounts: unknown) => {
      const accs = accounts as string[];
      if (accs.length === 0) {
        disconnect();
      } else if (accs[0] !== wallet?.address) {
        connectWithMetaMask();
      }
    };
    
    const handleChainChanged = () => {
      if (isBrowser()) {
        window.location.reload();
      }
    };
    
    ethereum.on('accountsChanged', handleAccountsChanged);
    ethereum.on('chainChanged', handleChainChanged);
    
    return () => {
      if (ethereum.removeListener) {
        ethereum.removeListener('accountsChanged', handleAccountsChanged);
        ethereum.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, [walletType, wallet?.address, connectWithMetaMask, disconnect]);

  // 监听 WalletConnect 事件
  useEffect(() => {
    const provider = wcProviderRef.current;
    if (!provider || walletType !== 'walletconnect') return;
    
    const handleDisconnect = () => {
      disconnect();
    };
    
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      }
    };
    
    provider.on('disconnect', handleDisconnect);
    provider.on('accountsChanged', handleAccountsChanged);
    
    return () => {
      provider.removeListener('disconnect', handleDisconnect);
      provider.removeListener('accountsChanged', handleAccountsChanged);
    };
  }, [walletType, disconnect]);

  // 自动连接（检查已保存的钱包）
  useEffect(() => {
    const checkConnection = async () => {
      const savedAddress = await AsyncStorage.getItem('wallet_address');
      const savedType = await AsyncStorage.getItem('wallet_type') as WalletType;
      
      if (!savedAddress) return;
      
      if (savedType === 'metamask' && isBrowser() && hasMetaMask()) {
        const ethereum = getEthereum();
        if (ethereum) {
          try {
            const accounts = await ethereum.request({ method: 'eth_accounts' }) as string[];
            if (accounts.length > 0 && accounts[0].toLowerCase() === savedAddress.toLowerCase()) {
              await connectWithMetaMask();
            }
          } catch {
            // 忽略错误
          }
        }
      } else if (savedType === 'walletconnect' && wcProviderRef.current) {
        // WalletConnect 需要重新连接
        try {
          await wcProviderRef.current.connect();
          const accounts = wcProviderRef.current.accounts as string[];
          if (accounts.length > 0 && accounts[0].toLowerCase() === savedAddress.toLowerCase()) {
            const provider = new ethers.BrowserProvider(wcProviderRef.current as unknown as ethers.Eip1193Provider);
            await createWalletData(accounts[0], provider, 'walletconnect');
          }
        } catch {
          // 忽略错误
        }
      }
    };
    
    checkConnection();
  }, [connectWithMetaMask, createWalletData]);

  const value: WalletContextType = {
    wallet,
    isConnected: !!wallet,
    isConnecting,
    error,
    walletType,
    showWalletModal,
    connect,
    connectWithMetaMask,
    connectWithWalletConnect,
    disconnect,
    refreshBalances,
    switchToBSC,
    getProvider,
    getSigner,
    setShowWalletModal,
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
