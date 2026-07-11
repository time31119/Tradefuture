/**
 * Web3 配置 - BSC (BNB Smart Chain)
 * 支持 MetaMask 和 WalletConnect
 */

import { EthereumProvider } from '@walletconnect/ethereum-provider';

// WalletConnect 项目 ID（需要在 https://cloud.walletconnect.com 注册获取）
export const WALLETCONNECT_PROJECT_ID = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';

// BSC 链配置
export const BSC_CONFIG = {
  // 主网
  mainnet: {
    chainId: 56,
    chainIdHex: '0x38',
    name: 'BNB Smart Chain',
    symbol: 'BNB',
    rpcUrl: 'https://bsc-dataseed.binance.org/',
    explorerUrl: 'https://bscscan.com',
  },
  // 测试网
  testnet: {
    chainId: 97,
    chainIdHex: '0x61',
    name: 'BSC Testnet',
    symbol: 'tBNB',
    rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545/',
    explorerUrl: 'https://testnet.bscscan.com',
  },
};

// 当前使用的网络（生产环境用 mainnet，开发用 testnet）
export const CURRENT_NETWORK = BSC_CONFIG.mainnet;

// 合约地址（BSC 主网已部署）
export const CONTRACT_ADDRESSES = {
  TFT_TOKEN: '0xC631ecA8b877E367672Ae8B612A96f3d1bBf8FB5',
  PREDICTION_MARKET: '0x100Bf4fb47fFE5519cB55016C8bfB69938a696b5',
  INSURANCE_POOL: '0x6128C496C801D0eca58721939794dbC4bBf618FE',
  NODE_PARTNER: '0x68c3f0Ba6f12b91Fd562A019dbcc2ea2f1d64367',
  MARKET_MAKER: '0xA26c1436CF47DD8A5289A73eF76F0e73CBDF3921',
  VIP_SYSTEM: '0x4Ff986B770F88bb7DCAFa2EAdaD844471fEBf1AE',
  TEAM_VESTING: '0x4F531B62579d8911D901368B122Dbc95bD42e616',
  AUTO_BURN: '0xa8f01eA67afaB483Ed870bA291b0109dFA481e2e',
  PHASE_CONTROL: '0xFb062aF73E6e382DE50FD7b0aD1a4699003628B1',
  USDT: '0x55d398326f99059fF775485246999027B3197955',
};

// 支持的链
export const supportedChains = [
  {
    id: BSC_CONFIG.mainnet.chainId,
    name: BSC_CONFIG.mainnet.name,
    symbol: BSC_CONFIG.mainnet.symbol,
    explorer: BSC_CONFIG.mainnet.explorerUrl,
    rpcUrl: BSC_CONFIG.mainnet.rpcUrl,
  },
  {
    id: BSC_CONFIG.testnet.chainId,
    name: BSC_CONFIG.testnet.name,
    symbol: BSC_CONFIG.testnet.symbol,
    explorer: BSC_CONFIG.testnet.explorerUrl,
    rpcUrl: BSC_CONFIG.testnet.rpcUrl,
  },
];

// 获取链信息
export const getChainInfo = (chainId: number) => {
  return supportedChains.find(chain => chain.id === chainId);
};

// 检查是否在浏览器环境
export const isBrowser = () => typeof window !== 'undefined';

// 检查是否安装了 MetaMask
export const hasMetaMask = (): boolean => {
  if (!isBrowser()) return false;
  return typeof window.ethereum !== 'undefined';
};

// 获取 Ethereum provider
export const getEthereum = () => {
  if (!isBrowser()) return null;
  return window.ethereum || null;
};

// 声明 window.ethereum 类型
declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
      disconnect?: () => void;
    };
  }
}

// WalletConnect 配置
export const WALLETCONNECT_CONFIG = {
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [BSC_CONFIG.mainnet.chainId],
  optionalChains: [BSC_CONFIG.testnet.chainId],
  showQrModal: true,
  metadata: {
    name: 'TradeFuture',
    description: 'TradeFuture - Prediction Market DApp',
    url: 'http://52.0.34.78',
    icons: ['https://52.0.34.78/favicon.ico'],
  },
};

// 创建 WalletConnect Provider
export const createWalletConnectProvider = async () => {
  if (!isBrowser()) return null;
  
  try {
    const provider = await EthereumProvider.init({
      projectId: WALLETCONNECT_CONFIG.projectId,
      chains: WALLETCONNECT_CONFIG.chains,
      showQrModal: WALLETCONNECT_CONFIG.showQrModal,
      metadata: WALLETCONNECT_CONFIG.metadata,
    } as any);
    return provider;
  } catch (error) {
    console.error('Failed to create WalletConnect provider:', error);
    return null;
  }
};
