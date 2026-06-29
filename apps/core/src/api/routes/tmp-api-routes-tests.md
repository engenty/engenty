# API routes layout notes (`apps/core/src/api/routes`)

## Source subfolders (2026-05)

| Folder | Contents |
|--------|-----------|
| `ai/` | Orchestrator + AI HTTP surface: `ai-runtime-routes.ts` (composer), session/action/trigger/ag-ui/observability/agent routes, `ai-admin-routes`, `ai-usage-routes`, `ai-skill-catalog`, instruction editor, doc converter, heartbeat runner/policy, `ai-action-runner`, `ai-settings-shared`, `ai-runtime-route-common`, `ai-runtime-session-shared`. Imports `../authz.js`, `../api-response.js`, `../../method-invoker.js`, `../dashboard/shared.js` where needed. |
| `plugins/` | `plugin-admin-routes`, `plugin-http-routes`, `plugin-http-response`, `module-operation-routes`. Imports `../authz.js` / `../api-response.js` / `../types.js` for parents in `routes/`. |
| `auth/` | `auth-routes.ts`, `dev-login-routes.ts`. |
| `dashboard/` | Unchanged (widget routes + `__tests__`). |
| `user-management/` | Unchanged. |

Root `routes/` still holds cross-cutting modules: `authz.ts`, `types.ts`, `api-response.ts`, gateway, queue, vault, settings, etc.

## Tests

- `__tests__/*.test.ts` — flat tests; imports use `../ai/…`, `../plugins/…` for moved sources.
- `__tests__/ai-runtime/` — split AI integration tests + `create-test-app.ts` → `../../ai/ai-runtime-routes.js`.

## Consumer

- `apps/core/src/api/server.ts` — `registerAiRuntimeRoutes` from `./routes/ai/ai-runtime-routes.js`; auth from `./routes/auth/`; plugins from `./routes/plugins/`.
- `gateway-routes.ts`, `test-data-routes.ts` — `executeModuleOperation` / types from `./plugins/module-operation-routes.js`.

## Docs touched

- `docs/dev/backend-abstraction.md`, `public-urls.md`, `api-response-contract.md` — plugin paths under `routes/plugins/`.
