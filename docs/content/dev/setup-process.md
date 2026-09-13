---
title: Setup process
description: What `engenty setup`, `generate`, `dev`, `doctor` and `reset` do, and how they turn the manifest into a running stack.
---

# Setup process

Engenty's local setup is **declarative and regenerable**. You declare which
plugins the product ships in one place (`engenty.plugins`), and everything
derived from that — config, migrations, UI catalog, workspace deps — is
regenerated from it, so a fresh clone always materializes the same product.

## The commands

```bash
pnpm install            # deps + warm the workspace build (postinstall)
pnpm engenty setup      # first run: plugins → generate → Docker/Supabase → migrations → .env.local
pnpm dev                # = engenty dev: preflight → build → core + ui + ai + docs
```

| Command | What it does | Touches |
|---------|--------------|---------|
| `engenty setup` | The first run of a checkout, repeatable. Interactive plugin pick (fresh workspace only) → `generate` → start the container runtime and local Supabase → apply migrations (`db reset` on an empty database, asked first) → the `env init` wizard when `.env.local` is missing. Every step is skippable; non-interactive shells take safe defaults and never `db reset` without `--yes-reset-db`. **No dev-stack preflight.** | files, Docker, DB, env |
| `engenty generate` | Regenerates the derived files from `engenty.plugins` (table below). A pure function of the manifest — what CI runs. `--refresh` recreates `supabase/config.toml` from the example. | files only |
| `engenty dev` | The daily start. Preflight (`scripts/predev-check.sh`: Docker, Supabase up and healthy, pending migrations applied, generated files present, stale dev ports freed) → `turbo run build` for packages and modules → the dev servers. `pnpm dev` is an alias. `--portless`, `--domain=<name>`, `--studio`, `--no-preflight`. | Docker, DB |
| `engenty doctor` | Read-only. One line per check with the command that fixes it. `--remote` (or `--url`) checks a Supabase deployment instead: exposed schemas and the access-token hook. | nothing |
| `engenty db …` | `up` (lean by default; `--studio`, `--logs`), `down`, `status`, `restart`, `migrate`, `reset`, `snapshot`, `restore`. `migrate` and `reset` include Mastra's own schema. | Docker, DB |
| `engenty install <slug>` | Shorthand for `engenty plugins install <slug>`: add a module to `engenty.plugins` and regenerate. | files |
| `engenty env …` | `init` (wizard), `check`, `edit`, `generate` (secrets), `example`. | env |
| `engenty reset` | Back to a fresh checkout: generated files, local env, runtime dirs, build caches, `node_modules` (`--light` keeps them). `--db` also wipes the local database, and runs first because it needs the generated files. | files, DB with `--db` |
| `engenty deploy` | The self-host wizard (`--dry-run`); `deploy migrate` pushes the aggregated migrations to the linked Supabase project. | remote |

## What `engenty generate` regenerates

Everything below is **derived from `engenty.plugins`** and **gitignored** — never
edit it by hand:

| Output | From | Purpose |
|--------|------|---------|
| `supabase/config.toml` | `supabase/config.toml.example` | Local Supabase config (materialized once, or with `--refresh`) |
| `supabase/migrations/*` (aggregate) | each enabled plugin's `supabase/migrations` | One ordered migration set for the enabled plugins |
| exposed API schemas / storage buckets | enabled plugins | Composed into `config.toml` |
| `apps/ui/src/plugins/generated-catalog.ts` + Tailwind sources | enabled **open** UI plugins | UI route/widget catalog (closed plugins go to the gitignored `pro/` overlay) |
| `@engenty/<slug>` deps in `apps/ui/package.json` | enabled **open** UI plugins | So pnpm can resolve open UI imports (synced, never manual; closed modules stay out of this manifest) |

What `generate` **does not** do — separate, explicit steps, because they touch a
running database or secrets:

- **Apply DB migrations** — `pnpm engenty db migrate` (`setup` runs `db reset` on a fresh database).
- **Write `.env.local`** — `pnpm engenty env init` (run by `setup`).

## Source of truth

```jsonc
// package.json
"engenty": { "plugins": { "engenty-copilot": { "source": "workspace" } } }
```

`engenty.plugins` is the **committed product declaration** (like `dependencies`).
The actual local install — `node_modules`, `dist`, the generated artifacts above
— is derived and gitignored. So:

- **Committed:** what the product *is* (`engenty.plugins`, source).
- **Gitignored:** how it's *materialized* on a machine.

See [Plugin framework](./plugins) for the manifest model and the
build-time-vs-runtime (`install` vs `activate`) distinction.

## The CLI bootstrap

`pnpm engenty …` runs through `scripts/engenty-cli.mjs`, which builds the CLI's
workspace dependencies on demand (fresh installs only have source). `postinstall`
warms this so the first command is instant; if it was skipped, the wrapper builds
the needed packages before running. Plugins themselves are loaded from source via
`jiti` and never need a `dist` build.

The CLI's version is the root `package.json` version. Commands that act on a
checkout (`setup`, `generate`, `dev`, `reset`, `db …`) refuse to run outside
one with a single line; a missing helper script is an error, never a silent
skip.

### Towards `npx engenty`

Three things still tie the CLI to a checkout, in the order they would be
removed:

1. It runs from source (`tsx apps/core/src/index.ts`) and no package declares a
   `bin`. `npx` needs a published package — `engenty` or `@engenty/cli` — with
   `bin: { engenty }` and a built entry.
2. The scripts it drives (`scripts/generate.mjs`, `predev-check.sh`, `db-up.mjs`,
   `db-snapshot.mjs`, `deploy/scripts/*`) live in the checkout. Those that act on
   the checkout's own modules (`generate`) belong there; the rest would ship
   inside the package.
3. The Supabase CLI is a workspace devDependency. The package would carry its
   own.

With those in place, `npx engenty deploy` and `npx engenty doctor --remote` work
from any directory; `setup`, `dev`, `generate` and `reset` still want a clone.

## Container runtime & Supabase, on demand

If `docker info` already succeeds — Linux Docker Engine, CI, a Mac app you
started yourself — that is enough. `engenty setup` and the preflight in
`engenty dev` will then start local Supabase if it isn't up.

On **macOS**, if the daemon is down, the preflight can auto-start Docker
Desktop, [OrbStack](https://orbstack.dev), or [Dory](https://augani.github.io/dory)
and wait. The choice is saved to gitignored **`.engenty/container-runtime`**
(values: `docker-desktop`, `orbstack`, `dory`) — never `package.json`. Delete
that file to be prompted again.

On **Linux**, there is no app to `open`. If the CLI is installed but the daemon
is down, you get a clear instruction to start it (`systemctl start docker` or
your distro equivalent) and a clean exit.

If a named macOS runtime is saved, the preflight also pins the matching
**Docker CLI context** (`desktop-linux`, `orbstack`, or `dory`) via
`docker context use`. Because that writes the global `~/.docker/config.json`,
the choice is authoritative for every tool that follows Docker context — not
just `pnpm dev`, but `engenty db …`, snapshots, and a bare `docker` too.

## Environment

`engenty setup` runs the `env init` wizard when `.env.local` is missing:

- Pick optional features (the **AI copilot** is recommended/checked by default).
- Secrets like `ENGENTY_SECURITY_JWT_SECRET` are generated locally.
- Supabase keys are harvested from `supabase status`.
- Provider keys (Vercel AI Gateway, OpenAI) show a clickable URL to grab them.

Check status any time:

```bash
pnpm engenty env check   # ✓ ok · ✗ need attention · · optional unset
pnpm engenty env         # interactive menu
```

Most `unset` values are `optional` features with code defaults — only entries
marked **need attention** require action.

## Resetting

```bash
pnpm engenty reset            # node_modules, build caches, generated files, local env
pnpm engenty reset --light    # same but keep node_modules (faster)
pnpm engenty reset --db       # also wipe the local database
```

After a reset, run the first-run flow again:

```bash
pnpm install
pnpm engenty setup
pnpm dev
```

`reset` exits cleanly if you decline the confirmation — it never leaves a failed
command behind. `--yes` skips the prompt for scripted runs.

## Troubleshooting

Run `pnpm engenty doctor` first — most rows below are one of its checks.

| Symptom | Cause / fix |
|---------|-------------|
| `Could not query the database for the schema cache` (queue/AI logs) | Supabase stack not fully up. `pnpm engenty db restart`, confirm `pnpm engenty db status` is healthy, then `pnpm dev`. |
| `Cannot connect to the Docker daemon` | Docker not running. Start the daemon so `docker info` succeeds and re-run (`engenty setup` and `engenty dev` can auto-start Docker Desktop / OrbStack / Dory on macOS). |
| CI `frozen-lockfile` fails after adding a module | The new workspace package isn't committed, or the lockfile is stale — commit it and run `pnpm install`. |
| `2 need attention` in `env check` after setup | Supabase keys are still placeholders — re-run `pnpm engenty env init` once Supabase is up. |
| App returns `Unauthorized` for a valid login; PostgREST 504s; `docker stats` hangs | Not an auth bug — the container runtime is saturated, and auth is simply not answering in time. Usually several Supabase stacks running at once. Stop the ones you are not using (`pnpm engenty db down` in that checkout — data is preserved) and start the rest with `pnpm engenty db up` so Studio and the log pipeline stay off. Confirm with `docker stats`: if Postgres is idle in `pg_stat_activity` while everything times out, it is the host, not the app. |
| Every request 500s with `current transaction is aborted` (`25P02`) | PostgREST's connection pool is poisoned and stays that way. `docker restart supabase_rest_<project_id>`. |
