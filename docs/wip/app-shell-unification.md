# App Shell & Design System Unification

Status: **draft for discussion** (2026-07-13). Codebase survey + proposed concept model and phased plan.

## 1. Where we stand (survey results)

### 1.1 What is already centralized and healthy

**Shell chrome** — `packages/app-shell` owns the frame and it is genuinely centralized:

- **Vertical App Bar** = `AppSidebar` (`app-shell/src/components/app-sidebar.tsx`), with compact (64px) / extended (220px) modes persisted in `localStorage`, auto-hide + hover reveal, tenant switcher, admin flyout.
- **Module Sidebar** = `SecondaryNavColumn` + `ModuleSecondaryNavColumnShell` (pinned, hover-overlay, EW-resizable, mobile sheet). User is happy with this — treat as stable.
- **Main Area top bar** = `AppTopbar` (breadcrumbs, actions slot, ⌘K).
- **Page-chrome contract** = `usePageConfig(...)` from `ui-plugin-sdk` (`packages/ui-plugin-sdk/src/page-config.tsx`) — used in ~71 module files; the one layer that is consistent everywhere. Modules configure breadcrumbs/actions/secondary-nav declaratively; they never touch shell markup.
- **Chat Drawer slot** = `CopilotShellProvider` (`app-shell/src/context/copilot-shell-context.tsx`) with a 5-way dock engine: `sidebar` (true inline split, resizable), `bottom`, `drawer` (overlay), `floating`, `mini-floating`. Responsive resolution (mobile→drawer). Layout persisted per user.

**Design tokens** — `packages/design-tokens`: OKLCH primitives derived from 4 seeds (`ember-primitives.css`), shadcn bridge, Tailwind v4 CSS-first (no JS config), `.ui-canvas-*` surface utilities. Canonical spec: `docs/agent/DESIGN.md` (523 lines). Color drift across modules is ~zero.

**Primitives** — `packages/ui-core` on **Base UI** (not Radix — package docs are stale on this). Dialog/Sheet/SidePanel discipline is strong: 111 module files import them; zero hand-rolled overlays.

**Chat runtime** — both chat surfaces (full-page `modules/engenty-copilot` and the global drawer) render through **one shared component** (`CopilotPanelContent`, `packages/ai-ui/src/components/copilot/panel/`) over **one agent host** (`useAgentHost(ENGENTY_COPILOT_HOST_KEY)`) and one per-tab thread binding (`threads-active-storage.ts`: sessionStorage authoritative, localStorage seed). Rich elements render inline via the **tool-call UI registry** (`ai-ui/src/components/copilot/tool-call/tool-call-ui-registry.ts`): generative-ui specs, MCP-app iframes, decision/feedback artifacts, sub-agent cards.

### 1.2 The actual inconsistencies

**(a) Three divergent answers to "where do detail-page properties/settings live"** — this is the "Extra Sidebar" problem:

| Pattern | Modules | Implementation |
|---|---|---|
| Inline grid rail | tasks, files | hand-rolled `lg:grid-cols-[1fr_280px]` (`tasks/ui/pages/task-detail-page.tsx:145` + `task-properties-panel.tsx`; `files/ui/pages/files-detail.tsx:246`) |
| Overlapping Sheet + backdrop | offers, invoices | `offer-settings-panel.tsx` / `invoice-settings-panel.tsx` — near-verbatim copies |
| Shared `SidePanel` | projects | `project-portal-panel.tsx` |

**(b) Detail-page header split-brain**: contacts, projects, team use the shared `DetailPageHeader` (`ui-core/src/components/layout/detail-page-header.tsx`); offers, invoices, knowledge-base each invented their own document headers (`document-header.tsx`, `invoice-document-header.tsx`, KB's four header components + its own breadcrumb system).

**(c) Secondary-nav record list reimplemented ~7×**: every module rebuilds search + grouped rows + prefs on top of `Sidebar*` primitives (`tasks-sidebar-panel.tsx` is 802 lines; `contacts-list-secondary-nav-shell.tsx` ≈ `invoices-list-secondary-nav-shell.tsx` are near-verbatim clones).

**(d) Card-surface rule widely ignored**: DESIGN.md mandates `.ui-canvas-*`; reality is ~119 hand-rolled `rounded border bg-card` clusters vs 36 canonical usages. 10 of 16 modules never use the canonical class. Offenders ranked: knowledge-base (37) > projects (20) > tasks (17) > team (12) > files (11). Plus hand-rolled card components in `packages/commercial-editor` (`SettingsCard.tsx` et al.).

**(e) Detail sub-nav tabs duplicated**: `contact-sub-nav.tsx` ≈ `project-sub-nav.tsx`.

**(f) Minor**: inbox is a self-contained two-pane master-detail (its own pattern); spacing drift `p-4` vs `p-page` in files.

### 1.3 What's missing for the long-term vision

- **No "View Area" abstraction** — the only pane pair is `CopilotShellMain` + the copilot sidebar column. No generic pane host with its own top bar.
- **Artifacts are transcript-only and non-addressable** — no artifact identity/store, no "open in pane", no tabs. `packages/generative-ui` components dir is empty; catalog is ~10 primitives.
- **No tab container anywhere**; thread model is one-active-thread-per-tab.
- **No split-pane library** — shell rolls its own EW resize (`usePersistedEwResizePaneWidth`), which works; `react-resizable-panels` is used only in pdf-templates.

## 2. Proposed concept model (vocabulary to agree on)

Formalize the shell as **four regions + two new concepts**:

```
┌──┬──────────┬──────────────────────────────────────────────┐
│A │ Module   │  Workspace                                   │
│p │ Sidebar  │ ┌───────────────────┬──────────────────────┐ │
│p │          │ │ View Pane         │ Chat Pane            │ │
│B │ (nav,    │ │ ┌───────────────┐ │  (or Artifact Pane)  │ │
│a │  lists,  │ │ │pane top bar   │ │ ┌──────────────────┐ │ │
│r │  search) │ │ ├───────┬───────┤ │ │pane top bar      │ │ │
│  │          │ │ │content│ Doc   │ │ ├──────────────────┤ │ │
│  │          │ │ │       │ Side- │ │ │                  │ │ │
│  │          │ │ │       │ bar   │ │ │                  │ │ │
│  │          │ │ └───────┴───────┘ │ └──────────────────┘ │ │
│  │          │ └───────────────────┴──────────────────────┘ │
└──┴──────────┴──────────────────────────────────────────────┘
```

1. **Workspace** (today `CopilotShellContentArea` + optional copilot column) — the container that hosts 1..n **Panes**. Vertical splits only, few panes (2, maybe 3 max), Claude-Desktop style — not an arbitrary tiling manager.
2. **Pane** — a typed unit with its own top bar + content. The pane top bar is where three things live (reference: Codex desktop right pane):
   - **Pane tabs** — the pane is a *tab host for its own kind of content*, tabs are never mixed across kinds: an **Artifact Pane** has artifact tabs, a **Chat Pane** has chat tabs, a pane hosting an app/module can have its own pane tabs. Plus a `+` to add another tab of that kind. Tabs belong to the pane, not to the Workspace.
   - **Pane controls** — expand/maximize, layout toggle, close.
   - **Doc Sidebar toggle** — see next point; the toggle button sits at the pane top bar's right edge.
   Pane types: **View Pane** (module page; top bar = today's `AppTopbar`), **Chat Pane** (reuses `CopilotPanelContent`; top bar = `CopilotPanelInlineHeader`), **Artifact Pane** (new, tabbed from the start — a tab strip with one tab is just a title bar).
3. **Doc Sidebar** (the formalized "Extra Sidebar") — a sidebar *belonging to the document/view inside a pane (or the active tab)*, toggled from the pane top bar. One shared component with responsive behavior: **inline column when the pane is wide enough, overlay Sheet when narrow, always user-toggleable, width/visibility persisted**. Replaces all three divergent patterns (inline grid rail / Sheet drawer / SidePanel).
4. **Artifact** — an addressable rich element with identity (id, type, title, source tool-call). Renders inline in the transcript as today (tool-call registry) *and* can be "opened" into the Artifact Pane. The registry is the hook point; MCP-app iframes, generative-ui specs, and commercial documents are the first artifact types.

Key insight from the survey: the copilot `sidebar` dock mode **is already the Workspace split** — the migration is to generalize that column into a pane host rather than build a new layout system.

## 3. Phased plan

### Phase 0 — Concept & naming (this doc)
Agree on the vocabulary above; encode it in `packages/app-shell/docs/shell-layout.md` and `DESIGN.md`. Decide: Sheet vs SidePanel naming (SidePanel wraps Sheet — probably keep Sheet as low-level primitive, DocSidebar as the product-level component).

### Phase 1 — Tasks view cleanup (near-term goal)
1. **Build `DocSidebar`** in `ui-core` (or app-shell if it needs shell width context): inline-when-wide / sheet-when-narrow / toggle button / persisted per-module key. API roughly: `<DocSidebar storageKey="tasks.detail" header actions>{sections}</DocSidebar>` + a `DocSidebarLayout` grid wrapper for the detail page body.
2. **Migrate tasks detail** to it: replace the hand-rolled `grid-cols-[1fr_280px]` + `TaskPropertiesPanel` section wrapper; restyle property rows to DESIGN.md (keep the row/dropdown UX, fix surfaces via `.ui-canvas-*`).
3. **Bring tasks detail closer to the copilot chat view**: document-centric column (like `chat-page.tsx`'s single-surface layout), `DetailPageHeader` or the doc-header pattern for the title strip, and verify the **copilot `sidebar` dock works well on the task detail page** — that *is* the near-term "split" (task doc left, chat right), no new machinery needed.
4. Sweep tasks' 17 hand-rolled card clusters → `.ui-canvas-*` while touching the files.

### Phase 2 — Copilot split view (chat + artifact pane)
1. **Generalize the inline copilot column** in `app-layout-frame.tsx` into a **pane host** (still max 2 panes to start). Full-page chat route becomes: Chat Pane + Artifact Pane instead of chat-in-main.
2. **Artifact model — proper implementation, no interim layer** (decision 2026-07-13): artifacts are first-class persisted entities from day one (id, type, title, session/thread linkage, payload ref; survives reload, listable per session). No throwaway "derived from tool-call ids" phase that would have to be removed again. The tool-call registry cards get an "open in pane" affordance that resolves to a real artifact. First artifact types: MCP-app, generative-ui spec, file/document.
   **Sequencing rule:** the pane/tab **UI work uses placeholder artifacts** (static fixtures behind the same artifact-store interface) so UI and the artifact backend can proceed independently — the placeholder is swapped for the real store, nothing else changes.
3. **Tabs in the artifact pane** (multiple artifacts; later multiple chats in the chat pane). This is where a tab-group container gets built once, deliberately.
4. Migrate the drawer's `sidebar` dock to be "Chat Pane in the pane host" so drawer-on-module-page and full-page-split are one system.

### Phase 3 — Consolidation backlog (parallelizable, mechanical)
- Extract shared **secondary-nav record list** component (kills ~7 bespoke panels; start by unifying the contacts/invoices clones).
- Converge offers/invoices/KB document headers on `DetailPageHeader` (extend it if document-y needs aren't met).
- Migrate offers/invoices settings Sheets → `DocSidebar`.
- Card-surface sweep per module (KB → projects → team → files) toward `.ui-canvas-*`.
- Extract shared detail sub-nav tabs; fix stale ui-core docs (Radix → Base UI); consider a kitchen-sink/styleguide route so drift is visible.

## 4. Open questions to discuss

1. **Pane host scope**: does the Module Sidebar stay outside the Workspace (recommended — it's nav, not content), and does the Artifact Pane ever appear on module pages, or only on the chat route initially?
2. **Top bar per pane**: on module pages today `AppTopbar` spans the content area. In split mode, does the View Pane keep the breadcrumb top bar while the Chat Pane has its own — i.e., two top bars side by side (Claude-Desktop style)? (Proposed: yes.)
3. ~~**Artifact identity**~~ **DECIDED 2026-07-13**: first-class persisted entity, proper implementation from the start; UI work decoupled via placeholder artifacts behind the same store interface (see Phase 2 §2).
4. **DocSidebar breakpoint ownership**: pane-width-based (container queries) rather than viewport-based — recommended, since a pane in split mode is narrow even on large screens.
5. **Adopt `react-resizable-panels` for the pane host** or extend the existing `usePersistedEwResizePaneWidth`? (Existing hook has worked for 2 panes; the library buys keyboard a11y + nested layouts if we ever want them.)

## 5. Key files index

Shell frame: `packages/app-shell/src/components/app-layout/app-layout-frame.tsx` · copilot dock engine: `packages/app-shell/src/context/copilot-shell-context.tsx` · page contract: `packages/ui-plugin-sdk/src/page-config.tsx` · shared chat panel: `packages/ai-ui/src/components/copilot/panel/copilot-panel-content.tsx` · tool-call registry: `packages/ai-ui/src/components/copilot/tool-call/tool-call-ui-registry.ts` · thread binding: `packages/ai-ui/src/threads/threads-active-storage.ts` · detail header: `packages/ui-core/src/components/layout/detail-page-header.tsx` · tasks offenders: `modules/tasks/ui/pages/task-detail-page.tsx`, `modules/tasks/ui/components/task-properties-panel.tsx` · offers drawer: `modules/offers/ui/components/offer-settings-panel.tsx` · spec: `docs/agent/DESIGN.md`, `packages/app-shell/docs/shell-layout.md`.
