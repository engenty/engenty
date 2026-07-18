# team-chat — test plan

Status: living document (2026-07-18). Automated coverage runs in CI
(`pnpm --filter @engenty/team-chat test` + repo `check`/`typecheck`); the manual
matrix is the release gate for module changes and has been executed against the
worktree dev stack (slot 4, `pnpm dev:portless --domain=team-chat`).

## 1. Automated (vitest, module-scoped)

| Area | File | Covers |
|---|---|---|
| Mention parsing | `src/lib/mentions.test.ts` | token extraction (user/agent/here/channel), dedupe, lowercase-normalization, malformed-token rejection; DM `memberHash` order/case-insensitivity |
| Agent dispatch | `src/api/agent-mention-queue.test.ts` | one dispatch per distinct agent, user/broadcast mentions ignored, root-ts threading, null-queue no-op |
| Activity lines | `src/lib/activity.test.ts` | status transitions, title + clamped comments, missing payloads |
| Mention rendering | `ui/lib/format.test.ts` | fragment-href mention links, plain-text previews, deterministic author colors, message grouping window |

Repo gates: `biome check`, module `tsc --noEmit`, tsup build (all green as of
2026-07-18). DB-level invariants (ts uniqueness/retry, thread rollups ±,
mention insert, tombstones) were verified directly against the dev DB inside a
rolled-back transaction (Phase 1) — promoting those into a pgTAP or
testcontainer suite is the main automation gap.

## 2. Manual E2E matrix (browser, dev stack)

Legend: ✅ verified (date) · ◻ not yet re-verified after latest change.

**Core messaging (Phase 1)** — all ✅ 2026-07-17
- Create channel (dialog, duplicate-name error), sidebar updates live
- Post message; markdown (bold/code) renders; day divider; author grouping
- Thread: reply, rollup count + participants on parent, live update w/o reload
- DMs: open, dedup on reopen (same conversation id), peer naming
- Read cursors: unread badge appears for other-authored posts, clears on view

**Rich content (Phase 2)** — all ✅ 2026-07-17
- Reaction add via API appears live (postgres_changes), pill toggle off via UI
- Mention popover: filter, keyboard nav, token insert; mention row persisted
- Edit-in-place with `(edited)`; delete tombstone; pins add/list
- Lexical search finds messages, membership-scoped, deep-links

**Agents (Phase 3)** — ✅ 2026-07-17
- @agent mention → queued → consumer runs agent → threaded agent-authored
  reply with AGENT badge + View-run link; `agent_thread_links` row written
- Kill-switch honored; malformed queue payloads dropped with log

**Project binding + activity (Phase 4)** — ✅ 2026-07-18
- Chat tab hidden by default, enabled via project tab-config dialog
- Create+bind names channel from project title; embedded view renders
- Task status change → readable activity line in bound channel

**Attachments + emoji** — ✅ 2026-07-18
- Paste image → chip w/ thumbnail → upload → inline image render (signed URL)
- File picker path; attachment-only send; emoji insert at cursor

**Phase 5 additions**
- ✅ Flat project-tab styling (no card chrome) — 2026-07-18
- ✅ Mention chips show colored backgrounds (light + dark) — 2026-07-18
- ◻ Channel details popover: members list, invite user, invite agent, remove
  member, activity toggle suppresses/permits activity lines
- ✅ Workspace search returns channel messages (`team-chat.message` source);
  DMs never appear in results — 2026-07-19. Backfill 14/0 processed/failed →
  13 channel docs (the lone `im` message excluded); a freshly posted message
  auto-indexes via `onEvents` in <5 s; both `team_chat_message_search` and the
  federated `core_workspace_search` return the hit.
  - Regression fixed here: the source selected `messages.scope_id` (that column
    lives on `conversations`), so every `buildDocument` threw and indexing
    silently produced **zero** documents on both the live and backfill paths.
    Read `scope_id` from the embedded `conversations` join. **Add a check to the
    security/regression list: after any schema change, re-run a backfill and
    assert `failed === 0`** — swallowed `onError` makes this failure invisible
    in the UI.

## 3. Security/regression checklist (each release)

- Private channel/DM invisible to non-member: list, info, history, search,
  realtime (second browser session)
- Agent cannot post to a private channel it is not a member of
- Service caller cannot post non-`subtype` messages
- `<@u:…>` tokens never leak raw ids in previews (plain-text rendering)
- After any `messages`/`conversations` schema change: run the `team-chat.message`
  backfill and assert `failed === 0` (indexing errors are swallowed by the host's
  `onError`, so a broken `buildDocument` shows no UI symptom)

## 4. Known gaps / future automation

- pgTAP/testcontainers for DB functions + RLS (§1 note)
- Playwright flow for the §2 matrix (blocked on shared login fixture)
- Bridge (Phase 6) contract tests: mrkdwn↔markdown, id mapping, loop guard
