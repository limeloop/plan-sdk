# @yourco/sdk

The only way frontends talk to the platform api. See `skill/agent-knowledge.md` for the rules
frontend agents must follow, and `api/README.md` for the endpoints this wraps.

## Install

Not published yet: install from a path until the api settles (per `CLAUDE.md` Step 6).

```json
{ "dependencies": { "@yourco/sdk": "file:../platform/sdk" } }
```

After changing anything under `api/src/http/`, regenerate the committed types:

```sh
npm run generate:types   # api/openapi.json -> src/generated-types.ts
npm run build
```

## What's in 0.1

Exactly the endpoints in `api/README.md`'s table: sign-in (PKCE, redirect and popup, refresh),
`me`, `config`, `units`, `people`, `work-items` (list/get/create/update), `teams`
(list/get/create/add-member/remove-member), and the typed errors in `src/errors.ts`.

## What's NOT in 0.1

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
