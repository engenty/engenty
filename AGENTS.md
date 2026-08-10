# Engenty Development Instructions

Default guide for contributors and coding agents in this repository.

- Active development — no production data yet; no fallback or stranded code
- **Biome** for lint/format — run `pnpm fix` at the end of tasks
- **Vitest** — add tests and run `pnpm test`
- **Agent rules:** canonical content lives in [`docs/agent/rules/`](./docs/agent/rules/). Cursor symlinks them under `.cursor/rules/`. Claude reads this file + linked rules. Load a rule when the task matches its description — do not load everything every turn.

## Environment

- Package manager: `pnpm` (`pnpm@10.23.0`)
- Node.js: `>=24.11.0` (see `.nvmrc`)
- Monorepo: `apps/*`, `packages/*`, `modules/*`

## Codebase map (open base)

| Path | Role |
|------|------|
| `apps/core` | Hono backend, plugin host — **must not import `modules/*`** |
| `apps/ui` | React frontend, UI plugin catalog |
| `apps/ai` | Agent runtime (Mastra + AG-UI) |
| `apps/docs` | Documentation site (Fumadocs) |
| `packages/*` | Shared libraries (`ui-core`, `plugin-sdk`, `ai-core`, …) |
| `modules/*` | Installable feature modules — activated via root `engenty.plugins` (currently: company-profile, connections, contacts, engenty-coordinator, engenty-copilot, files, inbox, knowledge-base, projects, tasks, team, time-tracking). Connector providers are nested workspace plugins under `modules/connections/providers/*` (google, microsoft, slack) yet keep flat slugs (`connections-google`, …) in `engenty.plugins`. |

Core apps and packages must not depend on optional modules — use plugin hooks, events, and gateway methods instead.

## Core commands

```bash
pnpm install
pnpm engenty setup --local   # first run: pick plugins + Supabase + migrations + .env.local
pnpm dev                     # dev:check + predev + full stack (UI :5173, core :8787, AI :8790)
pnpm build
pnpm typecheck
pnpm test
pnpm check               # lint + format check
pnpm fix                 # auto-fix
```

CLI entry point: **`pnpm engenty …`** (same as `pnpm --filter @engenty/core exec tsx src/index.ts`).

**Developing & releasing:** pick a work mode (main / branch / worktree / worktree + dedicated DB) and ship the one correct way — see the [`release` skill](./.claude/skills/release/SKILL.md) (`/release`). TL;DR: land on `main`, then `pnpm release` + `git push origin main --follow-tags` (the `v*` tag builds, deploys, and syncs the public repo; a plain `main` push runs CI only). Never hand-edit `CHANGELOG.md` / `changelog.json` / the version / tags.

- **Local setup:** `pnpm engenty setup` — compose config.toml, migrations aggregate, UI catalog from **`engenty.plugins`**
- **First clone:** `pnpm engenty setup --local` — prompts for plugins, composes artifacts, starts Supabase, applies migrations, initializes `.env.local` (each step skippable; non-interactive takes the default)
- **Plugin manifest:** `pnpm engenty plugins install|uninstall|list` — root `package.json` → `engenty.plugins` is the SSOT (in-repo by slug; external packages by spec)
- **Local DB:** `pnpm db:init` (fresh), `pnpm db:migrate`, `pnpm db:reset`, `pnpm db:snapshot`, `pnpm db:restore` — thin aliases for `engenty db *`
- **Starting the Supabase stack:** `pnpm db:up` — lean by default; `--studio` adds Supabase Studio, `--logs` adds the Logflare/Vector pipeline. Both cost far more idle CPU than Postgres itself, and several stacks at once saturate the host — which surfaces as bogus `Unauthorized` from auth, not as slowness. Stop the stack before changing the flags (they are written into `supabase/config.toml`)
- **Local env:** `pnpm dev:env` (menu), `pnpm dev:env:init`, `pnpm dev:env:check`, `pnpm dev:urls:localhost` — root `.env.local` only (not Docker/deploy)
- **Deploy env:** copy `deploy/.env.example` → `deploy/.env` manually; `engenty env check --scope deploy`
- **Portless (required for agent preview):** `pnpm portless:setup`, `pnpm portless:trust`, `pnpm portless` (sudo proxy), `pnpm dev:portless`, `pnpm dev:portless --domain=<name>`, `pnpm dev:urls:portless` — see [portless-local-urls.md](./docs/dev/portless-local-urls.md)
- **Starting a dev server as Claude Code** (worktree or main, `preview_start`/`launch.json`, first-run `pnpm engenty setup --local`, the `.localhost` URL): see the [`dev-server` skill](./.claude/skills/dev-server/SKILL.md) — a new worktree needs setup run once before `dev:portless` works (config.toml + generated UI catalog are gitignored)
- **Manifest / CI:** `pnpm env:example:write`, `pnpm env:example:check` — regenerate committed `.env.example` files
- **Clean caches:** `pnpm clean` — remove `node_modules`, `dist`, Turbo/Next caches (then `pnpm install`)
- **Full local reset:** `pnpm purge` — or `pnpm purge:light` (env + generated setup + caches, keeps `node_modules`); `pnpm purge -- --yes --quiet` for scripted full purge
- **Scoped:** `pnpm --filter @engenty/<name> build|test|dev`

Human/CLI Vite URL: `http://localhost:5173` (proxies `/api` and `/ai`). **Agent preview:** Portless HTTPS only — main `https://engenty.localhost`, worktree `https://<name>.engenty.localhost`.

## Browser verification

- **Cursor browser / interactive agent preview:** always Portless — `https://engenty.localhost` (main) or `https://<name>.engenty.localhost` (worktree). Do **not** use `http://localhost:5173`.
- **Headless / Playwright:** Portless with CA trust or `ignoreHTTPSErrors`; loopback `http://localhost:<ENGENTY_UI_PORT>` only when e2e docs require it. Smoke suite: `pnpm test:smoke` (e2e/smoke, needs the dev stack).
- **Agent login:** `/auth/agent-login` on the **same Portless origin** you test (requires `ENGENTY_DEV_PASS`, non-prod)
- Sessions are per-origin — a `localhost` login does not apply to `*.engenty.localhost`
- Full stack + `pnpm portless` must be running before browser tests
- Workspace rule detail: `/code/engenty/AGENTS.md` → Worktree workflow + Agent login

## Module contract

**Activation (SSOT):** root `package.json` → `engenty.plugins` — object map (`{ "slug": { "source": "workspace" } }`), pi-style. This is the **product manifest**, not app wiring. Folders under `modules/` can exist without being active. **`pnpm engenty plugins install <slug>`** is the only sanctioned way to activate a module: it adds the `engenty.plugins` entry **and** runs `engenty setup` (supabase compose → `config.toml` exposed schemas + buckets, migration aggregation, UI catalog gen, `apps/ui` dep sync) + `pnpm install`. Add `--db-migrate --db-restart` to also apply migrations locally. Do **not** hand-edit the `engenty.plugins` map, `apps/ui/package.json`, `apps/ai/package.json`, or `apps/core` imports to enable modules. **Gotcha:** if the slug is already in `engenty.plugins`, `install` early-returns and **skips setup** — so a hand-added entry leaves setup un-run; back the entry out and re-run `install` to repair. (Modules with UI are loaded via the generated catalog's dynamic `import()` through pnpm root symlinks — they are correctly **absent** from `apps/ui/package.json` deps.)

| Layer | Committed? | Who sets it |
|-------|------------|-------------|
| `engenty.plugins` | yes | you / `engenty plugins install` |
| `modules/<slug>/` source | yes | git |
| `apps/ui` `@engenty/*` module deps | setup sync only | `engenty setup` — never manual |
| Supabase + UI generated artifacts | no (gitignored) | `engenty setup` |

Each `modules/<name>` follows:

- `src/plugin.ts` — backend `EngentyPluginFactory`
- `src/dal/*`, `src/api/`, `src/schema/{types,zod}.ts`
- `ui/plugin.ts`, `ui/pages/*`, `ui/locales/{en,de}.json`
- Optional `ai/` — see `packages/ai-core/docs/howto-define-module-ai.md`
- `engenty.plugin.json` — canonical manifest
- Migrations in `modules/<name>/supabase/migrations/` — see [module-migrations.mdc](./docs/agent/rules/module-migrations.mdc)

Route pattern: list `/module/<name>`, detail `/:id`, edit `/:id/edit`.

## Tool and operation IDs

Strict lowercase snake_case: `^[a-z0-9_]{1,64}$` (e.g. `shell_set_theme`). Use `@engenty/plugin-sdk` helpers. HTTP: `POST /api/tools/<id>/invoke`.

## API / schema

- Backend payloads and DB columns: `snake_case` — no UI camelCase remapping layers
- Zod validation on route handlers
- Single source of truth: `src/schema/types.ts` + `src/schema/zod.ts`

## AI runtime & chat UI

- Product chat: **AG-UI** on `apps/ai` via `@engenty/ai-ui` — not Vercel AI SDK `useChat`
- Models / env: [ai-gateway.mdc](./docs/agent/rules/ai-gateway.mdc), `packages/ai-core/docs/howto-ai-config.md`
- Chat primitives: [ai-elements.mdc](./docs/agent/rules/ai-elements.mdc)

## Sandbox doctrine (decided 2026-08-03)

Two runtimes, one job each — do not add a third:

- **Agent execution = Docker sandbox** (`apps/ai/src/ai/sandbox/`, image `deploy/Dockerfile.sandbox`). Everything an agent runs — workspace EXECUTE_COMMAND, Code Mode, future repo checkouts — goes here.
- **Tenant Apps = agentOS** (`apps/app-host`). Platform-built Apps run here, never in the agent sandbox.

The Gondolin micro-VM tier was **deleted** (recoverable from git history pre-2026-08-03). Adding another provider/isolation tier is a doctrine change requiring an explicit decision, not a config option. The hosted coder (`feat/coder`, parked — see `PLAN-coder-merge.md` on that branch) targets the Docker sandbox.

## UI and i18n

- **Visual design (primary):** [DESIGN.md](./docs/agent/DESIGN.md) — tokens, shell, tables, elevation. Outranks shadcn defaults.
- **Flow / composition:** [list-detail-edit-ui-conventions.mdc](./docs/agent/rules/list-detail-edit-ui-conventions.mdc), [settings-form-section-ui.mdc](./docs/agent/rules/settings-form-section-ui.mdc)
- **ui-core / shadcn:** [ui-components.mdc](./docs/agent/rules/ui-components.mdc) — run `pnpm check:ui-core-imports` after edits
- **Card surfaces:** use `.ui-canvas-elevated`, `.ui-canvas-raised`, `.ui-canvas-panel` — never hand-rolled borders/shadows
- Import UI from `@engenty/ui-core` only — not `apps/ui/src/components/ui`
- Module i18n: namespace in `ui/plugin.ts`, `en` + `de` locales; namespaced `labelKey` — [module-menu-i18n.mdc](./docs/agent/rules/module-menu-i18n.mdc)

## TanStack Query

Use `@engenty/query-client` (`useQuery`, `useMutation`, `useInfiniteQuery`). No manual `useEffect` + fetch for server data.

## Logging

`createLogger` from `@engenty/telemetry` — no `console.log` in app/CLI code.

## Backend adapters

No new `@supabase/supabase-js` imports outside approved adapter locations (DAL/adapter directories such as `src/dal/*`, `apps/core/src/identity|storage/*`). Type-only imports of `SupabaseClient` are fine anywhere. Run `pnpm check:supabase-imports` to verify.

## Tenant isolation (Phase A — the database is the wall)

The server lane runs as the `engenty_server` Postgres role (NOBYPASSRLS): every
query is confined to the caller's tenant by the `srv_tenant_isolation` policies,
whether or not the code filters correctly.

- **Tenant work uses `server.getTenantDb(auth)`** — a tenant-locked client per
  request. Keep the explicit `.eq("tenant_id", …)` filters as the belt.
- **`server.getServiceDb()` bypasses RLS** and is only for (1) reads that must
  run before tenancy is known and ARE the tenant resolution (webhook id+secret,
  OAuth state nonce, portal/pairing tokens, cross-tenant boot replays), or
  (2) platform-level stores with no tenant_id. Every call site carries an
  in-place comment naming which shape it is.
- **Every new table with `tenant_id`** ships grants + the policy pair for
  `engenty_server` (template in `docs/agent/rules/module-migrations.mdc`).
  Never call `auth.jwt()`/`auth.uid()` in policies — use the `core.*` helpers.
- Guards: `pnpm check:server-lane-coverage`, `pnpm check:leak-harness` (live
  DB), `pnpm check:foreign-schema-scope`, `pnpm check:supabase-imports` (CI).

## File size

If a file exceeds ~250 lines and mixes concerns, split before adding features.

## PR checklist

```bash
pnpm build && pnpm typecheck && pnpm check && pnpm test
```

- Module wiring: `engenty.plugin.json` + UI plugin in catalog
- ui-core changes: `pnpm check:ui-core-imports` + `pnpm --filter @engenty/ui-core build`
- Locale changes: both `en.json` and `de.json`
- DB schema: module migration + `pnpm engenty setup` (or `engenty db sync`)
- AI manifests: `pnpm ai:check`

## On-demand rules

Full index: [docs/agent/README.md](./docs/agent/README.md). Pick **one** rule per task — do not paste all rules into context.

## Preferences

- Keep this file summary-level; deep detail lives in `docs/agent/` (`DESIGN.md`, `rules/`)
- `engenty.UI` (not `engentyUI`) for plugin registration
- Compact UI — avoid unnecessary padding and boxed wrappers around sidebar areas
- No fallback code to pass tests — fix properly or let it break
