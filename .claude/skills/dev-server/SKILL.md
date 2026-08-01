---
name: dev-server
description: Start and preview this repo's dev server (worktree or main checkout) as Claude Code — preview_start/launch.json wiring, first-run setup, the .localhost URL, and the specific failures this environment hits. Use whenever asked to "start the dev server", "run the app", "preview this change" in engenty-pro or any of its worktrees.
---

# Starting the dev server (Claude Code)

This is the exact procedure — every step exists because skipping it caused a
real failure in a real session. Do them in order; don't skip ahead to
`preview_start` on step 4 without steps 1–3, that is the single biggest
source of the 30–40 minute debugging loops this skill exists to prevent.

## 0. Decide the domain

- Main checkout (`engenty-pro/`, no worktree) → no `--domain`, opens
  `https://engenty.localhost` (slot 0). Studio (`/studio`) only works here.
- A worktree → `--domain=<short-name>` (recommended explicit; matches the
  worktree's purpose, not necessarily its directory name).

## 1. First-run setup — REQUIRED on any worktree that hasn't run it before

`supabase/config.toml` and the generated UI plugin catalog
(`apps/ui/src/plugins/generated-catalog.ts`) are **gitignored**. A fresh
`git worktree add` + `pnpm install` has neither. Skipping this step produces
two specific failures later, not immediately:

```bash
pnpm engenty setup --local
```

- If skipped: `supabase start` derives a `project_id` from the worktree's
  directory name instead of reusing the shared `engenty-local` stack, and
  Docker fails with `port is already allocated` for `:54322` (or the dev
  server silently spins up a **second**, isolated Supabase — worse, since it
  won't share data with the rest of your worktrees and you won't notice
  until data looks empty).
- If skipped: the build later fails with `Missing generated UI plugin
  catalog. Run: pnpm run setup` — a full turbo build (~1-2 min) has to
  rerun after fixing it.
- Plugin selection is already committed to the repo, so this command is
  **non-interactive** on a worktree — safe to run unattended.
- Check first before assuming it's needed: `test -f supabase/config.toml &&
  test -f apps/ui/src/plugins/generated-catalog.ts` — if both exist, skip
  this step.

## 2. Pick a port slot — usually skip this, let it auto-assign

Each worktree's `.engenty/dev-slots.json` (also gitignored) starts empty and
assigns slot 1, 2, 3… per domain on first run of `dev:portless --domain=X`.
**Do not hand-seed this file** unless you have a specific reason — auto-assign
is correct almost always, and the main risk (two worktrees picking the same
slot) only matters if they run *simultaneously*; check first:

```bash
lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep node   # see what's actually live
```

## 3. Add (or verify) the launch.json entry

Edit `/Users/m/code/engenty/.claude/launch.json` (the **repo-root** one, not
inside any worktree). Add an entry for the domain if none exists:

```jsonc
{
  "name": "<domain>",
  "runtimeExecutable": "env",
  "runtimeArgs": [
    // PATH ORDER MATTERS: /Users/m/Library/pnpm FIRST. The nvm bin/pnpm on
    // this machine is a corepack shim that resolves the WRONG pnpm version
    // (11.x) outside a login shell and hard-errors — it works fine from an
    // interactive Bash tool call (which inherits a full shell env) but NOT
    // from preview_start's minimal env. /Users/m/Library/pnpm/pnpm is the
    // real, pinned 10.23.0 script; put it first.
    "PATH=/Users/m/Library/pnpm:/Users/m/.nvm/versions/node/v24.14.0/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin",
    "pnpm",
    "-C",
    "/Users/m/code/engenty/engenty-pro-<worktree-dir>",
    "dev:portless",
    "--domain=<domain>"
  ],
  "port": 5223  // the domain's ui port — resolve it, don't guess (step 4)
}
```

To get the exact ports for a domain (works whether or not `dev-slots.json`
already has an entry — it creates one if missing):

```bash
node scripts/dev-portless-lib.mjs resolve --json --domain=<domain>
```

Use `.ports.ui` for `"port"` in launch.json, and note
`.routes.gatewayOrigin` (`https://<domain>.engenty.localhost`) — that's the
URL for step 5.

## 4. Start it, and expect the first build to take minutes

```
preview_start({ name: "<domain>" })
```

The first run does a full `turbo build --filter=./packages/* --filter=./modules/**`
(~1–2 min) before any dev server listens, plus Docker image pulls if this is
the first time this worktree's Supabase context resolves images (can be
several more minutes, one-time). **Don't conclude the server is dead just
because nothing is listening yet** — check `preview_logs` for progress
before restarting anything.

**If `preview_logs`/`preview_list` loses track of the server** (returns
"not found" shortly after a reported-successful start — this happens for
slow multi-service startups in this environment): fall back to running it
directly and polling a log file instead of fighting the preview tool:

```bash
env PATH=/Users/m/Library/pnpm:/Users/m/.nvm/versions/node/v24.14.0/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin \
  pnpm -C /Users/m/code/engenty/engenty-pro-<worktree-dir> dev:portless --domain=<domain> \
  > /tmp/<domain>-dev.log 2>&1 &
disown
```

Then poll: `grep -qE "VITE.*ready|ELIFECYCLE|EADDRINUSE" /tmp/<domain>-dev.log`
in a bounded loop (see the repo-wide sleep/Monitor rules — never a bare
`sleep`). A clean run ends with `@engenty/ui:dev:portless: ➜ Local:
http://localhost:<port>/` in the log and the gateway alias registered
(`Alias registered: <domain>.engenty.localhost -> 127.0.0.1:<core-port>`).

## 5. Navigate to the `.localhost` URL — never the raw port

`preview_start` auto-opens `http://localhost:<port>`. **That is not the
right page for Portless** — the whole point of `dev:portless` is the HTTPS
gateway domain. Always explicitly navigate:

```
navigate({ tabId, url: "https://<domain>.engenty.localhost/" })
```

Vite's raw port serves the UI in isolation without the core/AI gateway
proxying — some flows (auth, `/api`, `/ai`) will look broken there for
reasons that have nothing to do with your change.

## 6. Dev login

`ENGENTY_DEV_EMAIL` / `ENGENTY_DEV_PASS` in `.env.local` enable a dev-login
form. React's controlled inputs ignore a plain `.value =` set —
use the native setter + dispatch `input`/`change` events, then a **single**
click on Submit (don't also press Enter — double-submit leaves a stuck
"sending" UI state). The session does not persist across
`window.location.reload()` in the preview browser — log in again after
every reload. Full recipe: see the `worktree-dev-server-slots` memory.

## Known-good end state

- `preview_logs` (or the log file) shows every app's dev task reporting
  ready, not just `ui`.
- `curl -sk -o /dev/null -w '%{http_code}' https://<domain>.engenty.localhost/`
  returns `200`.
- The browser tab is on the `.localhost` URL, not `localhost:<port>`.
