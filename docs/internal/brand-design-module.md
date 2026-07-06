---
title: "Brand Design Module — Concept & Scope (v3: grounded on Open Design)"
---

# Brand Design Module — Concept & Scope (v3: grounded on Open Design)

Status: **planning** · Branch: `feat/brand-design` · 2026-07-02

The brand-design module is the tenant-facing **brand layer** of engenty: the single source of
truth for a tenant's brand, readable by agents, governed by humans, and the base for all
future marketing modules (newsletter, social, SEO/landing pages, shop content, presentations,
job posts, …).

**v3 architecture decision: we ground on [Open Design](https://github.com/nexu-io/open-design)
(Apache-2.0) instead of building our own brand/design/generation stack.** Open Design runs as
a companion app (Docker daemon) driven programmatically via its HTTP API/MCP. Engenty owns
what Open Design doesn't have: multi-tenancy, human approval workflow, business context
(CRM/shop/HR data), and the missing marketing channels. Earlier drafts (v1/v2) planned to
build the brand format, extraction, templates, and rendering ourselves — the deep dive below
shows most of that already exists in Open Design, more mature than our design.

---

## 1. Deep-dive findings: what Open Design actually is

Not "a DESIGN.md file" — a full agent-native design platform (74k stars, Apache-2.0, positioned
as the open-source Claude-Design/Figma alternative):

### 1.1 The brand/design-system format (already ≈ our v2 data model)

A design system is a **structured folder**, not one file (`design-systems/<slug>/`):

```
manifest.json          # schemaVersion od-design-system-project/v1, id, name, category, file map
DESIGN.md              # 9-section prose guide (theme, colors, typography, components,
                       #   spacing, depth, iconography, voice/tone, accessibility/dark-mode)
tokens.css             # CSS custom properties (colors, fonts, spacing, radius)
design-tokens.json     # programmatic token export
tailwind-v4.css        # optional Tailwind layer
components.html        # component fixtures + components.manifest.json
preview/               # colors.html, typography.html, spacing.html specimen pages
assets/                # logos, fonts, imagery
source/                # extraction evidence (measured tokens, snippets)
```

And `brand-extract` produces a **`brand.json`** that is almost exactly our v2 section schema:
logo + alternates, colors with semantic roles (hex + oklch + usage), typography with fallbacks
and Google-Fonts URLs, **voice** (adjectives, tone, messagingPillars), **imagery** (style,
subjects, treatment, **avoid** — our photo-style + anti-patterns), layout posture rules.

### 1.2 Extraction — our planned "phase 3 wizard" already ships

`skills/brand-extract`: drives a real browser against the tenant's website, **measures**
computed CSS (never guesses colors), harvests logos/imagery/voice from real content, writes
`brand.json` incrementally with live preview (`od brand preview`), then `od brand finalize`
validates, derives light/dark/compact tokens, self-hosts fonts, and **generates six branded
artifacts** (landing, deck, poster, email, newsletter, form) and registers the brand as a
reusable design system. The web **Clipper** extension adds capture-from-any-page.

### 1.3 Programmatic driving — the companion-app integration is a designed path

- **HTTP API** (Bearer `OD_API_TOKEN`, Docker deploy in `deploy/`): projects, files with
  versioning, design systems (create/list/read/archive/**generation-jobs**/revision-jobs),
  plugins, artifacts, and **runs** — `POST /api/runs` starts a generation (the daemon spawns
  its own coding agent), `GET /api/runs/:id/events` streams progress (SSE), `result-package`
  returns the artifact bundle.
- **MCP server** (stdio, 21 tools): our agents connect as clients — `list_skills`,
  `get_artifact`, `write_file`, `create_project`, `start_run`, … External agents *commission*
  generation; the daemon executes it with its own spawned agent (Claude Code etc., BYOK).
- **Craft layer**: universal design-quality rules (typography, color, anti-AI-slop with
  linting, accessibility, state coverage) injected per skill — quality control we'd never
  have built.

### 1.4 Marketing coverage today (honest map)

| Our target application | Open Design today |
|---|---|
| Landing pages | ✅ 4 templates, design-system-aware (~95%) |
| Presentations | ✅ 20+ HTML deck templates, PPTX/PDF export (~90%) |
| Brand guidelines + extraction | ✅ excellent (~95%) |
| Email (single) | ✅ `email-marketing` template, token-aware |
| Blog/editorial/e-guides | ✅ good |
| Images (product/ecommerce, posters) | ✅ good |
| Video/motion | ⚠️ HyperFrames (HTML→MP4) exists, design-flavored, not narrative (~50%) |
| Social posts | ⚠️ X/Reddit/Spotify/Xiaohongshu cards; **no LinkedIn/Instagram/TikTok** |
| Newsletter *series*/drip | ❌ single email only |
| Job posts | ❌ nothing |
| Shop product pages | ⚠️ images only, no page template |
| SEO, ads, campaign coordination, content calendar | ❌ nothing |
| Claims/messaging depth | ⚠️ `copywriting`/`marketing-psychology` skills, generic |

**≈60% of our goals covered now; extensible to ~85% by authoring skills/plugins** — skills
are markdown folders (`SKILL.md` + frontmatter + assets), plugins are the same plus an
`open-design.json` manifest. Writing "LinkedIn post", "job post", "product page" skills is
content authoring, not platform engineering — and upstreamable.

### 1.5 Hard constraints we must design around

1. **Single-user daemon.** No tenancy/RBAC; SQLite + file-based projects. → one daemon
   container per tenant (or per self-hosted install), never a shared daemon across tenants.
2. **Generation spawns a coding agent** inside the daemon environment (BYOK keys needed
   there). Acceptable inside an isolated per-tenant container; never on a shared host.
3. **PDF/PPTX/MP4 export routes are desktop-only** (Electron sidecar owns headless Chrome +
   ffmpeg). Server-side deliverable export needs our own thin render worker (playwright +
   `pptxgenjs` + `pdf-lib` + ffmpeg — the same libraries OD uses, all vendorable).
4. **Pre-1.0 velocity.** Formats (`od-design-system-project/v1`, `od-plugin/v1`) are
   versioned but the project moves fast → pin the daemon version per release train, and
   never make live agent reads depend on the daemon (see snapshots below).

---

## 2. Architecture: Open Design as brand engine, engenty as governance layer

```
┌─────────────────────────────────────────────────────────────┐
│ engenty (multi-tenant)                                       │
│                                                              │
│  brand-design module                                         │
│  ├─ UI: guideline page · assets · templates/skills · wizard  │
│  ├─ governance: propose → review → approve → PUBLISH         │
│  ├─ published SNAPSHOTS (DB + storage: BRAND.md, brand.json, │
│  │    tokens, asset mirror)  ←— what consuming agents read   │
│  └─ ai: read tools (snapshot) + orchestration tools (runs)   │
│                        │ HTTP API (Bearer) / MCP             │
│                        ▼                                     │
│  ┌────────────────────────────────────────────┐              │
│  │ Open Design daemon (per tenant / install)  │              │
│  │  Docker, OD_API_TOKEN, pinned version      │              │
│  │  design-systems/<tenant-brand>/  (authoring│              │
│  │  truth) · skills · plugins · craft ·       │              │
│  │  brand-extract · runs (spawns gen agent)   │              │
│  └────────────────────────────────────────────┘              │
│                                                              │
│  marketing modules (future): newsletter · social · SEO · …   │
│    read snapshot → start OD run w/ skill → collect artifact  │
└─────────────────────────────────────────────────────────────┘
```

**Division of labor:**

| Concern | Owner |
|---|---|
| Brand format (`brand.json`, design-system folder, DESIGN.md, tokens) | **Open Design** (we adopt, we extend via extra files — no invented format) |
| Extraction from website/manual | **Open Design** (`brand-extract`, clipper), orchestrated by our wizard |
| Generation (landing, deck, email, social card, image, video) | **Open Design** runs + skills |
| Design quality (craft rules, anti-AI-slop linting) | **Open Design** |
| Multi-tenancy, auth, daemon lifecycle | **engenty** (daemon-per-tenant orchestration) |
| Approval workflow, versioning, publish gates | **engenty** (OD has none) |
| Published-brand snapshots for agent consumption | **engenty** (DB + storage mirror) |
| Business context (contacts/CRM, shop data, HR) into generation prompts | **engenty** marketing modules |
| Missing channels (LinkedIn, Instagram, job posts, newsletter series, product pages, SEO) | **engenty-authored OD skills/plugins** (upstream candidates) |
| Server-side deliverable export (PNG/PDF/PPTX/MP4) | **engenty render worker** (vendored libs), phase-gated |

### 2.1 Source of truth & the snapshot rule

- **Authoring truth** lives in the tenant's OD workspace: `design-systems/<brand>/` with
  `brand.json`, `DESIGN.md`, tokens, assets. We extend the folder with engenty-namespaced
  files where OD's format is thinner than our needs: `engenty/claims.md` (claims/messaging
  in short/medium/long + per audience), `engenty/voice.<locale>.md` (de/en), and
  `engenty/brand.meta.json` (section approval states). Extra files are legal in the folder
  format and survive OD round-trips.
- **Consumption truth** is the engenty **published snapshot**: on "Publish", the module pulls
  the folder via the OD API, stores `BRAND.md` + `brand.json` + `tokens` in the module DB and
  mirrors assets to engenty storage. Marketing agents and the guideline page read snapshots —
  **never the live daemon** — so a down/upgrading daemon can't break agent work, and
  unreviewed edits can't leak into generated content.

### 2.2 Engenty data model (shrunk from v2's five tables to governance-only)

```sql
-- schema module_brand_design
brands           (id, tenant_id, scope_id, slug, name, od_design_system_id,
                  od_daemon_ref, active_version, status)
brand_versions   (id, brand_id, version, brand_json jsonb, brand_md text,
                  tokens_json jsonb, asset_manifest jsonb, published_at, published_by)
brand_reviews    (id, brand_id, section_key, od_change_ref, status: proposed|approved|rejected,
                  note, reviewed_by, reviewed_at)
```

Assets: mirrored into bucket `module-brand-design-assets` at publish (manifest maps
OD paths → engenty URLs). No section tables, no template tables — sections live in
`brand.json`/`DESIGN.md`; templates are OD skills.

### 2.3 Agent tools (Mastra, `defineModuleAi`)

Read (any agent with `module.brand-design.read` — reads snapshots, no daemon dependency):

- `get-brand-bundle(locale?)` — published `BRAND.md` + tokens (context budget ≤ ~6k tokens,
  compiler warns).
- `get-brand-section(key)` / `search-brand-assets(kind?, tags?)` — from snapshot manifest.

Orchestration (brand + marketing modules, `module.brand-design.write` / future
`platform.brand.generate`):

- `list-od-skills` / `start-od-run(skillId, prompt, inputs)` / `get-od-run(runId)` /
  `get-od-artifact(runId)` — thin bridge over the OD HTTP API, tenant-scoped daemon,
  long-running via run polling (Mastra pinned 1.45: no daemon-side dependency on Mastra —
  the bridge is plain HTTP from our side).
- `extract-brand(url | files)` — orchestrates `brand-extract` in the tenant daemon.
- `propose-brand-change(section, content)` — writes to the OD folder + creates a
  `brand_reviews` row. Publishing stays a human-only action in the UI.

### 2.4 Daemon lifecycle (the real new engineering in this plan)

- **Self-hosted engenty** (primary deployment model): one OD container next to the stack —
  compose entry, `OD_API_TOKEN` from env, volume for `RUNTIME_DATA_DIR`. Simple.
- **Multi-tenant SaaS**: daemon-per-tenant, started on demand, volume per tenant — would
  need an `od-orchestrator` service. **Deferred**: if the tenancy direction in
  `docs/wip/single-tenant-installations.md` (installation-per-tenant + central manage
  plane) is adopted, this orchestrator disappears entirely — the daemon is just a compose
  service per install. Phases 0–2 assume installation-scoped daemons only; build no
  SaaS-side pooling until the tenancy ADR is decided.
- **Generation keys**: the daemon's spawned agent uses BYOK config per tenant (or platform
  keys with metering) — same key-management problem we already have for engenty agents.

---

## 3. UX / UI

Module route `/mdl/brand-design`, app-bar "Brand". The UX from v2 survives; the machinery
behind it is now OD.

### 3.1 Brand Guideline page

Rendered brand manual from the **published snapshot** (`brand.json` + `BRAND.md` + mirrored
assets): swatch rows with contrast badges, live type specimens, logos on light/dark, voice
do/don't cards, claims as pull-quotes. Left-rail section anchors; per-section status chips
fed by `brand_reviews`; publish bar when approved changes are newer than `active_version`;
version switcher over `brand_versions`. OD's own preview pages
(`GET /api/design-systems/:id/preview`) are embeddable for the token specimens — build our
components only where we show governance state.

### 3.2 Assets page

Gallery over the snapshot manifest (grouped by kind; tabs past ~30 assets). Uploads go
**into the OD workspace folder** via the files API (single writing side), then appear in the
next publish. Usage-note field nudged on upload — it lands in the bundle manifest agents read.

### 3.3 Templates page → "Applications" page

Lists **OD skills/plugins** available in the tenant daemon (`list_skills`), grouped by our
application taxonomy (social, newsletter, landing page, deck, job post, …), each with
preview and "generate example" (starts a real OD run against the published brand — smoke
test per template). Managing = installing/enabling OD plugins + editing our own skill
folders, not a bespoke template model.

### 3.4 Onboarding wizard

Path 1 **Extract from website** → runs `brand-extract` in the tenant daemon, streams run
events into the wizard, results land as proposals for section-by-section review.
Path 2 **Import brand manual (PDF/files)** → our addition: parse uploads, feed
`brand.json` fields, same review flow. Path 3 **Interview** → Brand Designer agent asks ~8
questions, seeds `brand.json` (optionally forking one of OD's 150 reference systems as a
style starting point). Honest expectation: extraction nails colors/logos/fonts; voice/claims
usually need the interview pass — wizard chains 1 → 3 for weak sections.

### 3.5 Copilot

Brand-aware copilot on all module pages using the read + propose tools; never publishes.

---

## 4. Phasing

| Phase | Scope | Outcome |
|---|---|---|
| **0 — Spike (1–2 weeks, gate for everything else)** | Run OD daemon in Docker; drive headlessly end-to-end via HTTP: create design system → `brand-extract` a real site → `start_run` on `email-marketing` + `saas-landing` → pull artifacts. Verify auth, stability, version pinning, resource footprint | Go/no-go evidence, not gut feeling |
| **1 — Companion + snapshot core** | Compose/orchestrator for tenant daemons; module skeleton; publish pipeline (pull folder → snapshot + asset mirror); read tools; minimal guideline page (rendered snapshot) | Brand exists in OD, agents consume snapshots |
| **2 — Governance UI** | Full guideline page with review states, `brand_reviews`, publish bar, versions; assets page; extraction wizard (OD `brand-extract` orchestration + review flow) | The human loop; the differentiator over raw OD |
| **3 — Applications & gap skills** | Applications page over OD skills; author engenty skill pack v1: LinkedIn post, Instagram post/carousel, job post, newsletter issue, shop product page (upstream PRs where sensible) | Our channel coverage on OD's engine |
| **4 — First consumer** | Thinnest marketing vertical (suggest: social posts agent) using snapshot + `start-od-run`; validates `platform.brand` contract | Proven end-to-end before big marketing modules |
| **5 — Render worker** | Server-side deliverable export (playwright screenshot/PDF, pptxgenjs, ffmpeg) for artifacts OD can't export headlessly | PNG/PDF/PPTX/MP4 deliverables in SaaS |

### Open questions

1. **Daemon-per-tenant economics** (SaaS): memory/disk per idle daemon; on-demand start
   latency acceptable? Phase 0 measures it. Self-hosted / installation-per-tenant
   (`docs/wip/single-tenant-installations.md`) is unaffected — there the daemon is a plain
   compose service.
2. **Upstream relationship**: which of our skills/extensions to PR to nexu-io/open-design vs.
   keep as engenty plugin pack; do we pin to releases or fork-and-track?
3. **BYOK inside the daemon**: tenant keys vs. platform keys + metering for spawned
   generation agents.
4. **company-profile overlap**: consumers read brand-design snapshot first, fall back to
   company-profile fields; no sync.
5. **Locale strategy**: OD's format is single-locale; our `engenty/voice.<locale>.md`
   extension needs a compile rule per locale in the snapshot.
6. **Stale migration**: removed `brand-manager` migration `20260521143000` must not collide;
   fresh timestamps, schema `module_brand_design`.

---

## Appendix: why not build it ourselves (v1/v2 post-mortem)

v1/v2 of this plan designed a 5-table section model, a custom compiler, an extraction wizard,
a template model, and (implicitly) a render pipeline. The deep dive showed Open Design already
ships: the structured brand format (richer than our design: token contract, component
fixtures, previews, evidence trail), the measuring extractor with live preview and artifact
generation, 113 design templates + 159 skills + craft quality rules, and a programmable
API/MCP surface designed exactly for external agents. Rebuilding that is years of undifferentiated
work. What OD structurally cannot give us — multi-tenancy, approval governance, business-data
context, and our channel gaps — is precisely the engenty-shaped work, so that's the module.
