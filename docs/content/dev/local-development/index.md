---
title: Local development
description: Clone, install, and run the Engenty stack locally.
---

# Local development

## Prerequisites

- **Node** ≥ 24.11 (an `.nvmrc` pins the exact version)
- **pnpm** 10.x
- **Docker** — local Supabase (Postgres + auth)
- **[Supabase CLI](https://supabase.com/docs/guides/cli)**

## Setup

**First clone**

```bash
pnpm install
pnpm engenty setup --local   # plugins (interactive) + Supabase + migrations + .env.local
pnpm dev
```

**Daily:** `pnpm dev`

**Module or SQL changed:** `pnpm engenty setup && pnpm db:migrate && pnpm dev`

**Add a workspace module:** `pnpm engenty plugins enable <slug>` (or copy from legacy, then enable)

**Full local reset:** `pnpm purge` (or `pnpm purge:light` — skips `node_modules`, faster) — then run the first-clone flow above.

Do **not** commit generated local artifacts. Run **`pnpm engenty setup`** after clone or when **`engenty.plugins`** changes.

## Run

```bash
pnpm dev
```

`pnpm dev` runs **`dev:check`** (Docker, Supabase, generated artifacts) and **`predev`** (build workspace packages/modules, regenerate UI plugin artifacts). You do not need a separate `pnpm build` before local dev.

This starts core, UI (Vite), AI, and docs together.

**Open [http://localhost:5173](http://localhost:5173)** — the Vite dev server serves
the UI with hot reload. `/api`, `/ai`, and `/docs` are proxied to the other apps on
the same origin.

On first visit you are redirected to `/initial_setup` to create the admin user and
tenant.

### Optional: HTTPS via Portless

For production-like URLs (`https://engenty.localhost`), see
[Portless local URLs](../../../dev/portless-local-urls.md) — recommended for daily
dev if you already use Portless, but not required for contributors.

```bash
pnpm portless:setup       # once
pnpm portless             # each session, before pnpm dev
pnpm dev
```

## Dev origins

Use one browser origin consistently — Supabase sessions and `VITE_ENGENTY_AI_BASE_URL`
are keyed to it.

| Origin | When |
|--------|------|
| `http://localhost:5173` | Default; Playwright, headless, no TLS setup |
| `https://engenty.localhost` | Portless + core dev gateway |

Sync env after switching:

```bash
pnpm dev:urls:localhost   # default
pnpm dev:urls:portless    # Portless
```

## Build & test

```bash
pnpm build
pnpm test
pnpm typecheck
pnpm check
```

## Signing in for tests & automation

For headless and preview browsers, the app provides a secret-less, local-only
login route. See **[Agent login](./agent-login)** for how it works, the required
`.env.local`, and the security gates that disable it in production.
