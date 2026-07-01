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


## Repo Layout

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

**Daily:** `pnpm dev`

**Module or SQL changed:** `pnpm engenty setup && pnpm db:migrate && pnpm dev`

**Add a workspace module:** `pnpm engenty plugins install <slug>` (or rsync from legacy, then install)

See **[Modules: on disk vs active](#modules-on-disk-vs-active)** below — do not wire modules into `apps/*` by hand.

**Full local reset:** `pnpm purge` (or `pnpm purge:light` to keep `node_modules`, or `pnpm purge -- --yes --quiet`)

Open **http://localhost:5173/** — the Vite dev server serves the UI with hot reload.
`/api`, `/ai`, and `/docs` are proxied to the other apps on the same origin.

You'll be redirected to `/initial_setup` to create the first admin user and tenant.

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

## Modules: on disk vs active

**Goal:** one declared product stack. Apps (`apps/core`, `apps/ui`, `apps/ai`) must not hard-code which modules exist — only **`engenty.plugins`** does.

| State | Where | Meaning |
|-------|--------|---------|
| **On disk** | `modules/<slug>/` in git | Source is in the repo; pnpm sees it via `workspaces: ["modules/*"]`. **Not running** until activated. |
| **Active** | root `package.json` → **`engenty.plugins`** | Object map (pi-style) declaring which plugins this product runs. SSOT for backend, DB, UI catalog, Supabase compose. |
| **Derived** | gitignored or setup-written | `supabase/config.toml`, aggregated migrations, `generated-catalog.ts`, and (when needed) `@engenty/*` entries in `apps/ui/package.json` — all produced by **`pnpm engenty setup`**, not edited by hand. |

**If the folder is already in the repo** (e.g. copied from `legacy/`):

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

**Do not** manually add `@engenty/<module>` to `apps/ui/package.json`, `apps/ai/package.json`, or import module paths from `apps/*` — that bypasses the manifest. (Some legacy `engenty-copilot` imports in `apps/ui` and `apps/ai` remain; new work must go through module plugins and `engenty.plugins`.)

Commands: `pnpm engenty plugins install|uninstall|list`

## License

[FSL-1.1-MIT](./LICENSE) — free for any non-competing use, converting to MIT two
years after each release.
