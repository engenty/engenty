# Agent View Pane — an Engenty opens the app beside its chat

Status: implemented 2026-09-29 on `claude/space-entities-ui-layout-39b5c9`,
not yet live-verified in the browser. Owner: Matthias.

Correction found while implementing: the Contacts Manager **can** import from
chat through `contacts_bulk_import` (approval-gated, ≤ 1000 rows, exact field
names, no mapping/preview/dedupe). The earlier "it can't import" was wrong; the
gap is that nothing opens the wizard. The `contacts-import` skill therefore
defaults to `open_view` and keeps `contacts_bulk_import` for small, already
clean data or an explicit "just do it".

## Problem

A person talks to a Space Engenty on its desk (`/s/<key>/agents/<id>`), asks
"wie kann ich meine Kontakte importieren?", drops a CSV into the chat. Today
the Contacts Manager promises to clean, dedupe, preview and import — and
cannot do any of it. Its tools are `engenty_tools_search`,
`engenty_tool_execute`, `web_search`, `cleanup_csv`, `proposeUpdates`
(`modules/contacts/ai/contacts-manager.ts`). The import wizard at
`/s/<key>/contacts/import` (route `/mdl/contacts/import`) exists and does
the job, but the agent has no way to open it, and the wizard has no way to
receive the file the person already uploaded.

The general shape: an Engenty should be able to **open its module's UI
beside the conversation**, hand over what the person already gave it, and
coach the rest — instead of narrating or hallucinating the module's work.

## What exists

| Piece | Where | Note |
|---|---|---|
| Desk = chat in main + end-pane column | `apps/ui/src/pages/SpaceAgentDeskPage.tsx`, `packages/ai-ui/src/features/agent-desk/desk-frame.tsx` | End pane already stacks artifact, object, work-file, A2UI, browser and settings/runs panes (`packages/app-shell/src/components/app-layout/workspace-end-pane.ts`) |
| Companion frame = app in main + specialist in the copilot side panel | `apps/ui/src/components/copilot-drawer-layer.tsx` ("who" chooser), `packages/ai-ui/src/features/agent-desk/companion-work-chat.tsx` | Same host key and thread as the desk (`agentDeskHostKey(spaceId, agentId)`) |
| Object pane embeds a module's own page | `packages/ai-ui/src/objects/object-pane-body.tsx`, `registerObjectWidget().panel` | Record only (`ObjectRef` = module + entity + id); no pane type for a module **page** |
| Page-driving frontend tools | `modules/engenty-copilot/ai/frontend-tools/*` | `navigate`, `openDialog`, `focusField`, `show_ui_guide`/`update_ui_guide`/`dismiss_ui_guide`, `ui_*` browser-use |
| Grant | `apps/ai/ai/frontend-tools/catalog.ts` (`resolveFrontendToolsForAgent`), `apps/ai/src/ai/sessions/frontend-tool-grant.ts` | Copilot: full set. Engenty: page-driving set only when `uiTools: "on"` or `auto` + Space coordinator. Contacts Manager gets **none** |
| Chat attachment is durable | `packages/ai-ui/src/lib/upload-chat-attachment.ts`, `apps/ai/src/api/attachments/tiered-attachments.ts` | Key `tenants/<t>/chat/<thread>/<ts>_<name>` in file-storage; the run's manifest carries `storage_key`; CSV ≤ 32 KiB is inlined |
| Import wizard | `packages/csv-import/src/hooks/useCSVImportWizard.ts`, `CSVImportWizard.tsx` | All state is local `useState`; `handleFile(content, filename)` is the only way into the mapping step; no URL/route state; shared by contacts, team, secrets (expenses has its own table) |
| Page → agent context | `modules/contacts/ui/hooks/use-contacts-agent-ui-slice.ts` (`useRegisterAgentUiSlice`) | Import page slice is a static sentence; step, filename, unmapped fields are not visible to the agent |
| Decided layout model | `docs/wip/app-shell-unification.md` §2 | Pane types: View Pane (module page), Chat Pane, Artifact Pane. **View Pane is the one not built** |

## Decision

**The agent stays where the person opened it; the app opens in the other
frame.** No drawer/modal rework.

| Frame | App shows in | `open_view` does |
|---|---|---|
| Desk (`/s/<key>/agents/<id>`) | new **View Pane** in the end-pane column | opens / focuses the pane |
| Companion (specialist chosen in the copilot side panel) | main content | `navigate` behaviour, panel stays open |

Why not "app in main, agent in a drawer" as the only mode: that frame is the
copilot dock and already works for specialists (companion). `who-drives.md`
forbids a third front door; the desk is the Engenty's own surface and is
chat-first. Both frames are the same 2-pane split the unification doc plans
to merge (Phase 2 §4), so building the View Pane serves both.

## Plan

### 0. Desk ⇄ companion hand-off

The View Pane's "open full page" escape switches frame instead of leaving
the thread: navigate to the path, open the copilot shell (`?copilot=open`),
set `companionWho = { kind: "engenty", agentId }`. This is the
`navigateFromChat` pattern in
`packages/ai-ui/src/features/agent-desk/copilot-desk.tsx`, currently unset
on specialist desks (`use-desk-object-display-intent.ts`).

### 1. View Pane (`packages/ai-ui/src/artifacts/`)

- `openViewPaneTab(hostKey, { path, title, expanded? })` and
  `closeViewPaneTab` next to `openObjectPaneTab` in `artifact-store.ts`;
  **one View Pane tab per host** (key `view`); a second `open_view`
  replaces its path. Decided 2026-09-29; revisit if two pages are needed
  side by side.
- `ViewPaneBody` resolves `path` against `useUiContributions().routes` with
  the same `matchPath` the `navigate` tool uses
  (`modules/engenty-copilot/ai/frontend-tools/navigate/register.tsx`) and
  renders the route component inside `PageHeaderProvider` +
  `PanelWithPageActions`, exactly like `ObjectPaneBody`. Space mirror paths
  (`/s/<key>/…`) resolve through the same table as `/mdl/…`.
- Pane top bar: title, expand (`setWorkspaceEndPaneExpanded`), open full
  page (step 0), close.
- The embedded page must survive pane width: the import wizard's two-column
  mapping/preview layout needs a container-query breakpoint (unification
  doc §4 Q4). Check `ImportMappingStep.tsx`.

### 2. Frontend tool `open_view`

`modules/engenty-copilot/ai/frontend-tools/open-view/`:

```
open_view { path: string, title?: string, expanded?: boolean }
```

- Validation reuses `navigate/run.ts` (internal paths, module route table).
- Handler picks the target from the host: desk host key → View Pane;
  copilot/companion host → `navigate` + keep panel open.
- Server catalog: add to `getCopilotBaseFrontendTools()`; it belongs to the
  page-driving set, **not** `COPILOT_CHROME_FRONTEND_TOOLS`.
- Result reports which frame it landed in, so the model can phrase "rechts
  neben dem Chat" vs "auf der Seite".

### 3. Grant

Set `uiTools: "on"` in the Contacts Manager `AgentConfig`
(`modules/contacts/ai/contacts-manager.ts`; schema
`packages/ai-core/src/dynamic-contracts.ts`). Same for the team / secrets
managers if they own an import page. Without this the agent has no
`navigate`, `open_view` or `show_ui_guide` in either frame. Keep the
`auto` rule as is — this is a per-row opt-in, not a policy change.

### 4. File hand-off into the wizard

- `CSVImportWizard` accepts an initial file from the URL:
  `?file=<storage_key>&name=<filename>`. On mount it fetches the bytes and
  calls `handleFile`. Done once in `packages/csv-import`, so contacts, team
  and secrets get it.
- Download exists: `GET /api/file-storage/files/url?key=…` returns a
  short-lived signed read URL after `assertKeyInTenant`
  (`apps/core/src/api/routes/file-storage-routes.ts:570`); browser helper
  `getFileStorageSignedUrl` in
  `packages/ai-ui/src/lib/file-storage-signed-url.ts`. `csv-import` must not
  depend on `ai-ui` — move the helper to `@engenty/api-client` or duplicate
  the 6 lines in `csv-import`.
- The agent calls
  `open_view { path: "/s/<key>/contacts/import?file=<storage_key>&name=…" }`
  with the `storage_key` from the attachment manifest.
- Guard: the wizard only accepts keys under the caller's tenant prefix; the
  server enforces it, the client only formats.

### 5. Contacts Manager import skill

`modules/contacts/ai/skills/contacts-import/SKILL.md` + a paragraph in
`agents/contacts.manager/AGENTS.md`:

- File attached → optional `cleanup_csv` (only when the manifest shows the
  content, ≤ 32 KiB) → `open_view` with the file → tell the person the
  wizard is open and what to check (Import-ID, unmapped required fields).
- No file → `open_view` the import page; explain the three ways in
  (file/paste, Google Contacts, Google Drive / local files) and that
  "Verbinden" starts OAuth from the page.
- Never claim to dedupe, preview or import in chat. The wizard does
  matching by Import-ID / Reference-ID row by row
  (`modules/contacts/ui/pages/contacts-import-page.tsx` `handleImport`).
- `show_ui_guide` to spotlight AI Mapping / Import-ID: add
  `data-engenty-region` markers to `ImportMappingStep.tsx` sections.

### 6. Wizard → agent context

Replace the static slice in `use-contacts-agent-ui-slice.ts` with live
state from `useCSVImportWizard`: `step`, `filename`, `row_count`,
`column_count`, `mapped_fields`, `unmapped_required_fields`, `match_by`.
Slices reach every `EngentyAgent` on the page, so the companion-frame
specialist sees it immediately; the desk-frame specialist sees it once the
View Pane is mounted (the slice registers from inside the embedded page).

Later, not in this plan: a page-owned frontend tool
`contacts_import_apply_mapping` so the agent can set mappings from chat
(pattern: `contacts_apply_draft_patch` in `contact-edit-page.tsx`).

## Implementation map

| Step | Where |
|---|---|
| 0 desk → companion hand-off | `packages/ai-ui/src/features/agent-desk/agent-desk.tsx` (`openViewFullPage`) |
| 1 View Pane | `packages/ai-ui/src/artifacts/{artifact-store,view-pane-body,view-pane-routes,view-pane-host}.ts(x)`; the page runs under a private in-memory history provided through the router's contexts (a second `<Router>` is not allowed) |
| 2 `open_view` | `modules/engenty-copilot/ai/frontend-tools/open-view/`; the desk registers itself as host (`DeskFrame`), no desk showing → `navigate` |
| 3 grant | `modules/contacts/ai/{contacts-manager,registrar}.ts` (`uiTools: "on"`) |
| 4 file hand-off | `packages/csv-import/src/initial-import-file.ts`, read by `CSVImportWizard` (`?file=&name=`) |
| 5 skill | `modules/contacts/ai/skills/contacts-import/SKILL.md`, `AGENTS.md` |
| 6 wizard → agent | `onStateChange` on `CSVImportWizard` → `useContactsImportAgentUiSlice(wizard)` |

Not done: `data-engenty-region` markers for `show_ui_guide`; grant for the team
and secrets managers (no such agents found); `expanded` default stays `false`.

## Order and gates

| Step | Blocks | Gate |
|---|---|---|
| 3 grant | nothing | `pnpm ai:check` |
| 1 View Pane | 2, 6 (desk frame) | live-verify on `https://engenty.localhost/s/<key>/agents/<id>` |
| 2 `open_view` | 4, 5 | unit test on host → frame choice; e2e smoke: desk asks agent to open import |
| 4 file hand-off | 5 | e2e: attach CSV on desk → wizard opens in mapping step with the rows |
| 5 skill | — | manual transcript review; no capability claims beyond tools |
| 0 hand-off | — | live-verify desk → companion keeps the thread |
| 6 context slice | — | agent answers "welche Felder fehlen?" from the slice |

Commit scopes: `feat(ai-ui): view pane`, `feat(engenty-copilot): open_view`,
`feat(csv-import): load file from storage key`, `feat(contacts): import skill`.

## Open questions

1. ~~Signed download route~~ — exists, see step 4.
2. Should `open_view` on a desk default to `expanded: true` for wizards
   (mapping step needs width) and `false` for list pages? Undecided;
   ship with `expanded` as an explicit tool arg, default `false`, and
   decide after seeing the import wizard at pane width.
3. ~~Tabs~~ — one View Pane per host, replace on second call (step 1).
