// PKCE sign-in against Rauthy (redirect or popup), refresh_token renewal,
// and the session store the rest of the SDK reads through `getAccessToken`.
//
// The api tells us how (GET /auth/config: issuer + client_id); from there
// this follows the same discovery -> authorize -> exchange flow as
// deploy/auth/dev-token.py, the script this repo already uses to get a
// working dev token by hand.
import { request } from '../http.js';
import { discover } from './discovery.js';
import { codeChallengeFor, randomToken } from './pkce.js';
import { POPUP_MESSAGE_SOURCE, type PopupMessage } from './constants.js';
import {
  type Session,
  loadSession,
  saveSession,
  savePendingSignIn,
  takePendingSignIn,
} from './session.js';

export interface AuthConfig {
  baseUrl: string;
  publishableKey: string;
  /** Defaults to `${location.origin}/auth/callback`, matching agent-knowledge.md's setup. */
  redirectUri?: string;
}

export interface SignInOptions {
  mode?: 'redirect' | 'popup';
  /** Where to send the browser back to after a redirect sign-in completes. Defaults to the current URL. */
  returnTo?: string;
}

export type SessionListener = (session: Session | null) => void;

/** Refresh a little before expiry, so a request in flight never races it. */
const REFRESH_SKEW_MS = 30_000;

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export class AuthController {
  private session: Session | null;
  private readonly listeners = new Set<SessionListener>();
  private refreshing: Promise<string | null> | null = null;

  constructor(private readonly config: AuthConfig) {
    this.session = loadSession(config.publishableKey);
  }

  getSession(): Session | null {
    return this.session;
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setSession(session: Session | null): void {
    this.session = session;
    saveSession(this.config.publishableKey, session);
    for (const listener of this.listeners) listener(session);
  }

  private redirectUri(): string {
    return this.config.redirectUri ?? `${window.location.origin}/auth/callback`;
  }

  private fetchAuthConfig(): Promise<{ issuer: string; client_id: string }> {
    return request(
      {
        baseUrl: this.config.baseUrl,
        publishableKey: this.config.publishableKey,
        getAccessToken: async () => null,
      },
      '/auth/config',
      { anonymous: true },
    );
  }

  /** Start a sign-in. Redirect mode navigates away; popup mode resolves once it's done. */
  async signIn(options: SignInOptions = {}): Promise<void> {
    const mode = options.mode ?? 'redirect';
    const { issuer, client_id } = await this.fetchAuthConfig();
    const { authorization_endpoint } = await discover(issuer);
    const verifier = randomToken();
    const state = randomToken(16);
    const redirectUri = this.redirectUri();
    savePendingSignIn(this.config.publishableKey, {
      verifier,
      state,
      redirectUri,
      returnTo: mode === 'redirect' ? (options.returnTo ?? window.location.href) : undefined,
    });
    const url = new URL(authorization_endpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', client_id);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', await codeChallengeFor(verifier));
    url.searchParams.set('code_challenge_method', 'S256');

    if (mode === 'popup') {
      await this.signInWithPopup(url.toString());
    } else {
      window.location.assign(url.toString());
    }
  }

  private signInWithPopup(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const popup = window.open(url, 'sign-in', 'width=480,height=640');
      if (!popup) {
        reject(
          new Error(
            'The sign-in popup was blocked. Allow popups for this site, or use mode: "redirect".',
          ),
        );
        return;
      }
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', onMessage);
        clearInterval(closedCheck);
        popup.close();
        fn();
      };
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data as PopupMessage | undefined;
        if (!data || data.source !== POPUP_MESSAGE_SOURCE) return;
        if (data.error || !data.code || !data.state) {
          finish(() => reject(new Error(data.errorDescription ?? data.error ?? 'Sign-in was cancelled.')));
          return;
        }
        const { code, state } = data;
        finish(() => {
          this.completeSignIn(code, state).then(resolve, reject);
        });
      };
      window.addEventListener('message', onMessage);
      const closedCheck = window.setInterval(() => {
        if (popup.closed) finish(() => reject(new Error('The sign-in popup was closed.')));
      }, 500);
    });
  }

  /**
   * Call once from the `/auth/callback` route (redirect mode). Returns
   * `returnTo` so the app can navigate back to where sign-in started.
   */
  async handleRedirectCallback(url: string | URL = window.location.href): Promise<{ returnTo?: string }> {
    const params = new URL(url).searchParams;
    const pending = takePendingSignIn(this.config.publishableKey);
    if (!pending) throw new Error('No sign-in was in progress in this tab.');
    const error = params.get('error');
    if (error) throw new Error(params.get('error_description') ?? error);
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) throw new Error('The sign-in callback is missing a code.');
    if (state !== pending.state) throw new Error('State does not match: sign in again.');
    await this.exchangeCode(code, pending.verifier, pending.redirectUri);
    return { returnTo: pending.returnTo };
  }

  private async completeSignIn(code: string, state: string): Promise<void> {
    const pending = takePendingSignIn(this.config.publishableKey);
    if (!pending) throw new Error('No sign-in was in progress in this tab.');
    if (state !== pending.state) throw new Error('State does not match: sign in again.');
    await this.exchangeCode(code, pending.verifier, pending.redirectUri);
  }

  private async exchangeCode(code: string, verifier: string, redirectUri: string): Promise<void> {
    const { issuer, client_id } = await this.fetchAuthConfig();
    const { token_endpoint } = await discover(issuer);
    const session = await this.tokenRequest(token_endpoint, {
      grant_type: 'authorization_code',
      client_id,
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier,
    });
    this.setSession(session);
  }

  /**
   * Sign in with an email and password, rendered entirely in your own UI:
   * Rauthy's hosted login page is never shown. The api proxies the actual
   * exchange with Rauthy server-side (see `POST /auth/login`), so this is a
   * single request, not a redirect.
   */
  async signInWithPassword(credentials: { email: string; password: string }): Promise<void> {
    const body = await request<{
      access_token: string;
      refresh_token?: string | null;
      id_token?: string | null;
      expires_in: number;
    }>(
      {
        baseUrl: this.config.baseUrl,
        publishableKey: this.config.publishableKey,
        getAccessToken: async () => null,
      },
      '/auth/login',
      {
        method: 'POST',
        anonymous: true,
        body: {
          email: credentials.email,
          password: credentials.password,
          redirect_uri: this.redirectUri(),
        },
      },
    );
    this.setSession({
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? undefined,
      idToken: body.id_token ?? undefined,
      expiresAt: Date.now() + body.expires_in * 1000,
    });
  }

  async signOut(): Promise<void> {
    const session = this.session;
    this.setSession(null);
    // Best-effort RP-initiated logout, so Rauthy forgets this browser too and
    // a later signIn() doesn't silently re-authenticate the same person.
    // Never let this block signing out locally.
    try {
      const { issuer } = await this.fetchAuthConfig();
      const discovery = await discover(issuer);
      if (discovery.end_session_endpoint && session?.idToken) {
        const url = new URL(discovery.end_session_endpoint);
        url.searchParams.set('id_token_hint', session.idToken);
        await fetch(url.toString(), { mode: 'no-cors' }).catch(() => undefined);
      }
    } catch {
      // Rauthy unreachable or misconfigured: the local session is already gone.
    }
  }

  /** Used by the http layer: refreshes first if the token is expiring soon. */
  async getAccessToken(): Promise<string | null> {
    const session = this.session;
    if (!session) return null;
    if (session.expiresAt - Date.now() > REFRESH_SKEW_MS) return session.accessToken;
    if (!session.refreshToken) {
      this.setSession(null);
      return null;
    }
    return this.refresh(session.refreshToken);
  }

  private refresh(refreshToken: string): Promise<string | null> {
    // Coalesce concurrent refreshes: several queries racing on one expired
    // token must not each spend the same refresh token.
    this.refreshing ??= this.doRefresh(refreshToken).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(refreshToken: string): Promise<string | null> {
    try {
      const { issuer, client_id } = await this.fetchAuthConfig();
      const { token_endpoint } = await discover(issuer);
      const session = await this.tokenRequest(token_endpoint, {
        grant_type: 'refresh_token',
        client_id,
        refresh_token: refreshToken,
      });
      this.setSession(session);
      return session.accessToken;
    } catch {
      this.setSession(null);
      return null;
    }
  }

  private async tokenRequest(
    tokenEndpoint: string,
    params: Record<string, string>,
  ): Promise<Session> {
    const res = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    const body = (await res.json()) as TokenResponse;
    if (!res.ok || !body.access_token) {
      throw new Error(body.error_description ?? body.error ?? `Sign-in failed (${res.status}).`);
    }
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      idToken: body.id_token,
      expiresAt: Date.now() + (body.expires_in ?? 900) * 1000,
    };
  }
}
