# @engenty/ui

React + Vite frontend for Engenty.

## Environment setup

Vite reads env from the **repo root** (`envDir` is configured to `../..`).

Required in `.env.local`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL` — omit for same-origin `/api` (Vite proxy to core on `:8787`)

Dev URL block (written by `pnpm engenty env init` or `pnpm dev:urls:localhost`):

- `VITE_ENGENTY_AI_BASE_URL` — browser origin for Copilot (default `http://localhost:5173`; Portless: `https://engenty.localhost`)

```bash
pnpm engenty env init       # interactive setup + localhost dev URLs
pnpm dev:urls:localhost     # refresh localhost URL block
pnpm dev:urls:portless      # optional HTTPS URLs
```

## Local dev

```bash
pnpm dev                    # from repo root (starts ui + core + ai + docs)
```

Open **http://localhost:5173** — Vite serves the UI; `/api`, `/ai`, and `/docs` are
proxied to the other apps.

With Portless: **https://engenty.localhost** (core dev gateway). See
[docs/dev/portless-local-urls.md](../../docs/dev/portless-local-urls.md).

If Supabase vars are missing or wrong, the UI logs **"TypeError: Failed to fetch"**
from the auth client. Run `pnpm engenty setup` (starts Supabase + applies
migrations) or `pnpm engenty db up`, then set keys from `pnpm engenty db status`
via `pnpm engenty env init`.
