---
title: "@engenty/auth-ui"
description: Authentication UI, workspace setup gate, Supabase session helpers, and public auth routes for Engenty apps.
---

# @engenty/auth-ui

`@engenty/auth-ui` is the **browser auth surface** for Engenty product apps: login and initial-setup pages, OAuth/password-reset callback, service-unavailable UX, Supabase client wiring, and workspace bootstrap helpers consumed by `apps/ui` and `apps/manage`.

Generic UI primitives (`Button`, `Card`, `Input`) come from `@engenty/ui-core`. User profile and admin user-management pages live in `@engenty/user-management-ui`.

## Package layout

| Area | Path | Purpose |
|------|------|---------|
| **Components** | `src/components/` | `AuthCard`, password form shell, redirect helper |
| **Hooks** | `src/hooks/` | Auth card state, initial-setup gate checks for routes |
| **Lib** | `src/lib/` | Supabase client, API tokens, setup gate, dev login |
| **Routes** | `src/routes/` | Login, callback, dev login, service unavailable |
| **Plugin** | `src/plugin.tsx` | UI plugin: i18n + public auth routes |
| **Manifest** | `engenty.plugin.json` | UI catalog discovery (required — not `plugins.json`) |

Public exports: `packages/auth-ui/src/index.ts`. UI plugin entry: `@engenty/auth-ui/plugin`.

```bash
pnpm --filter @engenty/auth-ui build
pnpm --filter @engenty/auth-ui test
```

## Import convention

**App shell (session + API tokens):**

```tsx
import {
  useCoreAuthSession,
  getSupabaseAuthClient,
  getCurrentAccessToken,
  getCurrentUserId,
  evaluateInitialSetupGate,
} from "@engenty/auth-ui";
```

**Unauthenticated routes (apps/ui):**

```tsx
import {
  AuthRedirect,
  LoginPage,
  InitialSetupPage,
  ServiceUnavailablePage,
} from "@engenty/auth-ui";
```

**Do not** duplicate Supabase client creation in modules — use `getSupabaseAuthClient` / approved helpers. See [backend abstraction](../../../docs/dev/backend-abstraction.md).

## When to use which area

| Need | Doc |
|------|-----|
| Boundaries vs ui-core and user-management-ui | [Architecture](./architecture) |
| `engenty.plugin.json` and route registration | [Routes and plugin](./routes-and-plugin) |
| Session claims, refresh, setup gate | [Session API](./session-api) |

## Related docs

- [Architecture](./architecture)
- [Routes and plugin](./routes-and-plugin)
- [Session API](./session-api)
- [User management UI](../user-management-ui/README) (profile/settings routes — separate package)
- [Backend abstraction — auth paths](../../../docs/dev/backend-abstraction.md)
- [Live cache security](../../../docs/dev/live-cache-security.md)
