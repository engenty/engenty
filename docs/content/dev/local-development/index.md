---
title: Local development
description: Clone, install, and run the Engenty stack locally.
---

# Local development

## Prerequisites

Skip any step you already have.

```bash
git clone https://github.com/engenty/engenty.git
cd engenty

# Node 22.18+ — 24 is what CI and the deploy images run (.nvmrc pins v24.14.0)
nvm install
nvm use
corepack enable          # once per machine — pnpm 10.23 from package.json
```

**Container engine** so `docker info` succeeds:

- **macOS** — Docker Desktop is what engenty is developed against; [OrbStack](https://orbstack.dev) works too, and [Dory](https://augani.github.io/dory) is wired up but untested. If the daemon is already running, that is enough. If it is not, `pnpm dev` can auto-start the app you pick (saved to gitignored `.engenty/container-runtime`).
- **Linux** — Docker Engine or any Docker-compatible daemon. If it is already running, you are done; there is no macOS-app prompt.

The **Supabase CLI** is a workspace dependency. `pnpm install` vendors it — do not install it separately.

## Setup

**First clone**

```bash
pnpm install
pnpm engenty setup   # plugins + generated files + Supabase + migrations + .env.local
pnpm dev
```

`engenty setup` is the first run and is safe to repeat: every step checks what
is already there. It does no dev-stack preflight; that is `pnpm dev`'s job.

**Daily:** `pnpm dev`

**Not sure what state the checkout is in:** `pnpm engenty doctor` — read-only, one line per check with the command that fixes it.

**Module or SQL changed:** `pnpm engenty generate && pnpm engenty db migrate && pnpm dev`

**Add a workspace module:** `pnpm engenty plugins install <slug>` (or copy from legacy, then install)

**Full local reset:** `pnpm engenty reset` (`--light` keeps `node_modules`; `--db` also wipes the local database) — then run the first-clone flow above.

Do **not** commit generated local artifacts. Run **`pnpm engenty generate`** when **`engenty.plugins`** changes.

For what each command does (what `engenty generate` regenerates, the CLI
bootstrap, Docker/Supabase on demand, env init), see **[Setup process](../setup-process)**.
For the plugin model and lifecycle commands, see **[Plugin framework](../plugins)**.

## Run

```bash
pnpm dev
```

`pnpm dev` is `pnpm engenty dev`: the preflight (Docker, the Supabase stack and
its health, pending migrations, generated files, stale dev ports), then a build
of the workspace packages and modules, then the dev servers. You do not need a
separate `pnpm build` before local dev. `--no-preflight` skips the first part.

This starts core, UI (Vite), AI, and docs together. **Mastra Studio is not among
them** — it is opt-in, because it is a second dev server most runs never look at:

```bash
pnpm dev --studio                            # instead of pnpm dev
pnpm dev:portless --domain=<name> --studio   # with Portless
```

Studio talks to Mastra's own REST API (`/ai/agents`, `/ai/workflows`,
`/ai/memory/*`, …), which **apps/ai does not mount unless you ask for it.** Those
routes authenticate nothing — Mastra gates them only when `server.experimental_auth`
is configured — and nothing in this product calls them, so they stay off. The
`--studio` flags above set `ENGENTY_MASTRA_STUDIO_API=1` for you; production ignores
the variable entirely. If you hit a `/ai/...` route that 404s and you expected Mastra
to serve it, that is why — see `apps/ai/src/config/mastra-studio-api.ts`.

Studio lists only the two static Mastra agents (Copilot, Scheduler) until a tenant
is pinned. Set `ENGENTY_STUDIO_TENANT_ID` in `.env.local` for a local install, or
open **Profile settings** (developer mode) → **Activate tenant in Studio**. That
registers that tenant’s specialists and opens `/studio` with your session token.
The env pin is ignored in production.

**Open [http://localhost:5173](http://localhost:5173)** — the Vite dev server serves
the UI with hot reload. `/api`, `/ai`, and `/docs` are proxied to the other apps on
the same origin.

On first visit you are redirected to `/initial_setup`: a readiness gate (what
`engenty setup` should have left behind, checked from the running services),
then the admin user, the team, a model provider, the first space and your
personal space — see [Setup process](../setup-process#first-run-in-the-browser).

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
default, so start the stack with `db up` and add what you actually want:

```bash
pnpm engenty db up                   # lean
pnpm engenty db up --studio          # + Supabase Studio
pnpm engenty db up --logs            # + log pipeline
pnpm engenty db up --studio --logs   # everything
```

The flags are not passed to the Supabase CLI (it has none) — they set `enabled` under
`[studio]` / `[analytics]` in your local `supabase/config.toml`, which is read at start.
So **stop the stack first** (`pnpm engenty db down`) if it is already running. Vector has no
flag of its own: it exists only to feed Logflare, so `--logs` covers both.

The rest of the stack commands: `db status`, `db restart` (PostgREST reloads the
exposed schemas from `config.toml`), `db migrate`, `db reset` (wipes local data),
`db snapshot`, `db restore`.

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
