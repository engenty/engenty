```txt

███████╗███╗   ██╗ ██████╗ ███████╗███╗   ██╗████████╗██╗   ██╗
██╔════╝████╗  ██║██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝╚██╗ ██╔╝
█████╗  ██╔██╗ ██║██║  ███╗█████╗  ██╔██╗ ██║   ██║    ╚████╔╝ 
██╔══╝  ██║╚██╗██║██║   ██║██╔══╝  ██║╚██╗██║   ██║     ╚██╔╝  
███████╗██║ ╚████║╚██████╔╝███████╗██║ ╚████║   ██║      ██║   
╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝      ╚═╝   
```


> **Early Preview** — things may change and break; feedback welcome.

# Teams & Agents working together

Hire your specialist agents and work with them as a team, in dedicated spaces.

Give each space the agents, apps, and knowledge for the job — including compute and data on your own infrastructure. Connect the LLM of your choice.


## Prerequisites

* **Node 24** — Node 22 may also work.
* **via nvm** — `nvm install && nvm use` via `.nvmrc` in the repo
* **pnpm** — `corepack enable`
* **Docker** — A Docker-compatible daemon - `docker info` must answer.
* **Nothing else** — the Supabase CLI comes with `pnpm install` and runs Postgres,
  auth, storage and realtime in those containers.

## Run it locally

Clone from [GitHub](https://github.com/engenty/engenty)

```bash
pnpm install
pnpm engenty setup   # plugins, generated files, Supabase, migrations, .env.local
pnpm dev               # core + ui + ai + docs
```

Open **http://localhost:5173**. First visit is `/initial_setup` — create the
administrator account, name your team and your first space.

Copilot chat needs a [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) key,
which the env wizard asks for; everything else comes up without one. `engenty
install` is safe to re-run, and `pnpm engenty doctor` tells you what state the
checkout is in.

### Run locally with HTTPS via Portless

Plain `pnpm dev` is complete — Vite on `localhost:5173`, with `/api`, `/ai` and
`/docs` proxied to the other apps. For production-like URLs on a single HTTPS
origin, add [Portless](https://github.com/vercel-labs/portless):

```bash
pnpm portless:setup      # once — trust the CA, sync HTTPS URLs to .env.local
pnpm dev:portless        # https://engenty.localhost
```

Several checkouts at once — git worktrees, one per branch — each get their own
hostname and port slot from `--domain`, and share the one local Supabase:

```bash
git worktree add ../engenty-tab-ui -b feat/tab-ui main
cd ../engenty-tab-ui && pnpm install && pnpm engenty setup
pnpm dev:portless --domain=tab-ui     # https://tab-ui.engenty.localhost
```

Deeper: [Local development](docs/content/dev/local-development/index.md) and
[Portless local URLs](docs/dev/portless-local-urls.md).

## What it is built on

* **[Mastra](https://mastra.ai/)** as the agent framework
* **[AG-UI](https://ag-ui.com/)** to integrate agents seamlessly with the UI
* Modular to the core — a plugin architecture, all the way down
* Batteries included — basic modules, and a knowledge base with ingestion and RAG
* Your own infrastructure: **[Supabase](https://supabase.com/)** and
  **[Hono](https://hono.dev/)**, with **[Vercel AI Gateway](https://vercel.com/docs/ai-gateway)**
  as the LLM router

## Modules

engenty ships a basic set of modules, each an installable plugin. Use them as
building blocks, as reference, or as they are. Modules still under heavy
development are in the tree but not listed here (`"stability": "experimental"`
in their manifest).

<!-- modules:start -->
### Core

| Module | What it does |
|--------|--------------|
| 🔌 **Connections** | Central external-service connections: OAuth, per-action permissions, approvals |
| 📇 **Contacts** | Contacts and organisations module |
| 🤖 **Engenty Copilot** | Core Engenty copilot full-page chat and apps/ai UI consumer |
| 🗂️ **Files** | Tenant file storage and previews |
| 📬 **Inbox** | Synced email inbox over connected mail accounts (connections framework) |
| 📚 **Knowledge Base** | Knowledge base with articles, tags, FAQs, and AI-powered assistants |
| 📁 **Projects** | Project management with phases, tasks, and client portal |
| 🔐 **Secrets Vault** | Client-anchored secrets/password vault and paid-services registry; server-side encrypted, agent-grantable |
| ✅ **Tasks** | Canonical tasks for human and agent collaboration |
| 👥 **Team** | Team directory, org structure, groups, and taxonomies |

### Commercial

| Module | What it does |
|--------|--------------|
| 🧾 **Invoices** | Invoice CRUD with SQLite and PDF export |
| 📝 **Offers** | Offer management with draft editor, metadata, blocks, phases, taxes, and billing settings |
| ↳ ⚙️ Commercial Settings | Shared commercial defaults: currency, tax, units, disciplines — used by Offers, Invoices |
| ↳ 🏢 Company Profile | Legal entity profile and business identity settings — used by Offers |
| ↳ 📄 PDF Templates | Shared PDF template storage, preview, and editor integration — used by Offers, Invoices |

**Connections** providers: External (imported), GitHub, Google, HubSpot, Local Files, Microsoft, S3, Slack.
<!-- modules:end -->

Being on disk is not the same as running: the root `package.json` key
`engenty.plugins` declares which modules this product actually runs, and
`pnpm engenty plugins install|uninstall|list` maintains it (`pnpm engenty install <slug>` for short). Add your own with
the Plugin SDK — see [Plugins & Modules](docs/content/dev/plugins.md).

## Run it on a server

Three things engenty does not provide for itself: a **Docker host** (any VPS,
8 GB of RAM a realistic floor), a **domain** pointed at it, and a **Supabase
project** — cloud or self-hosted. engenty never runs your database; it connects
to the one you already operate, so backups and upgrades stay where you manage
them.

```bash
pnpm engenty deploy   # --dry-run walks it without writing
```

It asks where Supabase runs and how engenty runs,
writes `deploy/.env`, and either creates the Coolify application or hands you the
compose commands. It finishes by checking the two Supabase settings that live in
project config rather than in migrations — a missing exposed schema or a disabled
access-token hook otherwise surfaces much later as a crash-loop, or as a correct
password that returns `Unauthorized`.

By hand, and the operator reference:
[Coolify walkthrough](docs/content/setup/coolify.md) ·
[deploy/DEPLOY.md](deploy/DEPLOY.md).

## Develop

```bash
pnpm check       # lint + format (pnpm fix auto-fixes)
pnpm typecheck
pnpm test
```

That is what CI runs. How the workspace fits together:
[Architecture](docs/content/dev/architecture.md). How to work in it:
[Local development](docs/content/dev/local-development/index.md).
Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

engenty is **Fair Source**: the source is public and free to self-host, but it is
not OSI open source.

[FSL-1.1-MIT](./LICENSE) — free for any non-competing use, converting to MIT two
years after each release.
