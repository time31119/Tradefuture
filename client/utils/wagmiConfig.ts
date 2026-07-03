// Wagmi配置 - 临时禁用，解决Metro bundler的import.meta问题
// TODO: 待Metro配置修复后恢复

export const wagmiConfig = null;

// 支持的链列表
export const supportedChains = [
  { id: 1, name: 'Ethereum', symbol: 'ETH', explorer: 'https://etherscan.io' },
  { id: 56, name: 'BNB Chain', symbol: 'BNB', explorer: 'https://bscscan.com' },
];

// 获取链信息
export const getChainInfo = (chainId: number) => {
  return supportedChains.find(chain => chain.id === chainId);
};
