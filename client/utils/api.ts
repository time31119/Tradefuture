// API 配置 - 集中管理后端 URL
// 生产环境通过 Nginx 反向代理，使用相对路径
// 开发环境可设置 EXPO_PUBLIC_BACKEND_BASE_URL 环境变量

export const API_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || '';

// 辅助函数：构建完整的 API URL
export const getApiUrl = (path: string) => {
  return `${API_BASE_URL}${path}`;
};
