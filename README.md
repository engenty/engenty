```

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
| `scripts/*` | Root dev tooling (DB sync, migrations, Portless, purge) |
| `supabase/*` | Local Postgres + auth config and migrations |
| `test/*` | Global Vitest setup and test defaults |

## Requirements

- Node `>= 24.11` (`.nvmrc` pins the version; `nvm use`)
- pnpm `10.23` (`corepack enable`)
- Docker — for the local Supabase database
- [Supabase CLI](https://supabase.com/docs/guides/cli)

## Getting started

```bash
nvm use                  # use the node version from .nvmrc - check with 'node -v'
pnpm install             # install all dependencies
pnpm build               # compile workspace packages (required before dev)
pnpm supabase:start      # local Postgres + auth (Docker)
pnpm db:setup            # build the local schema from migrations
pnpm env:setup           # interactive .env.local setup (keys from `supabase status`)
pnpm dev                 # core + ui + ai + docs
```

Open **http://localhost:5173/** — the Vite dev server serves the UI with hot reload.
`/api`, `/ai`, and `/docs` are proxied to the other apps on the same origin.

You'll be redirected to `/initial_setup` to create the first admin user and tenant.

### Optional: HTTPS via Portless (recommended)

For production-like local URLs, use [Portless](https://github.com/vercel-labs/portless):

```bash
pnpm portless:setup      # once — trust CA + sync HTTPS URLs to .env.local
pnpm portless            # each session, before pnpm dev
pnpm dev
```

Open **https://engenty.localhost**. See [docs/dev/portless-local-urls.md](./docs/dev/portless-local-urls.md).

| App | URL |
|-----|-----|
| Main (UI + API gateway) | https://engenty.localhost |
| App Backend (Hono) | https://engenty.localhost/api |
| Agent Backend | https://engenty.localhost/ai |
| Docs | https://engenty.localhost/docs |
| Mastra Studio | https://engenty.localhost/studio |
| OpenAPI (Scalar) | https://engenty.localhost/api/docs |

Direct upstream (debug): https://ai.engenty.localhost · https://docs.engenty.localhost

Use the same browser origin as your env block (`pnpm env:localhost:sync` vs
`pnpm portless:env:sync`).

`.env.example` is generated from the env manifest (`pnpm env:example:write`); `pnpm env:check`
validates your local env against it.

## Development

```bash
pnpm build               # build all packages
pnpm test                # run the test suite
pnpm typecheck
pnpm check               # lint / format (ultracite)
```

Each module and package is an independent workspace member with its own `build`,
`test`, and migrations. The UI plugin catalog is generated from installed modules —
regenerate it with `pnpm --filter @engenty/ui generate:plugins`.

## License

[FSL-1.1-MIT](./LICENSE) — free for any non-competing use, converting to MIT two
years after each release.
