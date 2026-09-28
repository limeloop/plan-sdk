import type {
  RealtimeClientMessage,
  RealtimeConnectionState,
  RealtimeEvent,
  RealtimeSignal,
} from './protocol.js';

export interface RealtimeClientOptions {
  baseUrl: string;
  publishableKey: string;
  getAccessToken(): Promise<string | null>;
}

export type RealtimeListener = (event: RealtimeEvent) => void;
export type RealtimeStateListener = (state: RealtimeConnectionState) => void;

interface Channel {
  listeners: Set<RealtimeListener>;
  lastSignalId?: number;
  denied: boolean;
}

const RECONNECT_INITIAL_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

/**
 * One browser WebSocket shared by all requested channels. Signals contain no
 * row data: consumers use them to refetch through the ordinary SDK API.
 */
export class RealtimeClient {
  private socket: WebSocket | null = null;
  private state: RealtimeConnectionState = 'disconnected';
  private readonly channels = new Map<string, Channel>();
  private readonly stateListeners = new Set<RealtimeStateListener>();
  private reconnectDelay = RECONNECT_INITIAL_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private deliberatelyDisconnected = false;
  private connectionId = 0;

  constructor(private readonly options: RealtimeClientOptions) {}

  getState(): RealtimeConnectionState {
    return this.state;
  }

  subscribeState(listener: RealtimeStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** Subscribe to one authorized `person:`, `unit:`, or `team:` channel. */
  subscribe(channel: string, listener: RealtimeListener): () => void {
    let entry = this.channels.get(channel);
    if (!entry) {
      entry = { listeners: new Set(), denied: false };
      this.channels.set(channel, entry);
    }
    entry.listeners.add(listener);
    if (entry.listeners.size === 1) {
      entry.denied = false;
      this.deliberatelyDisconnected = false;
      void this.connect();
      this.sendSubscribe(channel, entry);
    }

    return () => {
      const current = this.channels.get(channel);
      if (!current) return;
      current.listeners.delete(listener);
      if (current.listeners.size !== 0) return;
      this.channels.delete(channel);
      this.send({ type: 'unsubscribe', channel });
      if (this.channels.size === 0) this.close(false);
    };
  }

  /** Starts (or restarts) the shared connection when channels are requested. */
  async connect(): Promise<void> {
    if (
      this.channels.size === 0 ||
      this.state !== 'disconnected' ||
      typeof WebSocket === 'undefined'
    ) {
      return;
    }
    this.deliberatelyDisconnected = false;
    this.setState('connecting');
    const connectionId = ++this.connectionId;
    const token = await this.options.getAccessToken();
    if (connectionId !== this.connectionId || this.channels.size === 0 || !token) {
      if (connectionId === this.connectionId) this.setState('disconnected');
      return;
    }

    const url = websocketUrl(this.options.baseUrl, this.options.publishableKey, token);
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      this.setState('disconnected');
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      if (connectionId !== this.connectionId || socket !== this.socket) return;
      this.reconnectDelay = RECONNECT_INITIAL_MS;
      this.setState('connected');
      for (const [channel, entry] of this.channels) this.sendSubscribe(channel, entry);
    };
    socket.onmessage = (message) => this.onMessage(connectionId, message);
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      if (connectionId !== this.connectionId || socket !== this.socket) return;
      this.socket = null;
      this.setState('disconnected');
      this.scheduleReconnect();
    };
  }

  /** Stops the socket and automatic reconnecting; subscriptions remain available for `connect()`. */
  disconnect(): void {
    this.deliberatelyDisconnected = true;
    this.close(true);
  }

  /** Reconnect after an auth session changes, using a freshly obtained token. */
  refreshAuthentication(): void {
    if (this.channels.size === 0) return;
    this.deliberatelyDisconnected = false;
    this.close(true);
    void this.connect();
  }

  private onMessage(connectionId: number, message: MessageEvent): void {
    if (connectionId !== this.connectionId || typeof message.data !== 'string') return;
    const event = parseEvent(message.data);
    if (!event) return;
    const entry = this.channels.get(event.channel);
    if (!entry) return;
    if (event.type === 'denied') {
      entry.denied = true;
    } else if (event.type === 'signal') {
      if (entry.lastSignalId !== undefined && event.id <= entry.lastSignalId) return;
      entry.lastSignalId = event.id;
    }
    for (const listener of entry.listeners) listener(event);
  }

  private sendSubscribe(channel: string, entry: Channel): void {
    if (entry.denied) return;
    this.send({ type: 'subscribe', channel, since: entry.lastSignalId });
  }

  private send(message: RealtimeClientMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  private close(invalidatePendingConnection: boolean): void {
    if (invalidatePendingConnection) this.connectionId += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) socket.close();
    this.setState('disconnected');
  }

  private scheduleReconnect(): void {
    if (this.deliberatelyDisconnected || this.channels.size === 0 || this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private setState(state: RealtimeConnectionState): void {
    if (state === this.state) return;
    this.state = state;
    for (const listener of this.stateListeners) listener(state);
  }
}

function websocketUrl(baseUrl: string, publishableKey: string, token: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/realtime`;
  url.search = '';
  url.searchParams.set('key', publishableKey);
  url.searchParams.set('token', token);
  return url.toString();
}

function parseEvent(text: string): RealtimeEvent | null {
  try {
    const event: unknown = JSON.parse(text);
    if (!event || typeof event !== 'object' || !('type' in event) || !('channel' in event)) {
      return null;
    }
    const typed = event as Partial<RealtimeEvent>;
    if (typeof typed.type !== 'string' || typeof typed.channel !== 'string') return null;
    if (typed.type === 'signal') {
      const signal = typed as Partial<RealtimeSignal>;
      if (
        typeof signal.id !== 'number' ||
        typeof signal.table !== 'string' ||
        typeof signal.row_key !== 'string' ||
        typeof signal.op !== 'string'
      ) {
        return null;
      }
    } else if (typed.type === 'presence') {
      if (!Array.isArray((typed as { who?: unknown }).who)) return null;
    } else if (!['subscribed', 'unsubscribed', 'denied'].includes(typed.type)) {
      return null;
    }
    return typed as RealtimeEvent;
  } catch {
    return null;
  }
}