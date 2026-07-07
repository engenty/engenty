```txt

███████╗███╗   ██╗ ██████╗ ███████╗███╗   ██╗████████╗██╗   ██╗
██╔════╝████╗  ██║██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝╚██╗ ██╔╝
█████╗  ██╔██╗ ██║██║  ███╗█████╗  ██╔██╗ ██║   ██║    ╚████╔╝ 
██╔══╝  ██║╚██╗██║██║   ██║██╔══╝  ██║╚██╗██║   ██║     ╚██╔╝  
███████╗██║ ╚████║╚██████╔╝███████╗██║ ╚████║   ██║      ██║   
╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝      ╚═╝   
```

# People & Agents. As One Team.

Agents side by side with your team
 — not stuck in a terminal window.

> engenty is early preview - we do not guarantee data migrations

The Setup:

 * Based on **[Mastra](https://mastra.ai/)** as the agent framework
 * Using **[AG-UI](https://ag-ui.com/)** to integrated seamless with the UI
 * Modulare to the core - based on a plugin architecture
 * Batteries included - ships with basic modules and a powerful knowledge-base with ingestions and RAG
 * Runs on your own infrastructure using **[Supabase](https://supabase.com/)** and **[Hono](https://hono.dev/)** - currently using **[Vercel Gateway](https://vercel.com/docs/ai-gateway)** as the LLM router


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

One Postgres/Supabase project backs the whole product, on your own infrastructure; 

Each active module owns its own `supabase/migrations` and storage buckets (declared in `engenty.plugin.json`); `pnpm engenty setup` composes them into that one config and migrations tree, and `pnpm db:migrate` applies changes.

## Authentication / Authorization

**[Supabase Auth](https://supabase.com/docs/guides/auth)** handles sign-in (email/password, magic link, OTP) — verified server-side in `apps/core/src/security`. Additional providers (OAuth, SSO) are on the roadmap.

**RBAC Authorization**: a per-tenant role (currently `admin`/`member`). Tenant isolation is enforced at the DB layer via Postgres Row Level Security. Today's roles by concept simple — a more granular permission model is planned.

## i18n

Built on **[i18next](https://www.i18next.com/)** (`@engenty/i18n`), namespaced per module — every module ships `en`/`de` locales, enforced by convention. Language is a persisted user/tenant setting, switchable at runtime.

## Requirements

- Node `>= 24.11` (`.nvmrc` pins the version; `nvm use`)
- pnpm `10.23` (`corepack enable`)
- A container runtime for the local Supabase database — Docker Desktop, [OrbStack](https://orbstack.dev), or [Dory](https://augani.github.io/dory). On first `pnpm dev` you're prompted to pick one; the choice is saved to `engenty.containerRuntime` in `package.json` and the app is auto-started on later runs.
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

### Releasing

Cut releases only with **`pnpm release`** (interactive; git-cliff over Conventional Commits). It is the SSOT — never hand-edit `CHANGELOG.md`, `changelog.json`, the `package.json` version, or tags. `pnpm release:changelog` drafts the changelog without bumping. It never pushes/builds/deploys. Details: [docs/content/dev/releases-and-versioning.md](docs/content/dev/releases-and-versioning.md).

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
