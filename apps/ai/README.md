# `@engenty/ai` (`apps/ai`)

Experimental AI service: **Hono** + **Mastra** (`@mastra/hono`) + **Vercel AI SDK v7 beta** (`ai@7.0.0-beta.x`). The rest of the monorepo stays on **AI SDK 6** via root `pnpm.overrides`; only `@engenty/ai` is overridden to v7 (`@engenty/ai>ai` in root `package.json`).

## Run

```bash
# from repo root (Portless → https://ai.engenty.localhost)
pnpm dev:ai
```

Production-style (after build):

```bash
pnpm --filter @engenty/ai build && pnpm --filter @engenty/ai start
```

Public URL: `https://ai.engenty.localhost` (see [portless-local-urls.md](../../docs/dev/portless-local-urls.md)). Process binds `127.0.0.1:8790` (`PORT` overrides).

## Mastra Studio (development only)

[Mastra Studio](https://mastra.ai/docs/studio/overview) is for local agent debugging only — not exposed in production. **`mastra`** on npm is versioned separately from **`@mastra/core`**; if the CLI warns about peers during upgrades, use `MASTRA_SKIP_PEERDEP_CHECK=1` ([docs](https://mastra.ai/reference/cli/mastra)).

1. Start dev: `pnpm dev` (gateway + `apps/ai`) or `pnpm dev:ai`.
2. In another terminal: `pnpm mastra:studio` (loopback **:43111**, `MASTRA_STUDIO_BASE_PATH=/studio`).

With the core dev gateway (`ENGENTY_DEV_GATEWAY=1`), open **`https://engenty.localhost/studio`**. The studio script sets **`MASTRA_AUTO_DETECT_URL=true`** so Studio auto-configures to **`https://engenty.localhost`** with API prefix **`/ai`** (no manual setup screen when the gateway is up). If a stale config persists, delete **`mastra-studio-config`** in localStorage and reload.

Without the gateway, Studio still runs on loopback; configure Settings to match your `apps/ai` URL. CORS allows origins in **`ENGENTY_CORS_ORIGINS`** (`pnpm dev:urls:portless`).

## CopilotKit AG-UI Inspector (development only)

`apps/ai` exposes a CopilotKit-compatible AG-UI debug stream at **`GET /ai/cpk-debug-events`** when `NODE_ENV !== "production"`. This is not the CopilotKit React runtime; it is a lightweight bridge so the CopilotKit VS Code **AG-UI Inspector** can watch Engenty's real run stream.

1. Start Engenty dev services.
2. Open the CopilotKit VS Code extension command **CopilotKit: Open AG-UI Inspector**.
3. Use runtime URL **`https://engenty.localhost/ai`** (or direct upstream **`https://ai.engenty.localhost/ai`**).
4. Trigger a copilot chat run.

The stream includes AG-UI lifecycle/message/tool/state events plus a debug-only `engenty.debug.run_context` custom event containing the resolved `tenantId`, `userId`, agent id, run id, state snapshot, and frontend tool registrations. Access tokens are never emitted.

## Env

Dotenv is loaded **before the server listens**: `apps/ai` package `.env*` merged with **repo root** `.env*` via `@engenty/environment/env` (`loadWorkspaceDotEnvIntoProcess`, same layering as `apps/core` — root `.env.local` wins).

- **`SUPABASE_URL`** + **`SUPABASE_SERVICE_ROLE_KEY`** — **required for product chat** (`POST /ai/threads`, runs, transcript hydrate). Without them, thread routes return **503** `agent_threads.unconfiguredDatabase`. Also enables usage and chat-search persistence in schema **`ai`** (see `supabase/migrations/*_core_ai_schema_agent_sessions.sql` and `*_ai_app_chat_search_index.sql`). Copy values from `pnpm supabase status` into repo-root `.env.local`.

- **`ENGENTY_CORE_BASE_URL`** — required for session auth scope resolution and core-backed agent tools; set via `pnpm dev:urls:portless` (typically `http://127.0.0.1:8787` with the dev gateway). `apps/ai` resolves tenant/user scope through core’s current workspace context and forwards the incoming end-user `Authorization: Bearer ...` token for core tool calls.
- **`AI_GATEWAY_API_KEY`** — required for `GET /ai/v1/sdk/stream-ping` through AI Gateway and enables LLM-assisted `engenty_tools_discover` ranking.
- **`OPENAI_API_KEY`** — required for Mastra agents using `openai/...` model ids.
- **`AI_CHAT_MODEL`** and **`AI_COORDINATOR_MODEL`** — optional process defaults when tenant settings from `/settings/ai` are not set. The Engenty Copilot supervisor uses the coordinator model; its worker tools agent uses the chat model.
- **`AI_GATEWAY_MODEL_SYNC_ENABLED`** — optional app-side scheduler toggle for refreshing the Gateway model catalog. The database settings row defaults to disabled so no committed migration needs an HTTP bearer token.
- **`AI_GATEWAY_MODEL_SYNC_INTERVAL_MS`**, **`AI_GATEWAY_MODEL_SYNC_RUN_ON_START`**, and **`AI_GATEWAY_MODEL_SYNC_UPDATE_PRICING`** — optional scheduler controls for cadence, startup sync, and whether Gateway rates insert new `ai.model_pricing` versions.

## Test

```bash
pnpm --filter @engenty/ai test
```

Uses `apps/ai/vitest.config.ts` with **`src/**/__tests__/**/*.test.ts`** (same co-located convention as `apps/core` and `packages/ai-core`).

## Routes

| Path | Description |
|------|-------------|
| `GET /ai/health` | Liveness JSON. |
| `GET /ai/v1/sdk/stream-ping` | Minimal **AI SDK** `streamText` → UI message stream (bypasses Mastra). |
| `POST /ai/threads` | Create or upsert **`ai.thread`** + owner participant. Requires `Authorization`. Body: `{ "agent_id": "engenty.copilot", "thread_id"?: uuid, "title"?: string, "summary"?: string, "status"?: "idle" | "running" | "waiting" | "failed" | "completed", "route_context"?: object, "workspace_key"?: string }`. Omit `thread_id` for a new server-assigned UUID. |
| `GET /ai/threads` | List threads the user participates in for the resolved tenant. Query: **`agent_id`** (optional), **`limit`** (default 50, max 200). |
| `GET /ai/threads/:threadId` | Get an owned thread with state fields (`route_context`, `status`, `summary`, `workspace_key`). |
| `PATCH /ai/threads/:threadId` | Update owned thread metadata/state (`agent_id`, `title`, `summary`, `status`, `route_context`, `workspace_key`). |
| `GET /ai/threads/:threadId/messages` | List transcript rows ordered by **`id`** (UUIDv7). Query: `limit` (default 500). |
| `POST /ai/threads/:threadId/messages` | Append a message (`role`, `parts` JSON). |
| `POST /ai/threads/:threadId/generate` | Enforce usage policy, load transcript, run the Mastra agent, persist the assistant text message, and record usage when the model returns token counts. |
| `POST /ai/v1/threads/:threadId/runs` | Stream an AG-UI run and record usage totals after the stream finishes successfully with model usage metadata. |
| `GET /ai/v1/usage/me` | Tenant-admin/superadmin current-tenant usage summary for the active period. |
| `GET /ai/v1/usage/tenant` | Tenant-admin/superadmin current-tenant usage summary with per-user breakdown. |
| `GET /ai/v1/usage/policy` | Tenant-admin/superadmin effective tenant usage policy. |
| `PATCH /ai/v1/usage/policy` | Tenant-admin/superadmin update for tenant-managed period fields (`period_mode`, `period_unit`, `period_anchor`). |
| `GET /ai/v1/gateway/models` | Superadmin Gateway model catalog with stable metadata from Vercel AI Gateway. |
| `POST /ai/v1/gateway/models/sync` | Superadmin manual Gateway catalog sync; optional `update_pricing` inserts changed pricing versions. |
| `GET /ai/v1/gateway/models/sync-runs` | Superadmin recent Gateway sync audit rows. |
| `GET /ai/v1/search-index/providers` | List `SearchIndexProvider`s visible to the caller (system providers superadmin-only). |
| `GET /ai/v1/search-index/providers/:id/status` | Provider `getStatus` proxied with caller tenant/user scope. Returns the unified `SearchIndexStatus` shape. |
| `POST /ai/v1/search-index/providers/:id/backfill` | Provider `backfill` proxied with caller scope. Body: `{ "limit"?: number, "force"?: boolean, "resume_after"?: string }`. |
| `POST /ai/v1/search-index/providers/:id/search` | Provider `search` proxied with caller scope. Body: `{ "query"?: string, "filters"?: object, "limit"?: number, "offset"?: number, "strategy"?: "hybrid" \| "lexical" \| "semantic" }`. Caller `tenant_id`/`user_id` always override request filters. |
| `DELETE /ai/threads` | Delete all threads the user owns or created for the tenant. Query: **`agent_id`** (optional). Cascades messages. |
| `DELETE /ai/threads/:threadId` | Delete thread (owner or creator). Cascades messages. |
| `POST /ai/agents/engenty.copilot/generate` | Mastra agent HTTP API (see [Mastra Hono guide](https://mastra.ai/guides/getting-started/hono)). |

Mastra’s OpenAPI UI (if enabled) lives under the same prefix, e.g. **`/ai/swagger-ui`**.

All service routes, including Mastra-generated routes, use the shared prefix **`/ai`** (`AI_BASE_PATH`) so this service can be reverse-proxied under one path on a shared host later.

## Usage Metering

Generation routes use `@engenty/ai-core` policy and metering helpers with an `apps/ai`-local ledger in schema **`ai`**. Before a model call, the harness checks tenant/user policy and model allow-lists; after successful generate and AG-UI stream runs with usage data, it records tenant/user/session/run/agent/model token counts and cost snapshots using the active model pricing row or shared fallback pricing. Period rollups are bumped through the `ai.bump_usage_period_total(...)` Postgres function so concurrent model calls increment totals atomically.

When the service starts with database env configured, `apps/ai` seeds the shared default model-pricing catalog into **`ai.model_pricing`** if a model has no pricing row yet. Later operator-managed pricing rows are preserved; the newest `valid_from` row wins during metering.

The Gateway catalog sync stores Vercel AI Gateway model metadata in **`ai.gateway_model`** and audit rows in **`ai.gateway_model_sync_run`**. The official Gateway API currently includes stable model names, descriptions, provider, type, tags, context windows, release timestamps, and pricing fields; latency, throughput, ZDR, and no-training stay nullable until a stable source exists.

The main UI settings page reads this service through `VITE_ENGENTY_AI_BASE_URL` at `/ai/v1/usage/*`. Usage settings are server-enforced for tenant admins and superadmins; normal tenant members receive `403`.

## Chat Search

Chat transcript search is service-local in `apps/ai`: reindexing reads `ai.thread` and `ai.thread_message`, writes `ai.agent_chat_search_document` / `ai.agent_chat_search_chunk`, and searches only rows owned by the resolved tenant/user scope. The main UI calls these routes through `VITE_ENGENTY_AI_BASE_URL`; the old core `/api/ai/search/chats/*` route surface is no longer registered.

## Monorepo

- Package name: `@engenty/ai`
- **Mastra** agents and `Mastra` instance: `apps/ai/ai/` (not under `src/`)
- Scripts: root `pnpm dev:ai` (turbo dev for this app only), `pnpm mastra:studio`

## Main UI (`modules/engenty-copilot`)

The **Engenty AI** copilot routes **`/module/engenty-copilot/chat/new`** and **`/module/engenty-copilot/chat/:sessionId`** call this HTTP API from the browser. Configure **repo-root** `.env.local` for Vite:

- **`VITE_ENGENTY_AI_BASE_URL`** — base URL of this service with **no** trailing slash (e.g. `https://ai.engenty.localhost` from `pnpm dev:urls:portless`). Documented in [apps/ui README](../../apps/ui/README.md), [docs/dev/quick-start.md](../../docs/dev/quick-start.md), and `apps/ui/.env.example`.
