---
title: Frontend tools
description: Official AG-UI Tool shape with Engenty metadata and run-scoped browser execution.
---

# Frontend tools

Frontend tools describe **browser-side actions** an agent may request: `navigate`, `openDialog`, `focusField`, module draft patches, shell theme/locale, etc.

Definitions are official AG-UI `Tool` objects. Input JSON Schema lives on `parameters`. Engenty-only fields live under `metadata.engenty`.

## Metadata (`Tool.metadata.engenty`)

| Field | Values | Purpose |
|-------|--------|---------|
| `availability` | `enabled` \| `disabled` \| `remote` | Registration and tenant gating |
| `owner_module_id` | module slug | Tenant/effective-state gating for module-owned tools |
| `title` | string (optional) | Human label in tool-call rows |

There is **no per-tool approval flag**. Frontend tools always auto-execute — dispatching a browser-side tool call is not itself the risky step, and the old `safety: "safe" | "requires_confirmation"` gate was removed in `6b81ff814` because it fired on every call regardless of what the tool did, and did not hold reliably. Guard genuinely destructive actions where the risk actually lives: connector approval policies, backend tool approval, and the agent's own prompt.

## Who gets them

A frontend tool mutates **client-local state the server cannot reach** —
navigation, focus, dialogs, theme, the copilot's own chrome, driving the page.
Presentation does not qualify and is not a frontend tool: `show_artifact` and
`show_objects` are backend tools whose results each surface renders itself.

The line matters because a frontend tool **suspends the run** until a client
resumes it. An agent holding one on a surface that cannot resume — a background
task job, a messaging channel — parks forever the first time a model reaches for
it. `resolveFrontendToolsForAgent` (`apps/ai/ai/frontend-tools/catalog.ts`) is
the single seam; the executor, its resume leg, the session service and the
prompt block all call it, so what the model is told it has cannot drift from
what it holds.

| Tier | Agents | Gets |
|---|---|---|
| copilot | `engenty.copilot`, `engenty.cli` | server catalog + client-registered |
| chatbot | `chatbot.*` | client-registered only |
| worker | everything else — specialists, `*.answers`, coordinator | none |
| — | a caller that sent no `tools` and no `state` | none |

The last row is not a tier but the same rule: no client, no catalog. The shell
registers its whole catalog globally and ships it with every run, so restricting
the *server* half alone would still leave a specialist holding `navigate`, the
`browser_*` tools and the copilot's chrome.

## Define a tool

```ts
import { createFrontendToolDefinition, toAgUiTool } from "@engenty/ag-ui-bridge";

const navigate = createFrontendToolDefinition({
  name: "navigate",
  description: "Navigate to an internal app path.",
  availability: "enabled",
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

Every frontend tool executes through the **native AG-UI suspend/resume path**. There is no
side-channel POST endpoint and no in-memory waiter:

1. The model calls the native Mastra tool by name; its `execute()` calls `context.suspend()`.
2. The harness persists an `ag_ui_open_interrupt` (`kind: "frontend_tool"`, includes `run_id`) and ends
   the run with a `RUN_FINISHED` interrupt outcome carrying `FrontendToolInterruptPayload[]`.
3. `useAutoResolveFrontendTool` in `@engenty/ai-ui` resolves every `frontend_tool` interrupt
   unconditionally and the browser runs the handler. The suspend here is transport, not a gate.
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

## UI guide (spotlight / highlight / modal)

Base-catalog tools `show_ui_guide` / `update_ui_guide` / `dismiss_ui_guide`:

| `presentation` | Behavior |
|----------------|----------|
| `spotlight` (default) | Dimmed backdrop + cutout + anchored popout; `target` required |
| `highlight` | Ring around target, no dimming; anchored popout; `target` required |
| `modal` | Centered dialog + full backdrop; `target` optional (soft ring when set) |

Action area: button row (`actions`, default OK) plus optional `input` (label / text\|textarea / required) or `inputs[]` for several named fields. `show_dismiss` defaults true. Default `wait: false` returns after show; `wait: true` holds until the user acts (3 min execution timeout). Non-wait actions inject a `[ui_guide] …` user message into the active copilot lane.

Shell marks regions with `data-engenty-region` (`app-bar`, `sidebar`, `topbar`, `main`). Modules should mark list/detail roots. See [Agent UI registration](../app-shell/agent-ui-registration#dom-regions-data-engenty-region).

## Related

- [Agent UI state](./agent-ui-state) — `permissions.frontend_tools` in snapshots
- [AG-UI apps/ai session](../../ai-agents/ag-ui-apps-ai-session) — end-to-end run flow
- [@engenty/ai-ui copilot tool-call registry](../ai-ui/copilot/tool-call-registry) — presentation for tool rows
