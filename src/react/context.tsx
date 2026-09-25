import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ApiClient } from '../client.js';

const ApiContext = React.createContext<ApiClient | null>(null);

export interface ApiProviderProps {
  client: ApiClient;
  /** Provide your own if the app already has a TanStack Query client. */
  queryClient?: QueryClient;
  children: React.ReactNode;
}

/**
 * Wrap the app once. Owns a `QueryClient` (unless you already have one) so
 * `useWorkItems`, `useTeams` and friends can cache and invalidate.
 */
export function ApiProvider({ client, queryClient, children }: ApiProviderProps): React.JSX.Element {
  const [ownQueryClient] = React.useState(() => queryClient ?? new QueryClient());
  return (
    <ApiContext.Provider value={client}>
      <QueryClientProvider client={ownQueryClient}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
}

/** The client passed to `<ApiProvider>`. Throws outside of one. */
export function useApiClient(): ApiClient {
  const client = React.useContext(ApiContext);
  if (!client) {
    throw new Error('useApiClient (and every hook in @yourco/sdk/react) needs an <ApiProvider>.');
  }
  return client;
}
