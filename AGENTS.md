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
| `modules/*` | Installable feature modules (open base: `engenty-copilot`) |

Core apps and packages must not depend on optional modules — use plugin hooks, events, and gateway methods instead.

## Core commands

```bash
pnpm install
pnpm dev          # full stack (UI :5173, core :8787, AI :8790, Supabase)
pnpm build
pnpm typecheck
pnpm test
pnpm check        # lint + format check
pnpm fix          # auto-fix
```

- **Portless (optional):** `pnpm portless:setup`, `pnpm portless:trust`, `pnpm portless:env:sync` — see [portless-local-urls.md](./docs/dev/portless-local-urls.md)
- **Env setup:** `pnpm env:setup` (wizard), `pnpm env:check` — `.env.example` is generated; do not edit by hand
- **Scoped:** `pnpm --filter @engenty/<name> build|test|dev`
- **Mastra Studio:** `pnpm mastra:studio` (start `pnpm dev:ai` first)

Default dev URL: `http://localhost:5173` (Vite proxies `/api` and `/ai`). Portless HTTPS: `https://engenty.localhost`.

## Browser verification

- **Headless / Playwright:** always `http://localhost:5173`
- **Claude Code preview / system-trusted cert:** `https://engenty.localhost` when Portless is running
- **Agent login:** `/auth/agent-login` on the origin you test (requires `ENGENTY_DEV_PASS`, non-prod)
- Sessions are per-origin — log in on the origin you actually load
- Full stack must be running (`pnpm dev`) before browser tests

## Module contract

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

## UI and i18n

- **Visual design (primary):** [DESIGN.md](./DESIGN.md) — tokens, shell, tables, elevation. Outranks shadcn defaults.
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

No new `@supabase/supabase-js` imports outside approved adapter locations. Run `pnpm check:supabase-imports`.

## File size

If a file exceeds ~250 lines and mixes concerns, split before adding features.

## PR checklist

```bash
pnpm build && pnpm typecheck && pnpm check && pnpm test
```

- Module wiring: `engenty.plugin.json` + UI plugin in catalog
- ui-core changes: `pnpm check:ui-core-imports` + `pnpm --filter @engenty/ui-core build`
- Locale changes: both `en.json` and `de.json`
- DB schema: module migration + `pnpm migrations:aggregate`
- AI manifests: `pnpm ai:check`

## On-demand rules

Full index: [docs/agent/README.md](./docs/agent/README.md). Pick **one** rule per task — do not paste all rules into context.

## Preferences

- Keep this file summary-level; deep detail lives in `docs/agent/rules/` and `DESIGN.md`
- `engenty.UI` (not `engentyUI`) for plugin registration
- Compact UI — avoid unnecessary padding and boxed wrappers around sidebar areas
- No fallback code to pass tests — fix properly or let it break
