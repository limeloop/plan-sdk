import * as React from 'react';
import { useApiClient } from './context.js';
import { POPUP_MESSAGE_SOURCE } from '../auth/constants.js';

export interface AuthCallbackProps {
  /** Called after a redirect sign-in completes. Defaults to navigating to `returnTo` (or `/`). */
  onSignedIn?: (returnTo: string | undefined) => void;
  /** Called if the callback fails (bad state, Rauthy returned an error, ...). Defaults to logging it. */
  onError?: (error: Error) => void;
  /** Shown while the callback is being processed. */
  children?: React.ReactNode;
}

/**
 * Render at the app's `/auth/callback` route. Handles both sign-in modes:
 * in a popup, it hands the result back to the window that opened it; in a
 * full-page redirect, it exchanges the code itself and hands back `returnTo`.
 */
export function AuthCallback({ onSignedIn, onError, children }: AuthCallbackProps): React.ReactNode {
  const client = useApiClient();

  React.useEffect(() => {
    if (window.opener) {
      const params = new URL(window.location.href).searchParams;
      window.opener.postMessage(
        {
          source: POPUP_MESSAGE_SOURCE,
          code: params.get('code') ?? undefined,
          state: params.get('state') ?? undefined,
          error: params.get('error') ?? undefined,
          errorDescription: params.get('error_description') ?? undefined,
        },
        window.location.origin,
      );
      return;
    }
    client.auth
      .handleRedirectCallback()
      .then(({ returnTo }) => {
        if (onSignedIn) onSignedIn(returnTo);
        else window.location.replace(returnTo ?? '/');
      })
      .catch((error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        if (onError) onError(err);
        else console.error('Sign-in callback failed:', err);
      });
    // Runs once: the callback's URL (with its one-time code) doesn't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return children ?? null;
}
