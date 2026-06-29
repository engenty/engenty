---
title: Agent UI state
description: Bounded AgentUiStateSnapshotV1 contract, signatures, and validation for AG-UI runs.
---

# Agent UI state

Engenty sends **bounded, explicit UI context** to agent runs through official AG-UI `RunAgentInput.state`. The canonical shape is `AgentUiStateSnapshotV1` (version `1`).

## Snapshot rules

- Register state slices intentionally from `@engenty/app-shell` — never scrape the DOM.
- Keep snapshots JSON-serializable.
- Do **not** include auth tokens, file contents, hidden form secrets, or full query result sets.
- Prefer entity ids, visible labels, selected ids, active tabs, dirty fields, and compact draft values.
- Call `assertAgentUiStateSnapshotWithinLimit()` before sending or persisting.

Default max size: **32 KiB** (`AGENT_UI_STATE_SNAPSHOT_MAX_BYTES`). `isAgentUiStateSnapshotV1` rejects oversize payloads.

## Shape (v1)

Top-level fields:

| Field | Purpose |
|-------|---------|
| `snapshot_id`, `sequence`, `observed_at`, `version` | Identity and ordering |
| `route` | `module_id`, `pathname`, `route_key` |
| `shell` | Copilot open/dock, optional active dialog |
| `selection` | Entity id/type, focused field, selected ids |
| `draft` | Dirty flag and compact field map |
| `page` | Module-specific compact page payload |
| `permissions.frontend_tools` | Per-tool availability and confirmation flags |

Deltas use `AgentUiStateDeltaV1` with JSON Patch `operations` when consumers publish incremental updates.

## Signatures

- `agentUiBaseShellSignature` — route + shell + selection only (used to bump sequence on navigation/shell changes).
- `agentUiSharedStateSignature` — includes `sequence` so AG-UI clients detect any published revision.

Used by `@engenty/app-shell` and `@engenty/ai-ui` (`useSyncAgentUiRunState`) to avoid redundant run input churn.

## Consumers

| Consumer | Usage |
|----------|--------|
| `@engenty/app-shell` | Builds and publishes snapshots from registered slices |
| `@engenty/ai-ui` | Embeds snapshot in `RunAgentInput.state` via `buildAppsAiRunInput` |
| `apps/ai` | Validates snapshot on run routes |
| `@engenty/ai-core` | `buildAgentSystemPromptFromUiState`, tenant tool gating context |

## API

```ts
import {
  type AgentUiStateSnapshotV1,
  assertAgentUiStateSnapshotWithinLimit,
  isAgentUiStateSnapshotV1,
  agentUiSharedStateSignature,
} from "@engenty/ag-ui-bridge";
```

See [Architecture](./architecture) for ownership boundaries.
