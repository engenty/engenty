---
title: Local development
description: Clone, install, and run the Engenty stack locally.
---

# Local development

## Prerequisites

- **Node** ≥ 24.11 (an `.nvmrc` pins the exact version)
- **pnpm** 10.x
- **Docker** — local Supabase (Postgres + auth)
- **[Supabase CLI](https://supabase.com/docs/guides/cli)**

## Setup

```bash
pnpm install
pnpm build                # required before first dev run
pnpm supabase:start       # local Supabase
pnpm db:setup             # apply migrations
pnpm env:setup            # interactive: writes .env.local (+ dev URL block)
```

## Run

```bash
pnpm dev
```

This starts core, UI (Vite), AI, and docs together.

**Open [http://localhost:5173](http://localhost:5173)** — the Vite dev server serves
the UI with hot reload. `/api`, `/ai`, and `/docs` are proxied to the other apps on
the same origin.

On first visit you are redirected to `/initial_setup` to create the admin user and
tenant.

### Optional: HTTPS via Portless

For production-like URLs (`https://engenty.localhost`), see
[Portless local URLs](../../../dev/portless-local-urls.md) — recommended for daily
dev if you already use Portless, but not required for contributors.

```bash
pnpm portless:setup       # once
pnpm portless             # each session, before pnpm dev
pnpm dev
```

## Dev origins

Use one browser origin consistently — Supabase sessions and `VITE_ENGENTY_AI_BASE_URL`
are keyed to it.

| Origin | When |
|--------|------|
| `http://localhost:5173` | Default; Playwright, headless, no TLS setup |
| `https://engenty.localhost` | Portless + core dev gateway |

Sync env after switching:

```bash
pnpm env:localhost:sync   # default
pnpm portless:env:sync    # Portless
```

## Build & test

```bash
pnpm build
pnpm test
pnpm typecheck
pnpm check
```

## Signing in for tests & automation

For headless and preview browsers, the app provides a secret-less, local-only
login route. See **[Agent login](./agent-login)** for how it works, the required
`.env.local`, and the security gates that disable it in production.
