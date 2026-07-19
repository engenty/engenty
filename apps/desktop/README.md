# @engenty/desktop

macOS desktop app for engenty, built with [Tauri v2](https://v2.tauri.app). It
bundles the same SPA as the web app (`apps/ui`) inside a native shell — there is
no separate desktop frontend to keep in sync.

## How it stays in sync with the web app

- The UI bundle is built from `apps/ui` **without any baked `VITE_*` server
  values** (unlike the web Docker image).
- On first launch the app shows a server picker. It fetches the chosen server's
  public client config from `GET /api/desktop/bootstrap` (Supabase URL + anon
  key, API/AI base URLs) and stores it locally.
- Before the SPA renders, the stored config is installed as runtime env
  overrides (`@engenty/environment` → `runtimeEnvOverride`), which take
  precedence over `import.meta.env`. The config is re-fetched in the background
  on every launch, so server-side changes propagate automatically.

One binary therefore works against production, a satellite, or a local dev
server — whatever the server runs is what the desktop app talks to. Server
requirements: engenty ≥ 0.1.30 (bootstrap endpoint + `tauri://localhost`
CORS allowance in core/ai).

## Native integration

- **Dock badge + notifications** — the inbox unseen count is mirrored to the
  Dock badge; new arrivals while the window is unfocused post a native
  notification (`apps/ui/src/desktop/DesktopBridge.tsx`).
- **Menu-bar tray** — Open, Change Server…, Quit. Closing the window hides it
  (app keeps running); quit via ⌘Q or the tray.
- **Deep links** — `engenty://open?path=/some/route` opens the app and
  navigates to the route.
- **External links** open in the system browser.

## Development

```sh
# Terminal 1: run the regular dev stack (vite on :5173 + core/ai)
pnpm dev

# Terminal 2: launch the shell against the dev server
pnpm --filter @engenty/desktop dev
```

`tauri dev` loads `http://localhost:5173` (see `build.devUrl` in
`src-tauri/tauri.conf.json`). In the shell, pick your local server URL in the
first-launch picker (e.g. your portless HTTPS domain or `http://localhost:8787`).

## Building

```sh
# Build the workspace + UI bundle first (no VITE_* server env needed), then the app:
pnpm build
pnpm --filter @engenty/desktop bundle:dmg
# → src-tauri/target/release/bundle/dmg/engenty_<version>_aarch64.dmg
```

The app version comes from the root `package.json` (`version` in
`tauri.conf.json` points at it), so desktop releases track product releases.

## Release

`.github/workflows/desktop-release.yml` builds an unsigned arm64 `.dmg` on
every `v*` tag and attaches it to the GitHub release
(`engenty-desktop-vX.Y.Z-macos-arm64.dmg`).

- **Unsigned:** first launch needs right-click → Open (Gatekeeper), or
  `xattr -dr com.apple.quarantine /Applications/engenty.app`.
- **Updates are manual for v1** — download the new `.dmg` from the release.
  The repos are private, so the Tauri auto-updater cannot fetch release assets
  anonymously; enabling it later means hosting `latest.json` + artifacts
  somewhere public (or proxying them through the gateway) and adding the
  updater plugin + signing keypair.
