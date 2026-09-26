import { AuthController, type SignInOptions } from './auth/controller.js';
import type { Session } from './auth/session.js';
import { request } from './http.js';
import type {
  Category,
  Config,
  Me,
  Person,
  Team,
  TeamAddMemberInput,
  TeamCreateInput,
  Unit,
  Versioned,
  Word,
  WorkItem,
  WorkItemCreateInput,
  WorkItemUpdateInput,
} from './types.js';

export interface CreateClientOptions {
  /** The api's base URL, e.g. `https://api.client.example`. */
  url: string;
  /** Public: identifies this app. Sent as `x-publishable-key`. */
  publishableKey: string;
  /** Defaults to `${location.origin}/auth/callback`. */
  redirectUri?: string;
}

export interface AuthApi {
  signIn(options?: SignInOptions): Promise<void>;
  /** Your own login form, never Rauthy's hosted page: see `docs/design-core-and-messaging.md`. */
  signInWithPassword(credentials: { email: string; password: string }): Promise<void>;
  signOut(): Promise<void>;
  /** Call from the `/auth/callback` route after a redirect sign-in lands. */
  handleRedirectCallback(url?: string | URL): Promise<{ returnTo?: string }>;
  getSession(): Session | null;
  subscribe(listener: (session: Session | null) => void): () => void;
}

export interface ApiClient {
  auth: AuthApi;
  me(): Promise<Me>;
  config(): Promise<Config>;
  units: {
    list(): Promise<Unit[]>;
  };
  people: {
    list(params?: { unitId?: string }): Promise<Person[]>;
  };
  workItems: {
    list(params: { unitId: string; date: string }): Promise<WorkItem[]>;
    get(id: string): Promise<WorkItem>;
    create(input: WorkItemCreateInput): Promise<WorkItem>;
    update(id: string, patch: Partial<WorkItemUpdateInput>, options: Versioned): Promise<WorkItem>;
  };
  teams: {
    list(params: { unitId: string; date: string }): Promise<Team[]>;
    get(id: string): Promise<Team>;
    create(input: TeamCreateInput): Promise<Team>;
    addMember(teamId: string, input: TeamAddMemberInput): Promise<Team>;
    removeMember(teamId: string, personId: string): Promise<Team>;
  };
}

/** Words and categories are objects; re-exported here only for convenience typing. */
export type { Category, Word };

export function createClient(options: CreateClientOptions): ApiClient {
  const auth = new AuthController({
    baseUrl: options.url,
    publishableKey: options.publishableKey,
    redirectUri: options.redirectUri,
  });
  const http = {
    baseUrl: options.url,
    publishableKey: options.publishableKey,
    getAccessToken: () => auth.getAccessToken(),
  };

  return {
    auth: {
      signIn: (o) => auth.signIn(o),
      signInWithPassword: (credentials) => auth.signInWithPassword(credentials),
      signOut: () => auth.signOut(),
      handleRedirectCallback: (url) => auth.handleRedirectCallback(url),
      getSession: () => auth.getSession(),
      subscribe: (listener) => auth.subscribe(listener),
    },
    me: () => request(http, '/me'),
    config: () => request(http, '/config'),
    units: {
      list: () => request(http, '/units'),
    },
    people: {
      list: (params) => request(http, '/people', { query: { unit_id: params?.unitId } }),
    },
    workItems: {
      list: (params) =>
        request(http, '/work-items', { query: { unit_id: params.unitId, date: params.date } }),
      get: (id) => request(http, `/work-items/${encodeURIComponent(id)}`),
      create: (input) => request(http, '/work-items', { method: 'POST', body: input }),
      update: (id, patch, versioned) =>
        request(http, `/work-items/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: { ...patch, version: versioned.version },
        }),
    },
    teams: {
      list: (params) =>
        request(http, '/teams', { query: { unit_id: params.unitId, date: params.date } }),
      get: (id) => request(http, `/teams/${encodeURIComponent(id)}`),
      create: (input) => request(http, '/teams', { method: 'POST', body: input }),
      addMember: (teamId, input) =>
        request(http, `/teams/${encodeURIComponent(teamId)}/members`, {
          method: 'POST',
          body: input,
        }),
      removeMember: (teamId, personId) =>
        request(
          http,
          `/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(personId)}`,
          { method: 'DELETE' },
        ),
    },
  };
}
