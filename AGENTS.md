# Engenty Development Instructions

Default guide for contributors and coding agents in this repository.

- Active development — no production data yet; no fallback or stranded code
- **Biome** for lint/format — run `pnpm fix` at the end of tasks
- **Tests** — follow [testing-policy.mdc](./docs/agent/rules/testing-policy.mdc) before writing any test; run `pnpm test`
- **Agent rules:** canonical content lives in [`docs/agent/rules/`](./docs/agent/rules/). Cursor symlinks them under `.cursor/rules/`. Claude reads this file + linked rules. Load a rule when the task matches its description — do not load everything every turn.

## Chat with the User / Developer

- give short - less verbose answers
- don't invent tech speech - we do not already use in our project
- prefer bullet points and tables
- use mermaid if helpful
- don't add low confidence - "here is one more thing ..." at the 
- unless prompted, stay on one task at a time
- don't trust your memory on architectural questions - we shifted concepts over time - expect contradictions, we need to clean up
- clean up past - outdated memory - and point it to the user if you are confused

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
| `modules/*` | Installable feature modules — activated via root `engenty.plugins` (currently: company-profile, connections, contacts, engenty-copilot, files, inbox, knowledge-base, projects, tasks, team, time-tracking). Connector providers are nested workspace plugins under `modules/connections/providers/*` (google, microsoft, slack) yet keep flat slugs (`connections-google`, …) in `engenty.plugins`. |

Core apps and packages must not depend on optional modules — use plugin hooks, events, and gateway methods instead.

## Core commands

```bash
npx engenty start        # no checkout: run engenty on this machine (own Supabase + prebuilt images) in ~/.engenty
npx engenty create <dir> # no checkout yet: prerequisites → clone at this release → pnpm install → its engenty setup
pnpm install
pnpm engenty setup     # first run (repeatable): pick plugins + generate + Supabase + migrations + .env.local
pnpm dev                 # = engenty dev: preflight + build + full stack (UI :5173, core :8787, AI :8790)
pnpm engenty doctor      # read-only: what state is this checkout in
pnpm build
pnpm typecheck
pnpm test
pnpm check               # lint + format check
pnpm fix                 # auto-fix
```

CLI entry point: **`pnpm engenty …`** (same as `pnpm --filter @engenty/core exec tsx src/index.ts`). The command implementations live in `packages/cli` (`@engenty/cli`, published to npm as `engenty` on each release tag); `apps/core/src/cli.ts` registers them plus the runtime-bound commands (auth, tools, skills, service-token, plugin-registered). `npx engenty …` inside a checkout delegates to `pnpm engenty …`; outside it offers `start`/`status`/`stop`/`update` (a managed install in `~/.engenty`), `create`, `deploy`, `deploy migrate`, `doctor`, `env set` — see [setup-process.md](./docs/content/dev/setup-process.md#npx-engenty).

**Commit messages:** use `type(scope): subject`, with the scope naming the mainly affected module, package, or app (for example `fix(time-tracking): …`, `feat(ai-core): …`, or `docs(ui): …`). Use `global` for genuinely repository-wide changes. Infrastructure scopes such as `ci`, `deploy`, and `release` are also valid. Do not omit the scope.

**Developing & releasing:** pick a work mode (main / branch / worktree / worktree + dedicated DB) and ship the one correct way — see the [`release` skill](./.claude/skills/release/SKILL.md) (`/release`). TL;DR: land on `main`, then `pnpm release` + `git push origin main --follow-tags` (the `v*` tag builds, deploys, and syncs the public repo; a plain `main` push runs CI only). Never hand-edit `CHANGELOG.md` / `changelog.json` / the version / tags.

- **First run:** `pnpm engenty setup` — prompts for plugins, generates derived files, starts Supabase, applies migrations, initializes `.env.local` (each step skippable; non-interactive takes the default; `--yes-reset-db` is the only way a non-TTY run may `db reset`). No dev-stack preflight — that lives in `engenty dev`
- **Generate:** `pnpm engenty generate` — regenerate config.toml, the migrations aggregate, the UI catalog and UI deps from **`engenty.plugins`**. Never touches Docker, the DB or env
- **Dev:** `pnpm dev` (= `pnpm engenty dev`) — preflight (`scripts/predev-check.sh`: Docker, Supabase, migrations, generated files, stale ports) → build packages/modules → core + ui + ai + docs. `--portless`, `--domain=<name>`, `--studio`, `--no-preflight`
- **Doctor:** `pnpm engenty doctor` — read-only local checks with the fix for each; `--remote` (or `--url`) checks a Supabase deployment's exposed schemas + access-token hook
- **Plugin manifest:** `pnpm engenty plugins install|uninstall|list` (`pnpm engenty install <slug>` is the shorthand) — root `package.json` → `engenty.plugins` is the SSOT (in-repo by slug; external packages by spec)
- **Local DB:** `pnpm engenty db up|down|status|restart|migrate|reset|snapshot|restore`. `up` is lean by default; `--studio` adds Supabase Studio, `--logs` adds the Logflare/Vector pipeline. Both cost far more idle CPU than Postgres itself, and several stacks at once saturate the host — which surfaces as bogus `Unauthorized` from auth, not as slowness. Stop the stack before changing the flags (they are written into `supabase/config.toml`). `migrate` and `reset` include Mastra's schema
- **Local env:** `pnpm engenty env` (menu), `pnpm engenty env init`, `pnpm engenty env check`, `pnpm dev:urls:localhost` — root `.env.local` only (not Docker/deploy)
- **Deploy:** `pnpm engenty deploy` (wizard, `--dry-run`; works in `deploy/`), `pnpm engenty deploy migrate` (push aggregated migrations to the linked project). From anywhere: `npx engenty deploy` works in `./engenty-deploy/` and `npx engenty deploy migrate` uses `SUPABASE_DB_URL` + the release's baked migrations. Deploy env: copy `deploy/.env.example` → `deploy/.env` manually; `engenty env check --scope deploy`. The Supabase CLI pin lives in `packages/cli/src/supabase-cli-version.ts` (`pnpm check:supabase-pin`)
- **Portless (required for agent preview):** `pnpm portless:setup`, `pnpm portless:trust`, `pnpm portless` (sudo proxy), `pnpm dev:portless`, `pnpm dev:portless --domain=<name>`, `pnpm dev:urls:portless` — see [portless-local-urls.md](./docs/dev/portless-local-urls.md)
- **Starting a dev server as Claude Code** (worktree or main, `preview_start`/`launch.json`, first-run `pnpm engenty setup`, the `.localhost` URL): see the [`dev-server` skill](./.claude/skills/dev-server/SKILL.md) — a new worktree needs `install` run once before `dev:portless` works (config.toml + generated UI catalog are gitignored)
- **Manifest / CI:** `pnpm env:example:write`, `pnpm env:example:check` — regenerate committed `.env.example` files
- **Clean caches:** `pnpm clean` — remove `node_modules`, `dist`, Turbo/Next caches (then `pnpm install`)
- **Full local reset:** `pnpm engenty reset` — or `--light` (keeps `node_modules`), `--db` (also wipes the local database), `--yes --quiet` for scripted runs
- **Gone (do not use):** `setup --local`, `engenty init`, the old file-only `engenty setup` (now `generate`), `db init`, `db sync`, `db mastra-init`, and the `pnpm db:*`, `supabase:*`, `dev:env*`, `dev:check`, `purge*`, `setup` package.json aliases
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

**Activation (SSOT):** root `package.json` → `engenty.plugins` — object map (`{ "slug": { "source": "workspace" } }`), pi-style. This is the **product manifest**, not app wiring. Folders under `modules/` can exist without being active. **`pnpm engenty plugins install <slug>`** is the only sanctioned way to activate a module: it adds the `engenty.plugins` entry **and** runs `engenty generate` (supabase compose → `config.toml` exposed schemas + buckets, migration aggregation, UI catalog gen, `apps/ui` dep sync) + `pnpm install`. Add `--db-migrate --db-restart` to also apply migrations locally. Do **not** hand-edit the `engenty.plugins` map, `apps/ui/package.json`, `apps/ai/package.json`, or `apps/core` imports to enable modules. **Gotcha:** if the slug is already in `engenty.plugins`, `install` early-returns and **skips generate** — so a hand-added entry leaves the derived files stale; back the entry out and re-run `install` to repair, or run `pnpm engenty generate`. (Modules with UI are loaded via the generated catalog's dynamic `import()` through pnpm root symlinks — they are correctly **absent** from `apps/ui/package.json` deps.)

| Layer | Committed? | Who sets it |
|-------|------------|-------------|
| `engenty.plugins` | yes | you / `engenty plugins install` |
| `modules/<slug>/` source | yes | git |
| `apps/ui` `@engenty/*` module deps | generate sync only | `engenty generate` — never manual |
| Supabase + UI generated artifacts | no (gitignored) | `engenty generate` |

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
- Work nouns (specialist, workflow, routine, run, task, goal): [work-model.md](./docs/content/dev/work-model.md) — canonical; do not restate the model elsewhere, link it
- Spaces runtime contract: [spaces-runtime.md](./docs/agent/spaces-runtime.md) — canonical tenant/Space, catalog/evidence, and record-scope semantics
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

## Testing

Fewer, stronger tests. Read [testing-policy.mdc](./docs/agent/rules/testing-policy.mdc) before adding one.

- Tautological tests and change-detector tests are defects — do not write them
- Expected values come from the requirement, never from reading the implementation
- Isolated test: list the ways it can fail **first**, then write the code
- Bug fix: no regression test unless no existing test could have caught the bug
- Whole features (UI → API → DB): prove them with an E2E spec in `e2e/smoke/`
- Cleaning up existing tests: `prune-tests` skill

## PR checklist

```bash
pnpm build && pnpm typecheck && pnpm check && pnpm test
```

- Module wiring: `engenty.plugin.json` + UI plugin in catalog
- ui-core changes: `pnpm check:ui-core-imports` + `pnpm --filter @engenty/ui-core build`
- Locale changes: both `en.json` and `de.json`
- DB schema: module migration + `pnpm engenty generate` + `pnpm engenty db migrate`
- AI manifests: `pnpm ai:check`

## On-demand rules

Full index: [docs/agent/README.md](./docs/agent/README.md). Pick **one** rule per task — do not paste all rules into context.

## Preferences

- Keep this file summary-level; deep detail lives in `docs/agent/` (`DESIGN.md`, `rules/`)
- `engenty.UI` (not `engentyUI`) for plugin registration
- Compact UI — avoid unnecessary padding and boxed wrappers around sidebar areas
- No fallback code to pass tests — fix properly or let it break
