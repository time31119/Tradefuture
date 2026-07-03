import { http, createConfig } from 'wagmi';
import { mainnet, bsc } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

// Wagmi配置 - 简化版，避免RainbowKit的accounts依赖问题
export const wagmiConfig = createConfig({
  chains: [mainnet, bsc],
  connectors: [
    injected(),
  ],
  transports: {
    [mainnet.id]: http(),
    [bsc.id]: http(),
  },
});

// 支持的链列表
export const supportedChains = [
  { id: 1, name: 'Ethereum', symbol: 'ETH', explorer: 'https://etherscan.io' },
  { id: 56, name: 'BNB Chain', symbol: 'BNB', explorer: 'https://bscscan.com' },
];

// 获取链信息
export const getChainInfo = (chainId: number) => {
  return supportedChains.find(chain => chain.id === chainId);
};
