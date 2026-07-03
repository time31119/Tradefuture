import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, polygon, optimism, arbitrum, base, bsc } from 'wagmi/chains';

// Wagmi配置 - 支持多链
export const wagmiConfig = getDefaultConfig({
  appName: 'TradeFuture',
  projectId: 'YOUR_PROJECT_ID', // 需要从WalletConnect Cloud获取
  chains: [mainnet, polygon, optimism, arbitrum, base, bsc],
  ssr: false,
});

// 支持的链列表
export const supportedChains = [
  { id: 1, name: 'Ethereum', symbol: 'ETH', explorer: 'https://etherscan.io' },
  { id: 137, name: 'Polygon', symbol: 'MATIC', explorer: 'https://polygonscan.com' },
  { id: 10, name: 'Optimism', symbol: 'ETH', explorer: 'https://optimistic.etherscan.io' },
  { id: 42161, name: 'Arbitrum', symbol: 'ETH', explorer: 'https://arbiscan.io' },
  { id: 8453, name: 'Base', symbol: 'ETH', explorer: 'https://basescan.org' },
  { id: 56, name: 'BNB Chain', symbol: 'BNB', explorer: 'https://bscscan.com' },
];

// 获取链信息
export const getChainInfo = (chainId: number) => {
  return supportedChains.find(chain => chain.id === chainId);
};
