# Phase 0 spike findings — executor SDK embedding (2026-07-12)

Verdict: **use `@executor-js/plugin-openapi/core` as a normalization library**
(pinned exact 1.5.29, effect pinned 4.0.0-beta.59, both also in root
`pnpm.overrides`); execution stays first-party. Verified against the live
petstore spec and inspected type surfaces.

1. **Standalone parse/extract: YES.** `parse(specText)` + `extract(doc)` run
   under `Effect.runPromise` with no executor storage/runtime. Extract yields
   per-operation: `operationId`, `method`, `pathTemplate`, `parameters`
   (name/location/required/style), merged `inputSchema` (JSON Schema, body
   nested under `body`), `requestBody.contentType`, `servers`, `tags`,
   `deprecated`. This is the hard 80% (refs, param styles, body merging).
2. **Per-call injected auth via their invoke: PARTIAL.** `buildRequest` works
   (path/query/header assembly verified) but returns an Effect
   `HttpClientRequest` and their `invoke` needs an Effect HttpClient layer.
   Not worth the interop: our own `http-invoker.ts` (~150 lines, fetch-based)
   builds requests from the extracted operation shape and injects credentials
   from `ctx.accessToken`. Executor/Effect never runs at boot or execute time
   (lazy dynamic import inside `normalize-openapi.ts` only).
3. **plugin-mcp standalone: NOT USED.** Their MCP plugin is wired to their
   runtime. Hand-rolled JSON-RPC client (`invoke/mcp-client.ts`, initialize →
   tools/list | tools/call over streamable HTTP, SSE-single-message tolerant)
   modeled on `apps/ai/src/ai/mcp-apps/http-client.ts`.
4. **Their safe/unsafe classification: TOO COARSE.** `annotationsForOperation`
   is method-only (POST/PUT/PATCH/DELETE ⇒ requiresApproval). Ours
   (`importer/classify.ts`): GET/HEAD/OPTIONS→read, DELETE→destructive,
   destructive-verb paths→destructive, else write; MCP via
   readOnlyHint/destructiveHint, default write.

Engenty runtime facts verified:

- `EngentyPluginFactory` may return `Promise<void>` → async boot (DB read
  before registration) is supported.
- Core `registerOperation` is **add-only** (duplicates warn-skipped, no
  removal). Consequences: hot import works (new ids register live); refresh
  keeps old operation closures → handlers read config through a live-record
  resolver so base_url/auth changes apply anyway; schema/group changes and
  deletes fully settle on restart (`restart_recommended` in API responses).
- Operation ids must pass `assertStrictToolId` (lowercase snake_case) →
  enforced on tool prefixes at import (`validateConnectorNaming`).
