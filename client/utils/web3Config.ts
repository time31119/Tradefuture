/**
 * Web3 配置 - BSC (BNB Smart Chain)
 */

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

// 合约地址（部署后更新）
export const CONTRACT_ADDRESSES = {
  TFT_TOKEN: '0x0000000000000000000000000000000000000000', // 待部署
  PREDICTION_MARKET: '0x0000000000000000000000000000000000000000', // 待部署
  USDT: '0x55d398326f99059fF775485246999027B3197955', // BSC USDT
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
    };
  }
}
