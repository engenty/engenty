# Browser bridge — status, threat model, follow-ups

Implements `PLAN-browser-bridge.md` (phases B1–B3 plus the module side of
B4/B5). Server module: `modules/browser-bridge/` (connector id `browser`,
schema `module_browser_bridge`). Client: `apps/browser-extension/` (MV3,
vite + crxjs; load-unpacked from `dist/`).

## What ships

- **Read tier** (`allow` by default): `browser_navigate`, `browser_reload`,
  `browser_observe`, `browser_tabs`, `browser_wait_for`.
- **Act tier** (`ask` by default → native approval card): `browser_click`,
  `browser_fill`. Both address elements via `[ref=N]` handles from the most
  recent `observe`; stale refs fail with `browser_bridge_ref_stale`.
- Durable request bridge with an explicit `claimed` state (claim-once): the
  extension acks before executing, so a service worker killed mid-command is
  distinguishable from "never seen"; completes are guarded on
  `status = 'claimed'`.
- Held long-poll claim (`wait_ms` up to 25 s, 250 ms server-side DB poll) —
  tables stay service_role-only, no Realtime.
- Link handshake: the web settings page (`/settings/browser-bridge`) calls
  `POST /api/browser-bridge/link` itself and hands the result plus the current
  Supabase access token to the extension via
  `chrome.runtime.sendMessage(EXTENSION_ID, …)`; the extension stores it as a
  PENDING link and activates it only after the user confirms in the side
  panel. The extension id is pasted into the settings page in v1.

## Threat model: page-content prompt injection

Page content is untrusted input; an attacker-controlled page could try to
smuggle instructions to the agent through a snapshot. Mitigations, layered:

1. **Untrusted-content envelope** — every `observe`/act output embedding page
   text is wrapped in explicit `<<<untrusted-page-content …>>>` markers
   (`src/protocol.ts`), so the agent side treats it as data.
2. **Act tier defaults to `ask`** — `click`/`fill` surface the native approval
   card; a snapshot cannot make the agent act without the user seeing it.
3. **Origin allowlist** — `navigate` is enforced server-side in the connector
   handler (deny by default: an empty allowlist blocks all navigation) and
   re-checked client-side in the extension. The allowlist lives on the
   `installations` row (one simple place, minted 1:1 with the connection at
   link time) and is edited on the settings page.
4. **Managed window only** — the extension acts exclusively inside the window
   it created; no ambient control of the user's browser.
5. **No credential export, ever** — the extension never reads cookies or
   passwords; it acts *in* the user's session and its bearer token only
   reaches `/api/browser-bridge/*`.
6. **The user always wins** — side panel pause + unlink; closing the managed
   window fails in-flight commands with `browser_bridge_window_closed`.

## Follow-ups / non-goals (v1)

- Engenty session-header status chip + "Link browser" affordance in the
  copilot thread header (plan §5) — the `/session/thread` route and
  `GET /session` polling surface exist; the chip UI is not built yet.
- Scoped long-lived device tokens (plan §4): v1 passes the Supabase access
  token; on repeated 401 the panel shows "re-link". Study the satellite-token
  mode in `packages/api-client`.
- Playwright E2E smoke (`--load-extension` against the dev stack) — outline
  builder and ref staleness are unit-tested (jsdom); the full loop needs a
  manual live pass before push (plan §6 scenario).
- Env-configured extension id for the settings page
  (`VITE_ENGENTY_EXTENSION_ID`) instead of the paste-in input.
- Screenshots in `observe` (storage-bucket plumbing + size policy); Firefox /
  Safari ports; unattended server-side browsing; teach-mode recording; Chrome
  Web Store publication.
