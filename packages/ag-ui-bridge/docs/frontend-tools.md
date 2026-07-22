---
title: Frontend tools
description: Official AG-UI Tool shape with Engenty metadata, safety, and run-scoped browser execution.
---

# Frontend tools

Frontend tools describe **browser-side actions** an agent may request: `navigate`, `openDialog`, `focusField`, module draft patches, shell theme/locale, etc.

Definitions are official AG-UI `Tool` objects. Input JSON Schema lives on `parameters`. Engenty-only fields live under `metadata.engenty`.

## Metadata (`Tool.metadata.engenty`)

| Field | Values | Purpose |
|-------|--------|---------|
| `availability` | `enabled` \| `disabled` \| `remote` | Registration and tenant gating |
| `owner_module_id` | module slug | Tenant/effective-state gating for module-owned tools |
| `safety` | `safe` \| `requires_confirmation` | Whether the harness pauses for user approval |
| `title` | string (optional) | Human label in confirm UI |

Default mutating tools to `requires_confirmation`. Use `safe` only when scoped, reversible, and not persisting data without a separate user action.

## Define a tool

```ts
import { createFrontendToolDefinition, toAgUiTool } from "@engenty/ag-ui-bridge";

const navigate = createFrontendToolDefinition({
  name: "navigate",
  description: "Navigate to an internal app path.",
  availability: "enabled",
  safety: "safe",
  owner_module_id: "engenty-copilot",
  parameters: {
    type: "object",
    properties: { to: { type: "string" } },
    required: ["to"],
  },
});

// RunAgentInput.tools
const tools = [toAgUiTool(navigate)];
```

Module trees register definitions from `modules/<name>/ai/frontend-tools/` and pass merged catalogs through `@engenty/ai-ui` into `RunAgentInput.tools`.

## Wire execution (official events)

Browser execution uses **official AG-UI tool call events**:

- `TOOL_CALL_START` / `TOOL_CALL_ARGS` / `TOOL_CALL_END`
- `TOOL_CALL_RESULT`

Legacy `engenty.frontend_tool.*` custom events are rejected in `@engenty/ai-ui` dispatch tests.

## Native suspend/resume

All frontend tools — `safe` and `requires_confirmation` alike — execute through the **native AG-UI
suspend/resume path**. There is no side-channel POST endpoint and no in-memory waiter:

1. The model calls the native Mastra tool by name; its `execute()` calls `context.suspend()`.
2. The harness persists an `ag_ui_open_interrupt` (`kind: "frontend_tool"`, includes `run_id`) and ends
   the run with a `RUN_FINISHED` interrupt outcome carrying `FrontendToolInterruptPayload[]`.
3. The browser runs the handler — immediately for `safe`, after confirmation for `requires_confirmation`.
4. The client resumes by posting a new run with `resume: [{ interruptId, status: "resolved", payload }]`;
   the harness calls `agent.resumeStreamUntilIdle(output)` and the agent receives the tool result.

The `run_id` in the interrupt payload ties the browser result back to the suspended Mastra run. See
[frontend-tool-interrupt-resume.md](../../../modules/engenty-copilot/dev/frontend-tool-interrupt-resume.md)
for the full sequence.

## Validation

- `isFrontendToolDefinition` — official `ToolSchema` + required `metadata.engenty`
- `getFrontendToolInputValidationError` — shared guards (e.g. internal paths for `navigate`)
- `@engenty/ai-core` — `filterAgentUiFrontendToolsByTenant`, `stripModuleOwnedAgentUiFrontendTools`

## Browser use (copilot SPA)

Client-registered tools under `modules/engenty-copilot/ai/frontend-tools/browser-use/`:

| Tool | When to use |
|------|-------------|
| `browser_dom_snapshot` | **Preferred** — pruned interactive DOM. Pass `root_selector` from Current page `dom_entry_points` (`main` / `list` / `detail` / chrome regions). |
| `browser_screenshot` | **Last resort** — text viewport inventory for visual/layout questions the DOM cannot answer (not pixels). |
| `browser_click` / `browser_hover` / `browser_focus` / `browser_input` / `browser_scroll` | Drive the UI using selectors from a DOM snapshot. |

Shell marks regions with `data-engenty-region` (`app-bar`, `sidebar`, `topbar`, `main`). Modules should mark list/detail roots. See [Agent UI registration](../app-shell/agent-ui-registration#dom-regions-data-engenty-region).

## Related

- [Agent UI state](./agent-ui-state) — `permissions.frontend_tools` in snapshots
- [AG-UI apps/ai session](../../ai-agents/ag-ui-apps-ai-session) — end-to-end run flow
- [@engenty/ai-ui copilot tool-call registry](../ai-ui/copilot/tool-call-registry) — presentation for tool rows
