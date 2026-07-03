export const COLORS = {
  background: '#0B0E14',
  surface: '#141A24',
  surfaceElevated: '#1C2333',
  primary: '#F5A623',
  primaryLight: '#F7C948',
  success: '#00C897',
  danger: '#FF6B6B',
  textPrimary: '#FFFFFF',
  textSecondary: '#8896A6',
  border: '#2A2F3F',
  borderActive: '#F5A623',
  GRADIENT_PRIMARY: ['#F5A623', '#F7C948'] as const,
  GRADIENT_GOLD: ['#F5A623', '#F7C948'] as const,
} as const;

export const GRADIENT_PRIMARY = [COLORS.primary, COLORS.primaryLight] as const;
