---
title: Setup process
description: How `pnpm install` and `engenty setup` turn the manifest into a running stack.
---

# Setup process

Engenty's local setup is **declarative and regenerable**. You declare which
plugins the product ships in one place (`engenty.plugins`), and `engenty setup`
rebuilds everything derived from that — config, migrations, UI catalog,
workspace deps — so a fresh clone always materializes the same product.

## One command

```bash
pnpm install                 # deps + warm the workspace build (postinstall)
pnpm engenty setup --local   # plugins (interactive) → Docker/Supabase → migrations → .env.local
pnpm dev                     # core + ui + ai + docs
```

`setup --local` is the turnkey first-run command. Re-run it any time — it's
idempotent and only prompts for plugins on a fresh workspace.

## The pipeline

| Step | What runs | Notes |
|------|-----------|-------|
| `pnpm install` | Installs deps, then **`postinstall`** warms the build | `postinstall` is best-effort and marker-gated — it never fails the install; the CLI rebuilds on demand if skipped. Skip with `ENGENTY_SKIP_INSTALL_BUILD=1`. |
| `engenty setup` | **Regenerates derived artifacts** from `engenty.plugins` | Pure function of the manifest — see below. |
| `engenty setup --local` | `setup` **plus** orchestration | Interactive plugin install (fresh only) → start the container runtime → start Supabase → apply migrations → init `.env.local`. Each step is skippable; non-interactive shells take safe defaults. |
| `pnpm dev` | `dev:check` + `predev` + the stack | Auto-starts the [container runtime](#container-runtime--supabase-on-demand) if needed, then Supabase, builds packages/modules, regenerates UI artifacts, then runs core/ui/ai/docs. |

## What `engenty setup` regenerates

Everything below is **derived from `engenty.plugins`** and **gitignored** — never
edit it by hand:

| Output | From | Purpose |
|--------|------|---------|
| `supabase/config.toml` | `supabase/config.toml.example` | Local Supabase config (materialized once, or with `--refresh`) |
| `supabase/migrations/*` (aggregate) | each enabled plugin's `supabase/migrations` | One ordered migration set for the enabled plugins |
| exposed API schemas / storage buckets | enabled plugins | Composed into `config.toml` |
| `apps/ui/src/plugins/generated-catalog.ts` + Tailwind sources | enabled UI plugins | UI route/widget catalog |
| `@engenty/<slug>` deps in `apps/ui/package.json` | enabled UI plugins | So pnpm can resolve UI imports (synced, never manual) |

What setup **does not** do (separate, explicit steps — they touch a running DB or
secrets):

- **Apply DB migrations** — `pnpm db:migrate` (or `setup --local` runs `supabase db reset` on a fresh DB).
- **Write `.env.local`** — the `env --init` wizard (run by `setup --local`).

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

## Container runtime & Supabase, on demand

If `docker info` already succeeds — Linux Docker Engine, CI, a Mac app you
started yourself — that is enough. `pnpm dev` (`predev-check.sh`) and
`setup --local` will then start local Supabase if it isn't up.

On **macOS**, if the daemon is down, `predev-check.sh` can auto-start Docker
Desktop, [OrbStack](https://orbstack.dev), or [Dory](https://augani.github.io/dory)
and wait. The choice is saved to gitignored **`.engenty/container-runtime`**
(values: `docker-desktop`, `orbstack`, `dory`) — never `package.json`. Delete
that file to be prompted again.

On **Linux**, there is no app to `open`. If the CLI is installed but the daemon
is down, you get a clear instruction to start it (`systemctl start docker` or
your distro equivalent) and a clean exit.

If a named macOS runtime is saved, `predev-check.sh` also pins the matching
**Docker CLI context** (`desktop-linux`, `orbstack`, or `dory`) via
`docker context use`. Because that writes the global `~/.docker/config.json`,
the choice is authoritative for every tool that follows Docker context — not
just `pnpm dev`, but `pnpm supabase`, `db:*`, snapshots, and a bare `docker`
too.

## Environment

`setup --local` runs the `env --init` wizard when `.env.local` is missing:

- Pick optional features (the **AI copilot** is recommended/checked by default).
- Secrets like `ENGENTY_SECURITY_JWT_SECRET` are generated locally.
- Supabase keys are harvested from `supabase status`.
- Provider keys (Vercel AI Gateway, OpenAI) show a clickable URL to grab them.

Check status any time:

```bash
pnpm dev:env:check   # ✓ ok · ✗ need attention · · optional unset
pnpm dev:env         # interactive menu
```

Most `unset` values are `optional` features with code defaults — only entries
marked **need attention** require action.

## Commands

```bash
pnpm engenty setup            # regenerate derived artifacts from the manifest
pnpm engenty setup --refresh  # also recreate supabase/config.toml from the example
pnpm engenty setup --local    # turnkey first-run orchestration
pnpm db:migrate               # apply pending migrations
pnpm db:reset                 # reset local DB + reapply all migrations (wipes data)
pnpm purge                    # reset the tree to a fresh-clone state (see below)
```

## Resetting

```bash
pnpm purge          # remove node_modules, build caches, generated artifacts, local env
pnpm purge:light    # same but keep node_modules (faster)
```

After a purge, run the first-run flow again:

```bash
pnpm install
pnpm engenty setup --local
pnpm dev
```

`purge` exits cleanly if you decline the confirmation — it never leaves a failed
command behind.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `Could not query the database for the schema cache` (queue/AI logs) | Supabase stack not fully up. `pnpm supabase:stop && pnpm db:up`, confirm `pnpm supabase:status` is healthy, then `pnpm dev`. |
| `Cannot connect to the Docker daemon` | Docker not running. Start the daemon so `docker info` succeeds and re-run (`setup --local` can auto-start Docker Desktop / OrbStack / Dory on macOS). |
| CI `frozen-lockfile` fails after adding a module | The new workspace package isn't committed, or the lockfile is stale — commit it and run `pnpm install`. |
| `2 need attention` in `env check` after setup | Supabase keys are still placeholders — re-run `pnpm dev:env:init` once Supabase is up. |
| App returns `Unauthorized` for a valid login; PostgREST 504s; `docker stats` hangs | Not an auth bug — the container runtime is saturated, and auth is simply not answering in time. Usually several Supabase stacks running at once. Stop the ones you are not using (`pnpm supabase:stop` in that checkout — data is preserved) and start the rest with `pnpm db:up` so Studio and the log pipeline stay off. Confirm with `docker stats`: if Postgres is idle in `pg_stat_activity` while everything times out, it is the host, not the app. |
| Every request 500s with `current transaction is aborted` (`25P02`) | PostgREST's connection pool is poisoned and stays that way. `docker restart supabase_rest_<project_id>`. |
