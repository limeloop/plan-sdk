// Rauthy's OIDC discovery document: the endpoints PKCE sign-in needs, found
// from the issuer alone (api/src/auth.rs verifies tokens the same way).
export interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
}

const cache = new Map<string, Promise<Discovery>>();

export function discover(issuer: string): Promise<Discovery> {
  const cached = cache.get(issuer);
  if (cached) return cached;
  const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const promise = fetch(url).then(async (res) => {
    if (!res.ok) throw new Error(`could not fetch ${url}: ${res.status}`);
    return (await res.json()) as Discovery;
  });
  cache.set(issuer, promise);
  // A failed fetch shouldn't be cached forever: transient network trouble
  // should be retried on the next sign-in attempt.
  promise.catch(() => cache.delete(issuer));
  return promise;
}
