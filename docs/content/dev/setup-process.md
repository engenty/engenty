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
npx engenty create my-engenty   # no checkout yet: prerequisites → clone this release → pnpm install → its engenty setup
pnpm install            # deps + warm the workspace build (postinstall)
pnpm engenty setup      # first run: plugins → generate → Docker/Supabase → migrations → .env.local
pnpm dev                # = engenty dev: preflight → build → core + ui + ai + docs
```

| Command | What it does | Touches |
|---------|--------------|---------|
| `engenty create [dir]` | Only outside a checkout: this machine's prerequisites (Node, pnpm, git, Docker) → `git clone` of the release the package is (`--ref`, `--repo` override) → `pnpm install` → the checkout's own `engenty setup` (`--no-setup` stops before). | a new directory |
| `engenty setup` | The first run of a checkout, repeatable. Interactive plugin pick (fresh workspace only) → `generate` → start the container runtime and local Supabase → the `env init` wizard when `.env.local` is missing → apply migrations (`db reset` on an empty database, asked first; Mastra's schema needs the env file, hence the order). Non-interactive shells take safe defaults and never `db reset` without `--yes-reset-db`. Exits 1 when `.env.local` still has values that need attention, unless `--allow-gaps`. **No dev-stack preflight.** | files, Docker, DB, env |
| `engenty generate` | Regenerates the derived files from `engenty.plugins` (table below). A pure function of the manifest — what CI runs. `--refresh` recreates `supabase/config.toml` from the example. | files only |
| `engenty dev` | The daily start. Preflight (`scripts/predev-check.sh`: Docker, Supabase up and healthy, pending migrations applied, generated files present, stale dev ports freed) → `turbo run build` for packages and modules → the dev servers. `pnpm dev` is an alias. `--portless`, `--domain=<name>`, `--studio`, `--no-preflight`. | Docker, DB |
| `engenty doctor` | Read-only. One line per check with the command that fixes it. Outside a checkout: the machine's prerequisites. `--remote` (or `--url`) checks a Supabase deployment instead: exposed schemas and the access-token hook. | nothing |
| `engenty db …` | `up` (lean by default; `--studio`, `--logs`), `down`, `status`, `restart`, `migrate`, `reset`, `snapshot`, `restore`. `migrate` and `reset` include Mastra's own schema. | Docker, DB |
| `engenty install <slug>` | Shorthand for `engenty plugins install <slug>`: add a module to `engenty.plugins` and regenerate. | files |
| `engenty env …` | `init` (wizard), `check`, `edit`, `generate` (secrets), `example`. | env |
| `engenty reset` | Back to a fresh checkout: generated files, local env, runtime dirs, build caches, `node_modules` (`--light` keeps them). `--db` also wipes the local database, and runs first because it needs the generated files. | files, DB with `--db` |
| `engenty start` | Run engenty on this machine without a checkout: its own Supabase on a free port band, the release's migrations, the prebuilt containers. Idempotent. `status`, `stop` (`--purge`), `update` manage it afterwards. The install lives in `~/.engenty` (`ENGENTY_HOME`). | remote |
| `engenty deploy` | The self-host wizard (`--dry-run`). In a checkout it works in `deploy/`; outside — `npx engenty deploy` on the server — in `./engenty-deploy/`, writing the `.env` and the compose files, so the server needs no clone. `deploy migrate` pushes the migrations: via `supabase link` + `deploy/scripts/migrate.sh` in a checkout, via `SUPABASE_DB_URL` and the release's baked migrations outside. | remote |

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
the needed packages before running. After a `git pull` the commit no longer
matches the stamp in `.engenty/*.sha`, so the wrapper refreshes the builds
through turbo (cache hits for packages that did not change) — a `dist` that
exists is not assumed to be current. Plugins themselves are loaded from source
via `jiti` and never need a `dist` build.

The CLI's version is the root `package.json` version. Commands that act on a
checkout (`setup`, `generate`, `dev`, `reset`, `db …`) refuse to run outside
one with a single line; a missing helper script is an error, never a silent
skip.

The command implementations live in **`packages/cli`** (`@engenty/cli`):
everything that needs only the checkout's files and scripts — `setup`,
`generate`, `dev`, `doctor`, `db`, `reset`, `env`, `deploy`, `create`, the
plugin-manifest operations. `apps/core` registers them and adds what needs the
core runtime: `auth`, `tools`, `skills`, `service-token`, module operations,
and the commands installed plugins contribute.

### `npx engenty`

The same package is published to npm as **`engenty`** on every release tag —
from the public mirror, by its own `publish-cli.yml` on top of
`scripts/publish-cli.mjs`, versioned with the release. It
is a door, not a second CLI — what it does depends on where it runs:

| where | `npx engenty …` |
|---|---|
| inside a checkout (a `pnpm-workspace.yaml` up the tree) | hands the whole command line to that checkout's `pnpm engenty …` — the checkout's version of the code, plugin commands included. Says so when the two versions differ. |
| anywhere else | `start`, `status`, `stop`, `update`, `create`, `deploy`, `deploy migrate`, `doctor` (host prerequisites, `--remote`), `env set`. The checkout-only commands answer with the one line that points at `create`. |

### The managed install

`engenty start` is the third mode, and the only one that leaves a running
installation behind. It writes **`~/.engenty`** — `ENGENTY_HOME` overrides it,
`engenty status` prints it — holding the `.env`, the two compose files and a
generated `supabase/config.toml`. The databases are named Docker volumes, which
is why the directory sits in `$HOME` and not in whatever directory the command
was run from: a cwd-relative folder would be configuration pretending to be the
installation, and a second `start` elsewhere would build a second one.

`engenty deploy` is the other half and keeps writing `./engenty-deploy`: on a
server that folder is the deliverable the operator owns and backs up.

The managed Supabase is the same stack a checkout runs, under `project_id
"engenty"` and a port band `findFreePortBand()` picks, so it never collides
with a developer's `engenty-local`. Studio and the log pipeline stay off, and
so does the Edge Runtime — there are no `supabase/functions` in a release, and
it is the one Supabase container the CLI starts without a restart policy.

The containers reach Supabase through `host.docker.internal`, because it runs
in the Supabase CLI's own compose project rather than ours. That, and the
published host port, are the whole of `docker-compose.local.yaml`; the base
compose stays a server file.

Outside a checkout the release's facts come from a `release-manifest.json`
the publish bakes in: the schemas the release exposes (`doctor --remote`,
the wizard), its aggregated migrations (`deploy migrate`), and the Supabase
CLI pin (`packages/cli/src/supabase-cli-version.ts`, the one pin — the root
devDependency and `deploy/Dockerfile.migrate` must match it, `pnpm
check:supabase-pin`). The compose files ship as `templates/` with the public
image names. Only the open set is baked: closed modules contribute neither
schemas nor SQL, as on the public mirror. The Supabase CLI itself is not a
dependency — `deploy migrate` fetches the pinned version through `npx` for
the run, so `npx engenty deploy` starts in a second.

`pnpm publish:cli --dry-run` stages the package under `.engenty/publish-cli/`
(the workspace package is `@engenty/cli` at a placeholder version; the stage
renames it) and `npm pack`s it — the way to inspect what a release would ship.

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
- The Supabase URLs and keys are read from `supabase status` — always, never
  from a template default. The wizard refuses to write them when the stack
  that answered is not the one in `supabase/config.toml`, and a rerun of
  `env init` rewrites the block when `.env.local` names another stack's port.
- **How will you open engenty?** — `http://localhost:5173` (`pnpm dev`, the
  default) or `https://engenty.localhost` through Portless (`pnpm dev:portless`,
  offered only when the portless CLI is installed). This writes the dev-URL
  block the UI is built with; `engenty dev` warns when the block and the start
  mode disagree, and `pnpm dev:urls:localhost` / `pnpm dev:urls:portless` switch it.
- Provider keys (Vercel AI Gateway, OpenAI) show a clickable URL to grab them.
  A skipped key is named with what stays off and where to set it later. Keys
  the browser can set (`configurable: "platform"`, the AI provider key above
  all) never fail `env init` or `setup`: the first-run wizard asks for them.

Check status any time:

```bash
pnpm engenty env check   # ✓ ok · ✗ need attention · · optional unset
pnpm engenty env         # interactive menu
```

Most `unset` values are `optional` features with code defaults — only entries
marked **need attention** require action.

## First run in the browser

`engenty setup` ends when `engenty doctor` is green; `/initial_setup` starts by
asking the running process the same questions. The wizard is a readiness gate
plus six steps:

| Screen | Does | Talks to |
|--------|------|----------|
| Gate — Installation | Shows core's checks (`GET /api/users/setup/checks`: database, tenant lane accepted by the database — a wrong `SUPABASE_JWT_SECRET` fails here with the `env init` fix rather than as every tenant-scoped query later, Mastra schema, apps/ai reachable from core, baseline modules installed, provider key) plus one the browser answers itself (apps/ai reachable at the URL the UI was built with). A red row blocks and shows the terminal command; the page re-checks every few seconds. Amber rows point at the step that resolves them. | core, apps/ai |
| 1 Administrator | Creates the first admin. No sign-in yet — that would leave the wizard. | `create-initial-admin` |
| 2 Team | Signs in on a detached client and renames the tenant step 1 created. | superadmin tenants |
| 3 AI provider | A model gateway key: Vercel AI Gateway, OpenRouter, Opper, or direct OpenAI / Anthropic. **Test key** calls the gateway's own auth endpoint through core (`POST /api/users/setup/ai-provider/test`; the public catalogs need no credential, so they prove nothing — the keyed ones are probed via their model list). **Continue** stores it as a platform setting; core applies it in place and tells apps/ai to re-read, so the first chat has a key. Skippable — the Ready screen and the rail say so. | platform settings, apps/ai reload |
| 4 First space | Names and re-keys the trigger-made default space (`company` → the team's slug), or creates one when the tenant has none. Mounts are echoed from the space, never guessed. | spaces |
| 5 Personal space | Optional. Names the admin's private space, which `core.ensure_personal_space` created when they joined the tenant. The key stays; `/s/me` resolves it. | spaces |
| 6 Ready | The outcome list. The only screen that signs the shared client in: **Open the space** → `/s/<key>`, or Platform settings, or `/s/me`. | — |

The gate answers only while no user exists (409 afterwards): a finished install
does not describe its internals to strangers.

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

Run `pnpm engenty doctor` first — most rows below are one of its checks,
including the one that bit a test install: `.env.local` naming a Supabase port
that is not this checkout's stack (a second stack on another port band).

| Symptom | Cause / fix |
|---------|-------------|
| `Could not query the database for the schema cache` (queue/AI logs) | Supabase stack not fully up. `pnpm engenty db restart`, confirm `pnpm engenty db status` is healthy, then `pnpm dev`. |
| `Cannot connect to the Docker daemon` | Docker not running. Start the daemon so `docker info` succeeds and re-run (`engenty setup` and `engenty dev` can auto-start Docker Desktop / OrbStack / Dory on macOS). |
| CI `frozen-lockfile` fails after adding a module | The new workspace package isn't committed, or the lockfile is stale — commit it and run `pnpm install`. |
| `2 need attention` in `env check` after setup | Supabase keys are still placeholders — re-run `pnpm engenty env init` once Supabase is up. |
| App returns `Unauthorized` for a valid login; PostgREST 504s; `docker stats` hangs | Not an auth bug — the container runtime is saturated, and auth is simply not answering in time. Usually several Supabase stacks running at once. Stop the ones you are not using (`pnpm engenty db down` in that checkout — data is preserved) and start the rest with `pnpm engenty db up` so Studio and the log pipeline stay off. Confirm with `docker stats`: if Postgres is idle in `pg_stat_activity` while everything times out, it is the host, not the app. |
| Every request 500s with `current transaction is aborted` (`25P02`) | PostgREST's connection pool is poisoned and stays that way. `docker restart supabase_rest_<project_id>`. |
