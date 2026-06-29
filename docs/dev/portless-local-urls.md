# Portless local URLs (optional, recommended)

Portless gives stable HTTPS hostnames (`https://engenty.localhost`) instead of raw
ports. **Not required** — default dev works at **http://localhost:5173** without it.

Use Portless when you want production-like single-origin routing (core dev gateway)
and HTTPS locally.

## Default vs Portless

| | Default | Portless (optional) |
|---|---------|---------------------|
| **Open in browser** | `http://localhost:5173` | `https://engenty.localhost` |
| **Routing** | Vite serves UI; proxies `/api`, `/ai`, `/docs` | Core dev gateway proxies to Vite, AI, docs |
| **Env sync** | `pnpm dev:urls:localhost` | `pnpm dev:urls:portless` (or `portless:setup`) |
| **Extra setup** | None | CA trust + HTTPS proxy on port 443 |

Keep env URLs aligned with the origin you browse. Sessions and Copilot AI URLs
are per-origin.

## One-time setup

```bash
pnpm install              # includes the portless dev dependency
pnpm portless:setup       # trust CA + doctor + write HTTPS URLs to .env.local
```

Re-sync URLs after `portless.json` changes:

```bash
pnpm dev:urls:portless
```

## Run

Each session, start the HTTPS proxy before `pnpm dev`:

```bash
pnpm portless             # binds port 443 (may prompt for sudo once)
pnpm dev
```

Open **https://engenty.localhost**.

Per-app scripts (`apps/core` → `pnpm api`, etc.) call `scripts/portless-dev.sh`.

Hostnames and ports are defined in `portless.json` and each app’s `package.json`
`"portless"` key.

## App URLs (Portless)

Single-origin via the dev gateway — open **https://engenty.localhost** after
`pnpm portless && pnpm dev`:

| App | URL | Upstream port |
|-----|-----|---------------|
| Main (UI + API gateway) | https://engenty.localhost | Vite `:5173` + core `:8787` |
| AI / Copilot | https://engenty.localhost/ai | `:8790` |
| Docs | https://engenty.localhost/docs | `:3002` |
| Mastra Studio | https://engenty.localhost/studio | `:43111` |
| OpenAPI (Scalar) | https://engenty.localhost/api/docs | core `:8787` |

Direct upstream (bypass gateway, for debugging):

| App | URL |
|-----|-----|
| AI | https://ai.engenty.localhost |
| Docs | https://docs.engenty.localhost |

These URLs are also written as comments in the `.env.local` dev URL block when you
run `pnpm dev:urls:portless`.

## Gateway routing

With `ENGENTY_DEV_GATEWAY=1`, core on `:8787` reverse-proxies paths on the gateway host:

| Path | Upstream |
|------|----------|
| `/` (UI) | Vite `:5173` |
| `/api` | Core Hono |
| `/ai` | `apps/ai` `:8790` |
| `/docs` | `apps/docs` `:3002` |
| `/studio` | Mastra Studio `:43111` |

## Switch back to localhost

```bash
pnpm dev:urls:localhost
```

Then open **http://localhost:5173** after `pnpm dev`.
