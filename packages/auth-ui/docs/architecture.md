---
title: Architecture
description: Boundaries and approved Supabase usage for @engenty/auth-ui.
---

# Architecture

`@engenty/auth-ui` owns **product authentication UX** and **browser session helpers** that talk to Supabase Auth and `apps/core` setup APIs. It does not implement backend auth plugins or RLS policies.

## Neighborhood

| Package / app | Role |
|---------------|------|
| **`packages/ui-core`** | shadcn primitives for forms and cards |
| **`packages/auth-ui`** | Auth pages, Supabase browser client, setup gate (this package) |
| **`packages/user-management-ui`** | Profile/settings and admin user list (authenticated) |
| **`packages/api-client` / `api-contracts`** | Typed API errors for setup gate |
| **`apps/core`** | Workspace bootstrap and user APIs |
| **`apps/ui`** | Mounts auth routes via UI plugin catalog |

```text
Browser ──► @engenty/auth-ui (Supabase session)
                │
                ├──► apps/core /api (initial setup, dev login)
                └──► modules via getCurrentAccessToken / getCurrentUserId
```

## ui-core boundary

| Belongs in ui-core | Belongs in auth-ui |
|--------------------|-------------------|
| `Button`, `Card`, `Input`, `Label` | `AuthCard`, login/setup layout |
| Generic form chrome | Supabase `createClient` wrapper |
| — | `evaluateInitialSetupGate`, session refresh |

Do not move auth-specific flows into ui-core. Do not import `@engenty/user-management-ui` from auth-ui (keep packages independent).

## Supabase imports

`@supabase/supabase-js` is allowed **only** under `src/lib/supabase-auth-client.ts` (and related session helpers). Other packages must use auth-ui exports — enforced by `pnpm check:supabase-imports`.

## `engenty.plugin.json` vs `plugins.json`

There is **no** `plugins.json` in this repository.

| File | Required? | Purpose |
|------|-----------|---------|
| **`engenty.plugin.json`** | **Yes** for UI plugin packages | Canonical manifest: `id`, `ui.entry`, Tailwind sources. Consumed by `apps/ui` artifact generation → `generated-catalog.ts`. |
| **`package.json`** | Yes | npm workspace name, `exports` (`.` and `./plugin`). |

Removing `engenty.plugin.json` breaks UI plugin discovery unless the package is wired manually in `apps/ui` (not supported for workspace plugins).

Backend-only workspace packages may omit `ui` in the manifest; **auth-ui is UI-only** and must keep the manifest.

## Folder map

| Path | Notes |
|------|-------|
| `components/auth-card.tsx` | Login/signup/forgot UI (hook in `hooks/use-auth-card.ts`) |
| `hooks/use-initial-setup-gate-check.ts` | Shared gate loading for login/setup routes |
| `lib/initial-setup-gate.ts` | Service availability + setup-required probe |
| `lib/supabase-session-claims.ts` | JWT claims + `refreshSupabaseAuthSession` |
| `plugin.tsx` | Registers `/auth/*` and `/initial_setup` |

## Related docs

- [Routes and plugin](./routes-and-plugin)
- [Session API](./session-api)
