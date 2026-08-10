---
title: Local development
description: Clone, install, and run the Engenty stack locally.
---

# Local development

## Prerequisites

- **Node** ≥ 24.11 (an `.nvmrc` pins the exact version)
- **pnpm** 10.x
- **A container runtime** — Docker Desktop, [OrbStack](https://orbstack.dev), or [Dory](https://augani.github.io/dory) — for local Supabase (Postgres + auth). `pnpm dev` prompts for your pick on first run (see [Setup process](../setup-process#choosing-a-container-runtime)).
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

**Add a workspace module:** `pnpm engenty plugins install <slug>` (or copy from legacy, then install)

**Full local reset:** `pnpm purge` (or `pnpm purge:light` — skips `node_modules`, faster) — then run the first-clone flow above.

Do **not** commit generated local artifacts. Run **`pnpm engenty setup`** after clone or when **`engenty.plugins`** changes.

For how the setup machinery works (what `engenty setup` regenerates, the CLI
bootstrap, Docker/Supabase on demand, env init), see **[Setup process](../setup-process)**.
For the plugin model and lifecycle commands, see **[Plugin framework](../plugins)**.

## Run

```bash
pnpm dev
```

`pnpm dev` runs **`dev:check`** (Docker, Supabase, generated artifacts) and **`predev`** (build workspace packages/modules, regenerate UI plugin artifacts). You do not need a separate `pnpm build` before local dev.

This starts core, UI (Vite), AI, and docs together. **Mastra Studio is not among
them** — it is opt-in, because it is a second dev server most runs never look at:

```bash
pnpm dev:studio                              # instead of pnpm dev
pnpm dev:portless --domain=<name> --studio   # with Portless
```

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
pnpm portless             # each session — HTTPS proxy on :443 (sudo, Terminal.app)
pnpm dev:portless         # env sync, routes, dev stack (+ ready URL announcer)
```

See [Portless local URLs](../../../dev/portless-local-urls.md) for worktrees, env URLs, and
troubleshooting (`pnpm portless:proxy:check`, loopback `ENGENTY_CORE_BASE_URL`, …).

## The Supabase stack: lean by default

`supabase start` brings up around a dozen containers, and the two heaviest at idle are
not the database:

| | why it costs | flag |
|---|---|---|
| **Supabase Studio** | the table-browser UI, plus the gateway traffic its polling generates | `--studio` |
| **Logflare + Vector** | the log pipeline behind Studio's *Logs* tab: Vector tails **every** container's logs through the Docker API and ships them to Logflare, which writes them into Postgres | `--logs` |

Together they measured well over ten times the database's own idle CPU. Both are off by
default, so start the stack with `db:up` and add what you actually want:

```bash
pnpm db:up                   # lean
pnpm db:up --studio          # + Supabase Studio
pnpm db:up --logs            # + log pipeline
pnpm db:up --studio --logs   # everything
```

The flags are not passed to the Supabase CLI (it has none) — they set `enabled` under
`[studio]` / `[analytics]` in your local `supabase/config.toml`, which is read at start.
So **stop the stack first** (`pnpm supabase:stop`) if it is already running. Vector has no
flag of its own: it exists only to feed Logflare, so `--logs` covers both.

Why this matters beyond tidiness: **the failure mode is disguised.** Run two or three
worktree stacks at once and the machine saturates — auth stops answering within its
timeout and the app reports `Unauthorized`, PostgREST returns 504s, and `docker stats`
itself hangs. If Postgres shows an idle `pg_stat_activity` while everything times out, the
problem is the container runtime, not the app.

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
