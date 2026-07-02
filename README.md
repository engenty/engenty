```txt

███████╗███╗   ██╗ ██████╗ ███████╗███╗   ██╗████████╗██╗   ██╗
██╔════╝████╗  ██║██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝╚██╗ ██╔╝
█████╗  ██╔██╗ ██║██║  ███╗█████╗  ██╔██╗ ██║   ██║    ╚████╔╝ 
██╔══╝  ██║╚██╗██║██║   ██║██╔══╝  ██║╚██╗██║   ██║     ╚██╔╝  
███████╗██║ ╚████║╚██████╔╝███████╗██║ ╚████║   ██║      ██║   
╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝      ╚═╝   
```

# People & Agents. As One Team.

We think agents belong in your apps - side by side with your team
 — not stuck in a dark terminal window.

> engenty is early preview - we do not guarantee data migrations

The Setup:

 * Based on Mastra as the Agent Harness
 * Using AG-UI to integrated seamless with the UI
 * Modulare to the core - based on a plugin architecture
 * Runs on your own infrastructure using Supabase and Hono


## Modules

engenty ships with a basic set of modules out of the box — each one is an installable plugin (see [Modules: on disk vs active](#modules-on-disk-vs-active)). Use them as building blocks, reference or in real life.

engenty is strictly modular. So you can add your own modules using the PluginsSDK.

| Module | What it does |
|--------|--------------|
| Company Profile | Legal entity profile and business identity settings |
| Contacts | Contacts and organisations module |
| Copilot | Full-page AI chat, backed by `apps/ai` |
| Knowledge Base | Articles, tags, FAQs, and AI-powered assistants |
| Projects | Project management with phases, tasks, and client portal |
| Tasks | Canonical goals and tasks for human and agent collaboration |
| Team | Team directory, org structure, groups, and taxonomies |
| Time Tracking | Weekly time tracking for project, phase, and task work |

## Repo Layout

Here's how the workspace is organized:

| Path | What it is |
|------|------------|
| `apps/core` | Hono backend, HTTP API and plugin host |
| `apps/ui` | React based web frontend |
| `apps/ai` | Agent runtime based on Mastra and AG-UI |
| `apps/docs` | Documentation site |
| `packages/*` | Shared libraries and plugin SDK |
| `modules/*` | Installable feature modules - using a plugin architecture |
| `scripts/*` | Root dev tooling (DB sync, migrations, Portless, clean, purge) |
| `supabase/*` | Local Postgres + auth config and migrations |
| `test/*` | Global Vitest setup and test defaults |

## Database / Hosting

engenty runs on your own infrastructure — one Postgres/Supabase project backs the whole product, with modules owning their own slice of the schema.

- **Single Supabase** — there is one local (or hosted) Supabase instance per deployment, shared by `apps/core`, `apps/ui`, and `apps/ai`. Config lives in `supabase/config.toml` (gitignored, materialized from `supabase/config.toml.example` via `pnpm engenty setup`); auth, storage, and Postgres all run from this one project. Self-host it (see [docs/content/setup/coolify.md](./docs/content/setup/coolify.md)) or point it at Supabase Cloud.
- **Supabase modules** — each active module owns its own `supabase/migrations` and, optionally, storage buckets declared in its `engenty.plugin.json`. `pnpm engenty setup` composes these module-owned pieces (API schemas, storage buckets, aggregated migrations) into the single `supabase/config.toml` and `supabase/migrations` tree — nothing is wired in by hand. Installing or uninstalling a module (`pnpm engenty plugins install|uninstall`) adds or removes its schema from the composed config; run `pnpm db:migrate` afterward to apply.

## Requirements

- Node `>= 24.11` (`.nvmrc` pins the version; `nvm use`)
- pnpm `10.23` (`corepack enable`)
- Docker — for the local Supabase database
- [Supabase CLI](https://supabase.com/docs/guides/cli)

## Getting started

```bash
pnpm install                 # install dependencies + build workspace packages (postinstall)
pnpm engenty setup --local   # pick plugins (interactive) → Supabase → migrations → .env.local
pnpm dev                     # core + ui + ai + docs
```

`setup --local` is the one-stop first-run command. It prompts to install workspace
plugins, starts local Supabase, applies migrations, and initializes `.env.local`
(each step is skippable; non-interactive shells take the safe default). Re-run it
any time — it only prompts for plugins on a fresh workspace.

Open **http://localhost:5173/** — the Vite dev server serves the UI with hot reload.
`/api`, `/ai`, and `/docs` are proxied to the other apps on the same origin.

### Daily work:

```bash
pnpm dev

# Module or SQL changed: 
# stop / start dev 
# new schemas require supabase restart
pnpm engenty setup && pnpm db:migrate

# Add a workspace module
pnpm engenty plugins install <slug>

# Trouble shoot / start fresh
pnpm purge     # FULL LOCAL RESET
pnpm db:reset  # WHIPES ALL DATA
```

### Optional: HTTPS via Portless (recommended)

For production-like local URLs, use [Portless](https://github.com/vercel-labs/portless):

```bash
pnpm portless:setup      # once — trust CA + sync HTTPS URLs to .env.local
pnpm portless            # once per session — HTTPS proxy on :443 (sudo, Terminal.app)
pnpm dev:portless        # env sync + routes + dev stack
```

Open **https://engenty.localhost**. Parallel worktrees: `pnpm dev:portless --domain=<name>`.
See [docs/dev/portless-local-urls.md](./docs/dev/portless-local-urls.md).

| App | URL |
|-----|-----|
| Main (UI + API gateway) | https://engenty.localhost |
| App Backend (Hono) | https://engenty.localhost/api |
| Agent Backend | https://engenty.localhost/ai |
| Docs | https://engenty.localhost/docs |
| Mastra Studio | https://engenty.localhost/studio |
| OpenAPI (Scalar) | https://engenty.localhost/api/docs |

Direct upstream (debug): https://ai.engenty.localhost · https://docs.engenty.localhost

Use the same browser origin as your env block (`pnpm dev:urls:localhost` vs
`pnpm dev:urls:portless`).

`.env.example` is generated from the env manifest (`pnpm env:example:write`); `pnpm dev:env:check`
validates your local env against it.

## Development

```bash
pnpm build               # build all packages
pnpm test                # run the test suite
pnpm typecheck
pnpm check               # lint / format (ultracite)
```

Each module and package is an independent workspace member with its own `build`,
`test`, and migrations. **`pnpm dev`** runs `dev:check` and `predev` first (Docker/Supabase checks, builds packages/modules, regenerates UI plugin artifacts).

## Modules: in repo, wired (installed) and activation

**Goal:** one declared product stack. Apps (`apps/core`, `apps/ui`, `apps/ai`) must not hard-code which modules exist — only **`engenty.plugins`** does.

| State | Where | Meaning |
|-------|--------|---------|
| **On disk** | `modules/<slug>/` in git | Source is in the repo; pnpm sees it via `workspaces: ["modules/*"]`. **Not running** until activated. |
| **Active** | root `package.json` → **`engenty.plugins`** | Object map (pi-style) declaring which plugins this product runs. SSOT for backend, DB, UI catalog, Supabase compose. |
| **Derived** | gitignored or setup-written | `supabase/config.toml`, aggregated migrations, `generated-catalog.ts`, and (when needed) `@engenty/*` entries in `apps/ui/package.json` — all produced by **`pnpm engenty setup`**, not edited by hand. |


```bash
pnpm engenty plugins install <slug>  # add to engenty.plugins + setup + UI dep sync
pnpm db:migrate                      # if the module has SQL
pnpm dev
```

**If you remove a module from the product** (folder can stay on disk):

```bash
pnpm engenty plugins uninstall <slug>
pnpm dev
```

Commands: `pnpm engenty plugins install|uninstall|list`

## License

[FSL-1.1-MIT](./LICENSE) — free for any non-competing use, converting to MIT two
years after each release.
