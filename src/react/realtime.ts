import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeConnectionState, RealtimeSignal } from '../realtime/protocol.js';
import { useApiClient } from './context.js';

export interface RealtimeChannelState {
  connection: RealtimeConnectionState;
  presence: string[];
  lastSignal: RealtimeSignal | null;
  denied: boolean;
}

const INITIAL_STATE: RealtimeChannelState = {
  connection: 'disconnected',
  presence: [],
  lastSignal: null,
  denied: false,
};

/**
 * Subscribe while this component is mounted. Signals are data-free: combine
 * this with `useRealtimeQueryInvalidation` or refetch the affected data.
 */
export function useRealtimeChannel(channel: string | null): RealtimeChannelState {
  const client = useApiClient();
  const [state, setState] = React.useState<RealtimeChannelState>(() => ({
    ...INITIAL_STATE,
    connection: client.realtime.getState(),
  }));

  React.useEffect(() => {
    if (!channel) {
      setState({ ...INITIAL_STATE, connection: client.realtime.getState() });
      return;
    }
    setState({ ...INITIAL_STATE, connection: client.realtime.getState() });
    const unsubscribeState = client.realtime.subscribeState((connection) => {
      setState((current) => ({ ...current, connection }));
    });
    const unsubscribe = client.realtime.subscribe(channel, (event) => {
      if (event.type === 'presence') {
        setState((current) => ({ ...current, presence: event.who }));
      } else if (event.type === 'signal') {
        setState((current) => ({ ...current, lastSignal: event }));
      } else if (event.type === 'denied') {
        setState((current) => ({ ...current, denied: true }));
      }
    });
    return () => {
      unsubscribe();
      unsubscribeState();
    };
  }, [channel, client]);

  return state;
}

/**
 * Invalidate SDK query caches for remote changes on these channels. Mount it
 * beside the matching board/detail view; signals never contain row data.
 */
export function useRealtimeQueryInvalidation(channels: readonly string[]): void {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const channelsKey = channels.join('\u0000');

  React.useEffect(() => {
    const cleanups = channels.map((channel) =>
      client.realtime.subscribe(channel, (event) => {
        if (event.type === 'signal') invalidateForSignal(queryClient, event);
      }),
    );
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [channelsKey, client, queryClient]);
}

function invalidateForSignal(
  queryClient: ReturnType<typeof useQueryClient>,
  signal: RealtimeSignal,
): void {
  if (signal.table === 'work_item') {
    void queryClient.invalidateQueries({ queryKey: ['work-items'] });
    void queryClient.invalidateQueries({ queryKey: ['work-item', signal.row_key] });
  } else if (signal.table === 'team' || signal.table === 'team_member' || signal.table === 'team_resource') {
    void queryClient.invalidateQueries({ queryKey: ['teams'] });
    if (signal.table === 'team') {
      void queryClient.invalidateQueries({ queryKey: ['team', signal.row_key] });
    }
  } else if (signal.table === 'person') {
    void queryClient.invalidateQueries({ queryKey: ['people'] });
  }
}