# Active copilot v1 — one copilot, many view modes

**Status:** shipped. Product contract for the main copilot host — not a migration plan.

**Code:** `packages/ai-ui/src/agent-provider/host-keys.ts` (`ENGENTY_COPILOT_HOST_KEY`, `ACTIVE_COPILOT_AGENT_ID`), `CopilotRiverProvider` in `@engenty/ai-ui`, `AppActiveCopilotProvider` in `apps/ui`.

## Vocabulary

| Term | Meaning |
|------|---------|
| `hostKey` | Client registry handle for one AG-UI controller (`engenty:copilot`, `kb:search`, …) |
| `threadId` | Durable server transcript id — for the copilot, THE RIVER: one per user per tenant, the copilot's space-less DM |
| `agentId` | Which agent config/tools run (`engenty.copilot`, …) |

**Rule:** one `threadId` per `hostKey`. On `engenty:copilot` it is always the river; there is no thread list and nothing to pick.

## Product decisions

| # | Topic | Decision |
|---|--------|----------|
| 1 | Main host key | **`engenty:copilot`** — not `copilot:drawer` / `copilot:panel` |
| 2 | KB search / talk | Separate host **`kb:search`** in `modules/knowledge-base` |
| 3 | Navigation | Same transcript across routes; `routeContext` updates only |
| 4 | Full-page URL | `/copilot` and `/s/<key>/copilot` name no thread; companion + page show the river |
| 5 | Multi-window | Every tab is on the river; tabs sync via realtime / run attach |
| 6 | Visible UI slot | One shell surface at a time; the river's page hides the companion chrome (`chromeHidden`), the blob stays |
| 7 | `contribution.requestedAgentId` | Dev warn + ignore on main host; lane stays **`engenty.copilot`**. Composer `@agent` mentions may pass `requestedAgentId` on submit, but the session layer does not honor it |
| 8 | Module actions (e.g. Enhance) | **Not** the main copilot host — today they run as dispatched **actions** (`WorkflowButton` / workforce), not as `{module}:action:…` `EngentyAgent` mounts |
| 9 | Model chooser | UI detail on the main host (expert control) — not a host split |
| 10 | Full-page entry | The river, always; no `/new` — the river is cut into chapters, not into threads |

**Distinction:** `hostKey` `engenty:copilot` (UI handle) vs `agentId` `engenty.copilot` (registry id).

## Mount rules

- **Global in `apps/ui`:** only `engenty:copilot` via `AppActiveCopilotProvider`.
- **Module-local `EngentyAgent`:** e.g. KB hub (`kb:search`) — never mounted beside `AppLayout` in core.
- View modes (floating, drawer, bottom, full-page) are presentation only; they must not remount or swap the main host.

## Session rules

1. The river is the only `threadId` on `engenty:copilot`.
2. Route changes keep the transcript; only context changes.
3. `/copilot` and `/s/<key>/copilot` open the river; the space in the URL stamps the turn's context, not the thread.
4. Companion chrome hidden while the river's page is primary; host stays mounted.
5. KB / other hosts own their own threads and must not mutate `engenty:copilot`.

## Future multi-pane (not v1)

Prefer stable ids, not indices:

| Use case | `hostKey` pattern |
|----------|-------------------|
| Default (today) | `engenty:copilot` |
| In-app chat tabs | `engenty:copilot:tab:{tabId}` |
| Kanban / card | `engenty:copilot:card:{cardId}` or `task:assist:{taskId}` |
| KB hub | `kb:search` |

## Message authority (non-negotiable)

- `MESSAGES_SNAPSHOT` → full replace
- Server owns message ids
- `pendingSend` is in-run UI only — not a second canonical row
