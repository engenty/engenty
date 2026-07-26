# Multi-file App frontends: a host-side bundle step

Status: planned 2026-07-25, on `feat/engenty-apps`.

## The ask

Apps must be authorable as real projects — a `src/` tree, components, a
framework — not one hand-written HTML file with inline `<script>`. React is the
target framework.

## What changed my mind about the delivery shape

I first proposed serving a multi-file build over a signed URL, with the frame
switching from `srcDoc` to `src`. Reading the code closed that off:

1. **The frontend never touches the app host.** `/frontend` reads
   `version.files[entry]` straight from Postgres
   ([api/index.ts:64](modules/engenty-apps/src/api/index.ts:64)). app-host runs
   only the *backend*. So "serve the built site from the guest" is not a small
   change to an existing path — it is a new path.
2. **A Vite build cannot run in the agentOS build VM.** The guest install is
   `npm ci --omit=optional --omit=peer`, and after `npm run build` a scan
   **fails the build if any `.node` file exists** in `node_modules`
   ([dist/index.js:1309](node_modules/.pnpm/@rivet-dev+agentos-apps@0.2.14_patch_hash=041abf6be1f8f7306b3deb9e84e4cb3c24339babff37f_2c28fa423826ae3a8354950d20d0e9b3/node_modules/@rivet-dev/agentos-apps/dist/index.js:1309),
   [:1401](node_modules/.pnpm/@rivet-dev+agentos-apps@0.2.14_patch_hash=041abf6be1f8f7306b3deb9e84e4cb3c24339babff37f_2c28fa423826ae3a8354950d20d0e9b3/node_modules/@rivet-dev/agentos-apps/dist/index.js:1401)).
   Rollup 4 ships its platform build as an **optional** dep *and* as a `.node`
   binary; esbuild ships its as an optional dep too. Vite needs both. It fails
   twice over. (agentOS itself vendors `esbuild-wasm` — the same conclusion,
   reached by its own authors.)

And the decisive point: multi-file **output** buys code-splitting and lazy
loading. For an internal tool in an artifact pane that is worth approximately
nothing, while it costs a browser-reachable asset route, signed-URL minting, a
CSP rework, and the audited `srcDoc` isolation. Multi-file **authoring** is the
actual ask, and it is fully served by bundling to one document.

So: **many source files in, one self-contained document out.**

## Design decisions

**D1 — Bundle on the host with esbuild, not in the guest.** The bundler runs in
core, where the toolchain is ours and pinned. The backend build stays exactly
as it is, in agentOS.

**D2 — Curated imports, no tenant `npm install`.** An App may import `react`,
`react-dom/client`, `react/jsx-runtime` and the virtual `engenty:bridge`.
Anything else is a build error naming the offending specifier. No tenant
`package.json`, no lockfile, no network during build, no supply chain. esbuild
parses and bundles; it never executes app code, so this is a safe operation on
untrusted source in a trusted process.

**D3 — One inlined document out.** The frame keeps `srcDoc` and its opaque
origin ([bridged-frame.tsx:18](packages/ai-ui/src/components/copilot/tool-call/bridged-frame.tsx:18)).
No new browser-reachable surface, no change to the isolation story, no change
to CSP.

**D4 — Built output in its own column.** `app_versions.frontend_html` holds the
built document; `files` stays the agent's editable source tree. `/frontend`
prefers `frontend_html` and falls back to `files[entry]`, so every App that
exists today keeps working with no data migration.

**D5 — Mode is inferred from the entry extension.** `entry.frontend` ending in
`.html` → inline mode (unchanged). Ending in `.tsx`/`.jsx`/`.ts`/`.js` → bundle
mode. No new manifest field, and no way to get the mode and the entry out of
sync.

**D6 — `engenty:bridge` as a virtual module.** Every App today re-implements the
same ~25 lines of JSON-RPC-over-`postMessage` plumbing, and each copy is a
chance to get it subtly wrong. The bundler injects one audited implementation
exposing `call`, `engenty`, `action`, `data`, `config`, `notify`.

## Phases

1. **Deps** — `esbuild`, `react`, `react-dom` onto `modules/engenty-apps`.
2. **Bundler** — `src/domain/frontend-bundler.ts`: virtual-FS esbuild plugin,
   import allow-list, CSS collection, HTML shell, `engenty:bridge`. Build
   failures throw `FrontendBuildError` carrying an esbuild-formatted log, which
   is the format `app-authoring` already documents.
3. **Storage** — migration adding `app_versions.frontend_html`; zod, types, DAL.
4. **Release pipeline** — `release-service.ts` picks the mode, bundles, stores
   the document, and writes `build_log` on failure exactly like a backend build
   failure, so the agent's fix loop is unchanged.
5. **Serving** — `/frontend` prefers `frontend_html`.
6. **Skill** — `app-authoring` gains a multi-file React section; the single-file
   path stays documented for simple apps.
7. **Verify** — unit suites for `engenty-apps`, `apps/ai`; typecheck; migration
   applied through `pnpm engenty db sync` + `pnpm db:migrate`.

## Risks

- **Bundle size.** React + app ≈ 200 KB of HTML per version in Postgres jsonb.
  Acceptable; revisit only if version counts make it hurt.
- **esbuild in the core image.** A native binary dep. If the Docker build
  refuses it, `esbuild-wasm` is a drop-in at ~2-3× the build time — irrelevant
  at this size, and it is what agentOS itself does.
- **The allow-list will feel narrow.** That is the point, but the first real
  App will want a chart or date library. Widening is a one-line change to the
  allow-list plus a dep; do it on evidence, not in advance.
