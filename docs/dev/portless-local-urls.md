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
| **Start stack** | `pnpm dev` | `pnpm dev:portless` (worktrees + env sync) |
| **HTTPS proxy** | — | `pnpm portless` once per session (sudo, separate step) |
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

## Run (single checkout)

Two steps — proxy and dev stack are separate so sudo stays in Terminal.app, not Turbo:

```bash
pnpm portless             # once per session — HTTPS proxy on :443 (sudo may prompt)
pnpm dev:portless         # sync .env.local, register routes, run the stack
```

Open **https://engenty.localhost**.

Per-app scripts (`apps/core` → `pnpm api`, etc.) call `scripts/portless-dev.sh`.

## Git worktrees (parallel dev)

Multiple worktrees can run **at the same time**. Each gets a unique Portless hostname
and loopback port slot. All worktrees share **one local Supabase** (same data).

```bash
# create worktree — any folder basename becomes the domain when linked
git worktree add ../engenty-pro-tab-ui -b fix/tab-ui upstream/main
cd ../engenty-pro-tab-ui
pnpm install

# explicit domain (recommended)
pnpm dev:portless --domain=tab-ui
# → https://tab-ui.engenty.localhost

# or omit --domain in a linked worktree (auto: sanitized folder basename)
pnpm dev:portless
# → https://engenty-pro-tab-ui.engenty.localhost
```

Main checkout (`engenty-pro/`) with no `--domain` → **https://engenty.localhost** (slot 0).

Port slots are stored in gitignored `.engenty/dev-slots.json` so domains keep stable
ports across restarts. **Mastra Studio is not started in worktrees** — use the main
checkout for `/studio`.

| Domain | Gateway URL | Loopback ports (example slot 1) |
|--------|-------------|----------------------------------|
| _(main)_ | https://engenty.localhost | 5173 / 8787 / 8790 / 3002 |
| `tab-ui` | https://tab-ui.engenty.localhost | 5183 / 8797 / 8800 / 3012 |

**Playwright / headless:** use `http://localhost:<ENGENTY_UI_PORT>` for the worktree slot
(e.g. `5183` for slot 1), not the Portless HTTPS URL.

## App URLs (Portless)

Single-origin via the dev gateway:

| App | URL | Upstream port |
|-----|-----|---------------|
| Main (UI + API gateway) | `https://engenty.localhost` | Vite `:5173` + core `:8787` |
| AI / Copilot | `https://engenty.localhost/ai` | `:8790` |
| Docs | `https://engenty.localhost/docs` | `:3002` |
| Mastra Studio | `https://engenty.localhost/studio` | `:43111` (main checkout only) |
| OpenAPI (Scalar) | `https://engenty.localhost/api/docs` | core `:8787` |

Direct upstream (bypass gateway, for debugging):

| App | URL |
|-----|-----|
| AI | https://ai.engenty.localhost |
| Docs | https://docs.engenty.localhost |

Worktree example (`tab-ui`):

| App | URL |
|-----|-----|
| Main | https://tab-ui.engenty.localhost |
| AI (direct) | https://tab-ui.ai.engenty.localhost |

## Gateway routing

With `ENGENTY_DEV_GATEWAY=1`, core reverse-proxies paths on the gateway host:

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
