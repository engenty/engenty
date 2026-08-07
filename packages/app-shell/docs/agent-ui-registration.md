---
title: Agent UI registration
description: Browser-side UI snapshots and frontend tools via AgentUiStateProvider and hooks.
---

# Agent UI registration

`@engenty/app-shell` collects **compact, JSON-serializable** UI state and **browser frontend tools** while the user works in the product shell. `@engenty/ai-ui` merges this registry into AG-UI `RunAgentInput` when starting or continuing runs.

Wire shapes and size limits are defined in `@engenty/ag-ui-bridge` — see [Agent UI state](../ag-ui-bridge/agent-ui-state).

## Provider

`AgentUiStateProvider` is mounted inside `CopilotShellProvider` in the app bootstrap. Module pages do not mount their own provider.

## Hooks

| Hook | Purpose |
|------|---------|
| `useRegisterAgentUiSlice(id, slice)` | Register `page` / `selection` / `draft` partials for the current route |
| `useFrontendTool(definition, handler)` | Register a browser tool the agent can invoke |
| `useRegisterAgentUiDialog(id, opener)` | Named target for global `openDialog` tool |
| `useRegisterAgentUiField(id, refOrFocus)` | Named focus target for global `focusField` / `show_ui_guide` (`field_id`). Prefer a **ref** when guides need a DOM anchor. Function-only handlers still work for focus; guide targeting resolves via `data-agent-ui-field`, then form `name` (last id segment) inside `[data-engenty-region="main"]` — never the copilot composer. |
| `useAgentUiFieldElement()` | Resolve a registered field to an `HTMLElement` (for guides / overlays) |
| `useAgentUiStateSnapshot()` | Read merged snapshot for debugging or local observers |
| `useAgentUiFrontendTools()` | List registered tool definitions |
| `useAgentUiFrontendToolExecutor()` | Execute a tool call from copilot UI (apps/ui drawer layer) |

Module-owned tools should set **`definition.owner_module_id`** so `apps/ai` can apply tenant capability gating. Platform tools omit it.

## Frontend tool helpers

The main entry re-exports from `@engenty/ag-ui-bridge` for convenience:

```ts
import {
  createFrontendToolDefinition,
  toAgUiTool,
  type FrontendToolDefinition,
  type AgentUiFrontendToolHandler,
} from "@engenty/app-shell";
```

Prefer `@engenty/ag-ui-bridge` in non-UI packages; app-shell re-exports keep module UI imports on one package alongside shell hooks.

## Snapshot rules

State must stay **small and redacted**:

- Prefer ids, labels, visible field names, compact draft values
- Do **not** register secrets, tokens, hidden fields, file contents, or large table payloads
- `assertAgentUiStateSnapshotWithinLimit` runs in ai-ui when building runs (bridge contract)

Slices should use stable **`id`** keys per route or feature (`tasks_detail`, `contacts.edit`). Avoid registering duplicate ids across sibling routes without unregistering on unmount (hooks clean up on unmount).

## Page brief (reserved `page` keys)

Prefer a shared **page brief** plus a compact module snapshot. The main copilot harness (`formatAgentUiStateHarnessInstructions` in `@engenty/ai-core`) renders a **Current page** section from these keys (size-bounded), so `engenty.copilot` sees where the user is without guessing.

| Key | Purpose |
|-----|---------|
| `page_type` | `list` \| `detail` \| `settings` \| `briefing` \| module-specific string |
| `page_title` | Human title (breadcrumb-level) |
| `page_description` | One short NL sentence of what the user is looking at |
| `list_search` | Active search |
| `list_filters` | Compact map of active filters |
| `list_total` | Visible/total count when known |
| `list_preview` | Optional capped rows `{ id, label, … }` (or keep existing `*_preview` keys) |
| `dom_entry_points` | CSS selectors for shell/page regions (`app_bar`, `sidebar`, `topbar`, `main`, plus `list` / `detail` by page type). Auto-filled by `buildAgentUiPageBrief`; override/extend via input. |

Keep module-specific keys (`task_snapshot`, `inbox_thread_snapshot`, …) alongside the brief. Build the brief with `buildAgentUiPageBrief` from `@engenty/app-shell` (re-exported from `@engenty/ag-ui-bridge`).

### DOM regions (`data-engenty-region`)

Shell registers stable regions for agent `browser_dom_snapshot` scoping:

| Region | Selector | Element |
|--------|----------|---------|
| `app-bar` | `[data-engenty-region="app-bar"]` | Primary nav rail |
| `sidebar` | `[data-engenty-region="sidebar"]` | Module secondary nav column |
| `topbar` | `[data-engenty-region="topbar"]` | App topbar |
| `main` | `[data-engenty-region="main"]` | `#engenty-app-main` content root |

List/detail pages should mark their content root with `data-engenty-region="list"` or `"detail"` so agents avoid scraping whole-page chrome. Prefer **browser_dom_snapshot** with these entry points over **browser_screenshot** (last resort for visual/layout questions).

## Typical module pattern

```tsx
import {
  buildAgentUiPageBrief,
  useRegisterAgentUiSlice,
} from "@engenty/app-shell";

export function useTasksAgentUiSlice(taskId: string, title: string) {
  useRegisterAgentUiSlice("tasks_detail", {
    page: {
      ...buildAgentUiPageBrief({
        page_type: "detail",
        page_title: title,
        page_description: "Task detail page.",
      }),
      task_snapshot: { id: taskId, title },
    },
    selection: { entity_id: taskId, entity_type: "task" },
  });
}
```

Call from the detail page under `CopilotShellProvider`.

## Execution path

```text
Module useFrontendTool
        │
        ▼
AgentUiStateProvider (app-shell)
        │
        ▼
useAgentUiFrontendTools / snapshot (ai-ui buildAppsAiRunInput)
        │
        ▼
apps/ai AG-UI run → tool call → browser executor (drawer / module handler)
```

## Related docs

- [@engenty/ag-ui-bridge — Agent UI state](../ag-ui-bridge/agent-ui-state)
- [@engenty/ag-ui-bridge — Frontend tools](../ag-ui-bridge/frontend-tools)
- [Agent UI runtime](../../../docs/dev/agent-ui-runtime.md)
- [Module copilot integration](../../../docs/dev/module-copilot-integration.md)
- [@engenty/ai-ui architecture](../ai-ui/architecture)
