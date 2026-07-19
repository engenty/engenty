# @engenty/test-kit

Shared test fixtures and fakes. **Test-only**: the package exports TypeScript
source directly (no build step) and must never be imported from runtime code.
Add it to a package's `devDependencies` as `workspace:*`.

Policy context: [testing-policy.mdc](../../docs/agent/rules/testing-policy.mdc).

## What's in here

- **`makeAuth(overrides?)`** + `TEST_TENANT_ID` / `TEST_USER_ID` / `TEST_SCOPE_ID`
  — canonical identity fixtures. Use instead of hand-typed `"tenant-1"` literals.
- **`createFakeSupabase({ tables, rpc, rpcData })`** — chainable PostgREST fake
  that **actually applies filters** (`eq`/`neq`/`in`/`is`/`gt(e)`/`lt(e)`/`like`/
  `ilike`/`contains`/`not`/`or`/`order`/`limit`/`range`/`single`/`maybeSingle`)
  and executes mutations (`insert`/`upsert`/`update`/`delete`) against the
  seeded in-memory rows. Calls are recorded per table (`calls`) for boundary
  assertions where the call itself is the contract (e.g. tenant scoping).
  `queueError(table, message)` fails the next query on a table.
- **`makeMockApi(overrides?)`** — fake `PluginServerApi` collecting
  `httpRoutes`, `serverOperations`, and `aiRegistrations`; everything else is a
  no-op receipt. Replaces the per-module copies.

## What stays module-local

Domain repo fakes (`makeMockTasksRepo`, …) and domain builders
(`makeDocument`/`makeSource` in `packages/retrieval/src/test-utils.ts`) stay
with their module — they encode module contracts, not shared infrastructure.
Follow that override-style builder pattern for new domain fixtures.

## Candidates for later

- `makeMessage()` — chat-message builders are still heterogeneous across
  AG-UI/UIMessage shapes; canonicalize once the shapes converge.
- A generic in-memory repo helper generalizing the `makeMock*Repo` pattern.
