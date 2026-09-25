// Where tokens live between page loads. `sessionStorage`, not `localStorage`:
// it clears when the tab closes rather than lingering forever, and it's not
// shared between tabs, so signing out in one tab can't be silently ignored
// in another. This is a plain SPA talking to Rauthy directly (no
// backend-for-frontend to hold an httpOnly cookie instead) - if that changes,
// this is the file to replace.
export interface Session {
  accessToken: string;
  refreshToken?: string;
  /** For RP-initiated logout (`end_session_endpoint`); not sent to the api. */
  idToken?: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

/** The PKCE verifier and state for a sign-in attempt still in flight. */
export interface PendingSignIn {
  verifier: string;
  state: string;
  redirectUri: string;
  /** Where to return the app to after the callback completes (redirect mode only). */
  returnTo?: string;
}

function sessionKey(publishableKey: string): string {
  return `yourco.sdk.session.${publishableKey}`;
}

function pendingKey(publishableKey: string): string {
  return `yourco.sdk.pending-sign-in.${publishableKey}`;
}

/** `sessionStorage` throws in some privacy modes and doesn't exist during SSR. */
function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function loadSession(publishableKey: string): Session | null {
  const raw = storage()?.getItem(sessionKey(publishableKey));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function saveSession(publishableKey: string, session: Session | null): void {
  const s = storage();
  if (!s) return;
  if (session) s.setItem(sessionKey(publishableKey), JSON.stringify(session));
  else s.removeItem(sessionKey(publishableKey));
}

export function savePendingSignIn(publishableKey: string, pending: PendingSignIn): void {
  storage()?.setItem(pendingKey(publishableKey), JSON.stringify(pending));
}

export function takePendingSignIn(publishableKey: string): PendingSignIn | null {
  const s = storage();
  const raw = s?.getItem(pendingKey(publishableKey));
  s?.removeItem(pendingKey(publishableKey));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingSignIn;
  } catch {
    return null;
  }
}
