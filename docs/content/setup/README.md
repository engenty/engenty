---
title: Installation
description: Install and deploy your own Engenty instance.
---

# Installation

Stand up Engenty from a fresh clone — locally first, then on your own server
when you are ready to self-host.

## Try it locally

Clone, install, and run on your laptop. This is the shortest path.

See **[Developer → Local development](/dev/local-development)** for the
exact commands. The README at the repo root is the same first-run flow:

```bash
git clone https://github.com/engenty/engenty.git
cd engenty
pnpm install
pnpm engenty setup
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). First visit is
`/initial_setup`.

## Production

Deploy the full stack to a VPS behind a single HTTPS domain.

- **[VPS deployment with Coolify](/setup/coolify)** — [Coolify](https://coolify.io/)
  terminates TLS and forwards to `engenty-edge`.

You will need a VPS with Docker, a domain, a Supabase project (self-hosted or
cloud), and API keys for the AI provider you want to use. Each guide lists
its exact prerequisites at the top. `pnpm engenty deploy` is the guided path
through the same steps; `--dry-run` walks it without writing anything.
