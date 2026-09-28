export interface RealtimeSignal {
  type: 'signal';
  id: number;
  channel: string;
  table: string;
  row_key: string;
  op: string;
}

export interface RealtimePresence {
  type: 'presence';
  channel: string;
  who: string[];
}

export interface RealtimeSubscribed {
  type: 'subscribed';
  channel: string;
}

export interface RealtimeUnsubscribed {
  type: 'unsubscribed';
  channel: string;
}

export interface RealtimeDenied {
  type: 'denied';
  channel: string;
}

export type RealtimeEvent =
  | RealtimeSignal
  | RealtimePresence
  | RealtimeSubscribed
  | RealtimeUnsubscribed
  | RealtimeDenied;

export type RealtimeClientMessage =
  | { type: 'subscribe'; channel: string; since?: number }
  | { type: 'unsubscribe'; channel: string };

export type RealtimeConnectionState = 'disconnected' | 'connecting' | 'connected';