# Phase 8 — Local recovery store (optional)

**Status:** partial (2026-05-19 — composer draft `localStorage` v1 implemented; IndexedDB / in-flight run buffer deferred)  
**Depends on:** Track B complete (phases 5–7)  
**Does not block** copilot chat refactor sign-off

Recover **UX state** when the network, tab, or run is interrupted — without reintroducing a second canonical transcript.

## Non-goals

- Replacing `ai.agent_session` as source of truth
- Merging local rows into `messages` by text dedupe
- Syncing local ids with server ids (server always wins on snapshot)

## Use cases

| Case | Store | Reconcile |
|------|-------|-----------|
| Composer draft lost on refresh | `localStorage` key per `threadId` or `new` | Restore draft to input only |
| Tab closed mid-stream | Optional IndexedDB: `runId`, last event index | On reopen: fetch server messages; if server has transcript, **discard** local partial |
| Server slow to persist first user row | Show `pendingSend` (Phase 6) | `MESSAGES_SNAPSHOT` clears pending |
| Offline queue (future) | Outbox table | Replay POST when online; until ack, show pending only |

## Design sketch

```ts
type CopilotLocalRecoveryV1 = {
  version: 1;
  tenantId: string;
  userId: string;
  threadId: string | "new";
  composerDraft?: string;
  lastRun?: {
    runId: string;
    startedAt: number;
    // optional: serialized AG-UI events for debug-only replay
  };
};

const storageKey = (t: string, u: string, s: string) =>
  `engenty:copilot:recovery:${t}:${u}:${s}`;
```

### Write rules

- Write composer draft on debounced input change (module or shell).
- Clear draft on successful submit (`MESSAGES_SNAPSHOT` or explicit ack).
- Never write `composerDraft` into `conversation.messages`.

### Read rules on mount

```ts
function useCopilotLocalRecovery(threadId: string | null) {
  const draft = readRecovery()?.composerDraft ?? "";
  // Apply to controlled composer value only
  // If server messages load and draft matches last persisted user text, clear draft
}
```

## Exit criteria (when implemented)

- [x] Package or module helper with tests (no React in core helper) — `packages/ai-ui/src/copilot/local-recovery.ts` + Vitest
- [x] Feature flag or env: off by default until QA — `VITE_COPILOT_COMPOSER_DRAFT_RECOVERY=true`
- [x] Documented in [ag-ui-apps-ai-session.md](../../../docs/content/dev/ai-agents/ag-ui-apps-ai-session.md) under “Recovery”
- [ ] Manual test: type draft → refresh → draft restored; submit → draft cleared; no duplicate messages

## Tasks (backlog)

- [x] Choose storage: `localStorage` v1, IndexedDB if event buffer needed
- [x] Implement `packages/ai-ui/src/copilot/local-recovery.ts` (or `modules/engenty-copilot/ui/lib/`)
- [x] Wire composer in copilot panel + drawer
- [x] Privacy review: no secrets in draft; tenant-scoped keys (draft is plain composer text only; keys include tenant + user)
- [ ] IndexedDB interrupted-run buffer (optional)

Implement only after Track B grep gates stay green for two weeks of daily use.
