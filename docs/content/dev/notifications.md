---
title: Notifications
description: The core notification system — one record per signal, decide-in-place bodies, resolve-by-subject, streams and channels — and how a module registers a kind and a body.
---

# Notifications (`@engenty/notifications`)

A notification is a pointer to something a person can open or decide. It
carries **who**, **where** and **what**; it disappears when that thing is
handled, wherever it was handled. It is a signal, never a work item: a
`todo` points at the task it is about, it is not the task.

Concretely, for every kind that is not `update`:

1. **Origin** — actor label, space, and a summary written for a person.
2. **Action** — an inline body that decides it, or a deep link to the surface
   that does. Never neither.
3. **Closure** — the seam that handles the subject resolves the record.
   "Seen" hides an FYI; it never stands in for a decision.
4. **One row per open question** — re-asks coalesce into the open row.

## The record

`core.notifications`, owned by `packages/notifications` (a mandatory
`kind: "package"` plugin). One row, four coordinates:

| column | meaning |
|---|---|
| `tenant_id` | always |
| `space_id` | the space it belongs to; `null` = tenant-global |
| `audience_kind` / `audience_id` | who sees it: `space` (+ id — everyone who may enter), `tenant`, `user` (+ id) or `stream` (+ key). Resolved at emit by the audience ladder, place before person: explicit → a private subject's participants (one row each) → the space → the task assignee (assigned work is a person; so is a task outside any space) → tenant. An FYI (`update`) stays person-first: assignee → owner → initiator → space → tenant |
| `class` | `decision` · `alert` · `todo` · `update`, derived from the registered kind |

`subject_type` / `subject_id` name the thing the record is about
(`run`, `task`, `approval_request`, `thread_interrupt`, `thread`, `agent`) so
the seam that settles it can resolve every open record with one indexed query.

**First to answer wins.** The right to resolve a record is never on the row:
it belongs to the subject (core's approval route checks the request's
`owner_user_id`, a chat interrupt checks the thread's write access). A row
about shared work is addressed to its place so everyone who may act sees it;
whoever answers first closes it for all — resolve is by subject, one write.
The run's initiator and the routine's owner are *subscribers* (pushed,
mailed — `subscribers`, `ownerUserId`, `initiatorUserId` on emit), never the
audience of shared work. A person is the audience only when the subject is
theirs: a connection they own, a private room (its participants, one row
each), a personal agent's thread, assigned work.

**Seen is per person.** `core.notification_seen` holds one row per
(notification, viewer); the record's `status` is `pending` · `dismissed` ·
`resolved` and never "seen". The list returns `seen` for the caller; the
badge counts pending rows the caller has not seen. A merged re-ask forgets
everyone's seen. A decision is never dismissed (`POST …/dismiss` → 422
`notifications.decideInstead`): it is answered. `dedupe_key` merges
an exact repeat while pending; `coalesce_key` merges a *different* ask about
the same thing (optionally within a window) into the open row, `×N`.

Origin rides `metadata` under fixed keys the list reads:
`actor_label`, `actor_ref` (`agent:<id>` | `user:<id>`), `space_key`,
`space_name`, plus `thread_id` / `thread_agent_id` / `task_id` /
`routine_id` where known. The service fills the labels from ids on every emit
(`origin` option on the host), so a producer only needs ids.

## Kinds and classes

| class | kinds | on the badge |
|---|---|---|
| `decision` | `approval_requested`, `tool_approval`, `action_gate`, `action_question`, `agent_run_suspended`, `agent_proposed`, `workflow_proposed`, `skill_proposed`, `task_question`, `task_needs_input` | yes |
| `alert` | `action_failed`, `routine_failed`, `task_failed` | yes |
| `todo` | `task_assigned`, `task_review_requested`, `stream_escalation` | yes |
| `update` | `agent_message_received`, `agent_work_completed`, `agent_hired`, `records_written`, `task_completed`, `stream_update`, `team_chat.message` | no |

A module registers its own kinds with `engenty.server.notifications.registerKinds({ "<module>.<kind>": "<class>" })`.

## Emit and resolve seams

- **Core's approval gate** files a request and emits `approval.requested`
  (with `agent_id`, `space_id`, `goal_id`, `task_id`, `trigger_id`); the
  package turns it into one `approval_requested` record per actor +
  operation + space. Every decide route emits `approval.decided`, which
  resolves the record by subject.
- **Runs** — `notifyRunSuspended` (apps/ai, `run-notifications.ts`) writes the
  decision record where a run parks (graph gate, delegate suspend, task job);
  `resolveRunNotifications` closes it where the run moves on, including the
  restart reconciler that fails zombie runs. A run in a space is addressed to
  the space; the presser and the routine owner get the push.
- **Desk interrupts** — `notifyThreadInterrupt` (apps/ai,
  `thread-interrupts.ts`) writes `agent_question` (requestDecision /
  requestFeedback) or `tool_approval` (a gated tool call, a frontend tool)
  where `emit-interrupt.ts` persists the thread's open interrupt, subject
  `thread_interrupt:<interrupt_id>`. Audience follows the thread's access
  rule: a shared agent's space-visible thread → the space; a private room →
  its participants; a personal agent's thread → its owner. The person whose
  turn parked is pre-seen. Every place that clears the open interrupt
  (`clearOpenInterrupt` in the resume lane and the orphan heal, the resume
  route's answer and fresh-turn branches) resolves it: `resumed` when
  answered, `abandoned` otherwise. The card is answered in the chat; the row
  deep-links to the desk.
- **Agents talking** — `message_agent` emits `agent_message_received` for a
  hand-off, an ask and the reply, and `agent_work_completed` when a notified
  colleague finishes; a hire that goes live without a card emits
  `agent_hired`.
- **Writes** — core's `operation.afterInvoke` (with `risk_level`, `agent_id`,
  `space_id`, `idempotent`) becomes `records_written` for agent principals at
  medium+ risk, coalesced per agent + space per 10 minutes.
- **Expiry sweep** — every 15 minutes per tenant, open decision records whose
  approval request is decided/expired, whose run is no longer parked, or
  whose desk interrupt no thread holds open any more are resolved
  (`metadata.resolved_reason` = `expired` / `abandoned`). The backstop, never
  the primary path.
- **Read-sync** — opening a conversation (`GET /ai/threads/:id/messages`, first
  page) marks the caller's view of the open `update` rows about that thread
  as seen; the team-chat read cursor does the same for its messages.
- **Conflict** — the second person to decide an approval gets 409
  `approvals.alreadyDecided` (with `decided_by`); the card says "Already
  handled by someone else". A chat interrupt answered twice is the existing
  `agent_threads.interruptMismatch`.

`resolve({ subjectType, subjectId, outcome })` closes every pending row about
the subject, whoever has looked at it, and stamps why (`resumed` ·
`completed` · `failed` · `decided` · `expired` · `abandoned`). Alerts resolve
only on `completed`; updates never resolve.

## Visibility

A person sees tenant rows, stream rows, their own `user` rows and the `space`
rows of every space they may enter (the route's `accessibleSpaceIds`; the
RLS select policy says the same for realtime). Inside a space
(`scope=space`): the space's own rows plus tenant-global decisions, alerts
and todos. A global `update` shows on the tenant page only. The bell badge is
the in-space count inside a space (the tenant total is one click away under
"All"); "Mark all seen" is the caller's own view and never touches decisions.

## Registering a body (what a kind can DO)

The package owns the list; the module owns what its kinds can do. Register a
renderer for the kind in the module's UI plugin:

```ts
import { registerNotificationRenderer } from "@engenty/notifications-ui";

registerNotificationRenderer("tool_approval", ToolApprovalNotification);
```

The renderer receives `{ notification }` and renders under the summary — the
tasks module's `tool_approval` body offers allow-once / allow-for-task / deny;
the package's own `approval_requested` body decides the approval request in
place. A kind with no renderer shows its summary and deep link only, so a
tenant without that module still sees the record. Deep links come from the
subject and the origin keys (`notificationHref`); a `payload.route` wins
outright.

## Streams, channels, preferences

- **Streams** are named shared queues (`core.notification_streams`) with
  routes out to channels (`web_push`, `email`, `remote`) by minimum priority.
  Tenant admins (`notifications.manage`) shape any stream; the owner of a
  space shapes that space's streams.
- **Channels** are registered per process; delivery is a ledger
  (`core.notification_deliveries`) claimed by compare-and-swap, so two
  processes never double-send.
- **Preferences** — `notifications.<class>.<channel>` = `on` | `off` | `digest`
  and quiet hours on `core.user_settings`, applied at emit.

## HTTP

`GET /api/notifications` (query `scope`, `status`, `class`, `kind`, `source`,
`actor`, `stream`, `subject_*`, `priority`, `limit`), `GET …/unseen-count`,
`POST …/seen-all`, `POST …/:id/seen` (the caller's view), `POST …/:id/dismiss`
(the row; 422 for a decision), streams and routes
under `…/streams`, push subscriptions under `…/push`.
