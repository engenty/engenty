---
title: Session API
description: Supabase client, session hooks, setup gate, and token helpers.
---

# Session API

Headless exports from `@engenty/auth-ui` (main entry). Use these from modules and apps instead of importing `@supabase/supabase-js` directly.

## Supabase client

| Export | Use |
|--------|-----|
| `getSupabaseAuthClient()` | Required singleton for auth operations |
| `getOptionalSupabaseAuthClient()` | Same when client may be absent (live-cache) |

## Session and identity

| Export | Use |
|--------|-----|
| `useCoreAuthSession()` | React hook: user, session, loading |
| `getCurrentAccessToken()` | Bearer token for API calls |
| `getCurrentUserId()` | Engenty user id from session |
| `getApiBaseUrl()` | Core API base from environment |

## Claims and refresh

| Export | Use |
|--------|-----|
| `readSupabaseAccessTokenClaims()` | Parse JWT claims |
| `refreshSupabaseAuthSession()` | Refresh session; used after setup and for live-cache sync |
| `claimsMatchWorkspaceTenant()` | Tenant alignment check |

## Workspace setup

| Export | Use |
|--------|-----|
| `evaluateInitialSetupGate()` | Probe DB/API before showing login |
| `gateFailureToNavigationState()` | Map failure → `/service_unavailable` state |
| `isInitialSetupRequired()` | Whether first admin must be created |
| `createInitialAdmin` / `initializeWorkspaceAdmin` | Setup flows (via `initial-setup.ts` exports) |

## Dev login

`fetchDevLoginStatus`, `ensureDevLoginUser` (from `dev-login.ts`) — used inside `AuthCard` when core exposes dev login.

## Live cache

`@engenty/live-cache` imports `refreshSupabaseAuthSession` and claim helpers from auth-ui. See [live-cache security](../../../docs/dev/live-cache-security.md).

## Related docs

- [Backend abstraction](../../../docs/dev/backend-abstraction.md)
- [Architecture](./architecture)
