# @yourco/sdk

The only way frontends talk to the platform api. See `skill/agent-knowledge.md` for the rules
frontend agents must follow, and `api/README.md` for the endpoints this wraps.

## Install

This package lives in its own repo (`github.com/limeloop/plan-sdk`), separate from the api's
repo. Not published to a registry: install directly from git.

```json
{ "dependencies": { "@yourco/sdk": "github:limeloop/plan-sdk#main" } }
```

For local development against an unreleased api change, a path dependency still works if both
repos are checked out side by side:

```json
{ "dependencies": { "@yourco/sdk": "file:../platform/sdk" } }
```

After changing anything under `api/src/http/` in the `platform` repo, regenerate the committed
types here (this needs a local checkout of `platform` next to this repo, since `openapi.json`
isn't published anywhere):

```sh
npm run generate:types   # ../platform/api/openapi.json -> src/generated-types.ts
npm run build
```

Then commit and push the updated `src/generated-types.ts` in this repo.

## Sign-in

Wrap the app once with `ApiProvider`, then use `api.auth` and the `@yourco/sdk/react` hooks
everywhere else. Never call Rauthy or the api's `/auth/*` routes directly.

```tsx
import { createClient } from '@yourco/sdk';
import { ApiProvider } from '@yourco/sdk/react';

const api = createClient({
  url: 'https://api.client.example',
  publishableKey: 'pk_client_xxxxxxxx',
});

<ApiProvider client={api}>
  <App />
</ApiProvider>;
```

**Your own login form (recommended):** `signInWithPassword` posts straight to the api, which
drives Rauthy's session/pow/authorize/token exchange server-side. Rauthy's hosted login page is
never shown; the person never leaves your app.

```ts
try {
  await api.auth.signInWithPassword({ email, password });
} catch (e) {
  // WrongCredentialsError-shaped message, safe to show as-is: "Incorrect email or password."
  setError(e instanceof Error ? e.message : String(e));
}
```

This only supports plain password accounts today: an account with MFA, an unaccepted ToS, or an
expired password throws instead of silently falling back. There is no separate error type for
that yet - check the message, or steer affected accounts to `signIn()` below until it's added.

**Rauthy's own hosted page (redirect or popup):** still there for account recovery or MFA flows,
or if you'd rather not build a login form at all.

```ts
await api.auth.signIn({ mode: 'popup' }); // or signIn() for a full-page redirect
```

A popup sign-in resolves in place; a redirect sign-in needs a `/auth/callback` route rendering
`<AuthCallback />` from `@yourco/sdk/react` (handles both modes automatically).

**Reading and clearing the session:**

```ts
useSession();     // Session | null, live - updates on sign-in, sign-out, refresh
useMe();          // the signed-in person, their units, and what they may do
api.auth.signOut();
```

## What's in 0.2

Exactly the endpoints in `api/README.md`'s table: sign-in (PKCE redirect/popup, password via
`api.auth.signInWithPassword` - proxied through the api so Rauthy's hosted page is never
shown, refresh), `me`, `config`, `units`, `people`, `work-items` (list/get/create/update),
`teams` (list/get/create/add-member/remove-member), and the typed errors in `src/errors.ts`.

## What's NOT in 0.2

`skill/agent-knowledge.md` describes the full intended shape of this SDK, including realtime
updates, presence, file attachments, shares and notifications. None of that exists in the api
yet (`CLAUDE.md`'s Status section lists them under "Later"), so there's no `usePresence`,
`api.attachments`, `api.shares` or `api.notifications` here either. Don't call them into
existence in frontend code before they exist here: they'll be added together with the backend
endpoints they need.

## A note on where tokens live

Rauthy issues tokens straight to the browser; there's no backend-for-frontend in this stack to
hold them in an httpOnly cookie instead. `src/auth/session.ts` keeps them in `sessionStorage`
(cleared when the tab closes, not shared across tabs) rather than `localStorage`. That's a
pragmatic tradeoff for a pure SPA, not the strongest possible option - if a backend-for-frontend
is ever added in front of Rauthy, this is the file to replace.
