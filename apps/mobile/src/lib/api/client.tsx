import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

/**
 * Server-state client (docs/MOBILE.md: TanStack Query for server state,
 * Zustand for local state). Online status comes from NetInfo, so queries pause
 * while offline and resume on reconnect, and screens can tell "loading" from
 * "waiting for a connection".
 */
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected !== false && state.isInternetReachable !== false);
  }),
);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Catalogue data changes rarely; refetch on focus after 5 minutes.
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      retry: 2,
      retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
    },
  },
});

export function ApiProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
    return () => sub.remove();
  }, []);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** Current connectivity, for banners. Starts optimistic so a cold start never flashes "offline". */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(onlineManager.isOnline());
  useEffect(() => onlineManager.subscribe(setOnline), []);
  return online;
}
