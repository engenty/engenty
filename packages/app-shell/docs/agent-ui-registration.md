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
| `useRegisterAgentUiField(id, refOrFocus)` | Named focus target for global `focusField` tool |
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

## Typical module pattern

```tsx
import { useRegisterAgentUiSlice } from "@engenty/app-shell";

export function useTasksAgentUiSlice(taskId: string, status: string) {
  useRegisterAgentUiSlice("tasks_detail", {
    page: { entity: "task", id: taskId },
    selection: { status },
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
