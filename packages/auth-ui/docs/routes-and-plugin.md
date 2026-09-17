---
title: Routes and plugin
description: UI plugin entry, engenty.plugin.json, and public auth routes.
---

# Routes and plugin

## Plugin entry

Register via workspace UI catalog (generated from `engenty.plugin.json`):

```json
{
  "id": "auth-ui",
  "kind": "package",
  "ui": {
    "entry": "@engenty/auth-ui/plugin",
    "load": "workspace",
    "tailwindSources": ["./src", "./dist"]
  }
}
```

`apps/ui/package.json` must list `@engenty/auth-ui` as a dependency. `pnpm` dev/build in `apps/ui` regenerates `src/plugins/generated-catalog.ts`.

## Routes registered in `plugin.tsx`

| Route id | Path | Scope | Component |
|----------|------|-------|-----------|
| `auth_dev_login` | `/auth/dev-login` | public | Dev login (non-prod) |
| `auth_initial_setup` | `/initial_setup` | default | First admin setup |
| `auth_login` | `/auth/login` | default | Sign-in |
| `auth_oauth_consent` | `/oauth/consent` | public | MCP OAuth client consent |
| `auth_callback` | `/auth/callback` | default | OAuth / reset password callback |

`ServiceUnavailablePage` is exported from the main entry for `apps/ui` to mount at `/service_unavailable` (not always registered in the plugin file — check `UnauthenticatedRoutes` in the app).

## i18n

Namespace `auth` — loaders from `src/locales/en.json`. Add `de` when product requires German auth copy.

## Apps integration

`apps/ui` typically:

1. Renders `AuthRedirect` at `/` for unauthenticated users.
2. Mounts exported pages in an unauthenticated route tree.
3. Uses `useCoreAuthSession` + `evaluateInitialSetupGate` in bootstrap before `AppLayout`.

See `apps/ui/src/App.tsx` and `apps/ui/src/routes/UnauthenticatedRoutes.tsx`.

## Related docs

- [Session API](./session-api)
- [Plugin manifest](../../../docs/content/dev/plugin-system/manifest.md)
