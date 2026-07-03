import { AuthProvider } from '@/contexts/AuthContext';
import { WalletProvider } from '@/contexts/WalletContext';
import { type ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { WebOnlyColorSchemeUpdater } from './ColorSchemeUpdater';
import { WebOnlyPrettyScrollbar } from './PrettyScrollbar'
import { HeroUINativeProvider } from '@/heroui';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from '@/utils/wagmiConfig';

// Create a client for React Query
const queryClient = new QueryClient();

function Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <WebOnlyColorSchemeUpdater>
          <WebOnlyPrettyScrollbar>
            <AuthProvider>
              <WalletProvider>
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <HeroUINativeProvider>
                    {children}
                  </HeroUINativeProvider>
                </GestureHandlerRootView>
              </WalletProvider>
            </AuthProvider>
          </WebOnlyPrettyScrollbar>
        </WebOnlyColorSchemeUpdater>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export {
  Provider,
}
