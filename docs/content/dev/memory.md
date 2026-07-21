---
title: Agent memory
description: Layered, agent-curated learning memory — scopes, gateway ops, the reflection loop, org governance, consolidation, and the document editor.
---

# Agent memory

`modules/memory` gives agents durable, free-form memory that survives across
conversations: facts, preferences, lessons, and decisions, scoped to a user, a
project, the whole organization, or any entity the platform knows about (a
contact, an invoice, anything registered in the context graph). It is
deliberately **not** a chat-history feature and **not** an LLM extraction
pipeline — writes are explicit tool calls or a bounded post-task reflection
step, never a background miner over every conversation.

This sits beside two other memory-shaped systems without replacing either:

- **Mastra working memory** (`apps/ai/src/ai/memory/concrete-memory.ts`) — a
  fixed 5-field profile per user (`preferred_language`, `role`,
  `current_focus`, `preferences`, `facts`), model-updated, human read-only.
  Cheap, always-in-context, and unrelated to this module.
- **`packages/context-graph`** — the typed, event-fed entity/edge store
  ("current state only, no LLM extraction"). Entity-scoped memories
  *reference* graph entities by ref; they never write graph state.

## Scopes

One record type, four scopes — a `(scope_kind, scope_ref)` pair:

| Scope | `scope_ref` | Example |
| --- | --- | --- |
| `user` | the user's uuid | "Prefers short emails, no pleasantries." |
| `project` | a project/goal id | "Decided to bill this client monthly, not per-milestone." |
| `org` | `null` (tenant-wide) | "Always CC billing on invoices over €10k." — agent writes land as `proposed` |
| `entity` | `'<dotted-type>:<id>'`, e.g. `contacts.person:<uuid>` | "Prefers calls over email; based in a different timezone." |

The entity ref format mirrors context-graph type ids, so memory works for
**any** registered type — contacts today, invoices or vendors as soon as their
modules register a context-graph schema — without a schema change.

## Data model

```sql
-- modules/memory/supabase/migrations/20260721000000_plugin_module_memory.sql
create table module_memory.records (
  id             text primary key,        -- app-generated uuidv7(), not a DB default
  tenant_id      uuid not null references core.tenants(id) on delete cascade,
  scope_id       text not null,           -- RLS key: core.has_scope(scope_id)
  scope_kind     text not null check (... in ('user','project','org','entity')),
  scope_ref      text,                    -- the semantic ref; null for org
  kind           text not null default 'fact'
                 check (... in ('fact','preference','lesson','decision','guideline')),
  slug           text not null check (slug ~ '^[a-z0-9-]{3,60}$'),
  title          text not null,
  body_md        text not null,           -- markdown body, ≤4000 chars
  source_kind    text not null default 'agent'
                 check (... in ('agent','reflection','human')),
  agent_type_key text,
  confidence     text not null default 'medium' check (... in ('low','medium','high')),
  status         text not null default 'active' check (... in ('active','proposed','archived')),
  supersedes     text references module_memory.records(id),
  created_by     text,
  updated_by     text,                    -- human editor of the last edit (added in a follow-up migration)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
```

Two details worth knowing before you touch this table:

- **`scope_id` vs. `scope_ref`.** `scope_id` is the RLS tenant-scope key
  (`core.has_scope(scope_id)`), separate from `scope_ref`, the semantic
  reference used for matching (a user id, project id, or entity ref). Don't
  conflate them when writing a new query.
- **The slug-uniqueness index coalesces `scope_ref`.** Org scope has
  `scope_ref = null`, and a plain unique index would treat every `null` as
  distinct, defeating the upsert-by-slug contract. The index is
  `unique (tenant_id, scope_id, scope_kind, coalesce(scope_ref, ''), slug)`.
- **Soft delete only.** `status = 'archived'`; there is no hard delete.
  Consolidation links a merged-away record to its replacement via
  `supersedes` rather than deleting it.
- **Realtime is on from the base migration** — `replica identity full` +
  `supabase_realtime` publication — so the document UI (below) can live-follow
  agent writes.

## Gateway operations

`modules/memory/src/api/gateway-methods.ts` registers four operations, all
`riskLevel: "low"` (memory writes are non-destructive — slug upsert,
soft-delete only — so they must work from headless runs where
`approvalPolicy` is `"deny"`; org governance is enforced structurally instead,
see below):

| Operation | Capability | Notes |
| --- | --- | --- |
| `memory_record_upsert` | `module.memory.write` | Upsert by `(scope, slug)`. `scope_ref` required except for `org`; entity refs validate against the context-graph ontology. Optimistic concurrency via `expected_updated_at` — a stale save fails with a conflict instead of clobbering a concurrent write. |
| `memory_record_list` | `module.memory.read` | Deterministic, scope-filtered listing (no ranking) — used for brief injection and the document UI. |
| `memory_record_archive` | `module.memory.write` | Soft delete. Agent principals are blocked server-side from archiving human-authored, org-scoped, or still-`proposed` records — this is enforced in the handler, not just in agent instructions. |
| `memory_record_approve` | `module.memory.approve` | Activates a `proposed` org record. Human-principal only; an agent calling this gets a hard error even if capability-granted. |

Provenance can't be spoofed: the upsert handler forces agent-principal writes
to `source_kind: 'agent'` or `'reflection'` regardless of what the caller
requests, and stamps `updated_by` only on human edits.

### Org governance

Any `org`-scoped write from an **agent** principal is forced to
`status: 'proposed'` in the handler — there is no way for an agent to make a
tenant-wide memory active on its own. `options.onProposalCreated` (wired from
the plugin) notifies approvers through the standard inbox/web-push seam.
Proposed records are inert until a human calls `memory_record_approve`.

## Agent tools

`apps/ai/ai/tools/memory-tools/index.ts` ships three first-class tools —
thin wrappers over the gateway ops, not tools synthesized from a retrieval
source registration (unlike, say, `contacts_contact_search`):

- **`memory_save`** — upsert. Re-saving the same `slug` updates the record;
  the tool description tells the model this explicitly, along with "usually
  the right call is to save NOTHING."
- **`memory_record_search`** — hybrid search (see below) with `scope_kind` /
  `scope_ref` / `kind` filters.
- **`memory_record_archive`** — soft delete, with the same never-archive
  rules the server enforces, stated in the description as the first line of
  defense.

Attach these tool ids to an agent's config to give it memory. As of the
initial rollout they're attached to seven agents: `engenty.copilot` and the
contacts, invoices, offers, knowledge-base, tasks, and company-profile
specialists.

### The memory discipline — one instructions layer, not per-agent prose

`apps/ai/src/ai/instructions/memory-instructions.ts` exports a single
`MEMORY_INSTRUCTIONS` block, **automatically appended** by
`buildAgentInstructions` to any agent whose `toolIds` include `memory_save`.
Giving an eighth agent memory means adding the tool id — not hand-editing
prose in eight different `AGENTS.md` files.

The policy has four layers, so no single one has to be perfect:

1. **Tool descriptions** (always in context) — the compressed rules.
2. **This instructions layer** — the full policy: when to search, the
   "would a colleague write this in their notebook?" save test, update via
   same-slug re-save instead of duplicating, and the never-archive-human/org/
   proposed rule.
3. **The reflection prompt** (below) — the post-task cue, biased against
   saving.
4. **The consolidation routine** (below) — the weekly janitor for whatever
   the first three miss.

## Retrieval — hybrid search, not "read everything"

`memory_record_search` goes through the central retrieval pipeline
(`packages/retrieval`), fused in one SQL query
(`search.query_chunks`) across three signals:

```sql
-- packages/retrieval/supabase/migrations/20260705220000_plugin_retrieval_core.sql
score = fts_score * 2.0 + trigram_score + vector_score
-- keep the row iff ANY signal clears its threshold:
--   fts_score > 0
--   trigram_score >= p_trigram_threshold   (pg_trgm on the title)
--   vector_score  >= p_vector_threshold    (pgvector cosine)
```

So search is genuinely fuzzy: typo-tolerant (trigram), meaning-tolerant
(vector — "how does he like his mail?" can match "prefers brief emails" with
no shared words), and exact-term-boosted (Postgres FTS `ts_rank_cd`, a
cover-density ranking — not literal BM25, same role). If embedding fails the
query degrades to lexical-only rather than erroring.

`memory_record_list` is the other half and is deliberately **not** fuzzy: a
plain scope-filtered `select`, used wherever recall should be complete and
deterministic — the reflection step's brief injection and the document UI
both read this way, not via search.

## The reflection loop

`apps/ai/src/ai/jobs/task-job-reflect-step.ts` runs after a specialist's task
result is written: the same specialist gets one bounded, headless pass with
only `memory_save` + `memory_record_search` (not archive — reflection can add
or update a lesson, never delete), prompted to consider whether anything
durable is worth remembering. Usually it isn't; the prompt is deliberately
biased toward "nothing."

- **Kill switch:** `ENGENTY_AI_MEMORY_REFLECTION=true` — off by default.
- **Bounded by wall-clock, not step count:** `runDelegatedConversation` has no
  per-run `maxSteps` knob, so the step wraps it in an `AbortController` with a
  hard `REFLECTION_TIMEOUT_MS = 120_000`.
- **Fail-open:** a thrown error is caught and logged; it never blocks task
  finalization — the task's own result is already written by this point.
- **Own thread, same run id:** `childThreadId` is a fresh uuid (the reflection
  exchange never pollutes the task's own memory thread) but `childRunId`
  matches the task's run (so reflection tokens are attributed to the task's
  usage accounting — the existing tenant/user cost and token caps apply).

## Consolidation

A weekly module-declared trigger
(`modules/memory/ai/routines/consolidate/ROUTINE.md`) runs as
`engenty.copilot` (there is no dedicated memory agent — see below) every
Monday at 05:00 tenant time:

```yaml
---
id: memory.consolidate
schedule: "0 5 * * 1"
enabled_by_default: true
suppress_if_no_op: true   # skip the run entirely when there's nothing to do
target:
  kind: task_template
  task_template:
    agent_type_key: engenty.copilot
---
```

Instructed to, per scope: merge near-duplicate records (re-save the better
one with `supersedes` pointing at the loser, then archive the loser), archive
lessons contradicted by newer decisions, and archive low-confidence records
untouched for 60+ days — never touching `proposed` or human-authored records
(the archive op blocks those server-side regardless). Budgeted to ~20
operations per run; it's housekeeping, not a task.

## Why there's no dedicated "memory" agent

`modules/memory/ai/registrar.ts` declares zero agent definitions. Memory is
wired as a cross-cutting **capability** (tools + the shared instructions
layer), not an agent — any specialist that should learn just gets the three
tool ids. The consolidation routine reuses `engenty.copilot` rather than
inventing a new identity for housekeeping.

## The document UI

`/settings/memory` (`modules/memory/ui/pages/memory-settings-page.tsx`) is a
single page with a tab per scope (Profile · My memory · Projects ·
Organization · Entities). Each non-profile tab renders as **one continuous
markdown document** in TipTap — not a record table — while
`module_memory.records` stays the source of truth underneath.

- **Projection** (`modules/memory/src/services/memory-doc.ts`,
  `projectRecordsToDoc`): records become a `##` section per `kind`
  (Preferences, Facts, Lessons, Decisions, Guidelines, in that reading order),
  one titled block per record.
- **Identity rides on a custom TipTap node**
  (`modules/memory/ui/doc/memory-record-node.ts`): `recordId`, `slug`, `kind`,
  `status`, `updatedAt`, `sourceKind` are invisible node attributes. The node
  enforces a heading+body shape and is `isolating`, so backspace can't merge
  two records into one.
- **Diff-sync on save** (`diffMemoryDoc`): the edited doc is diffed against
  the loaded snapshot — changed blocks upsert (same slug), typed-in new text
  under a section creates a record with that section's `kind`, and a deleted
  block archives (never a hard delete). Every op still goes through the
  gateway ops above, so server-side capability checks apply regardless of
  what the UI permits. `updated_at` doubles as the optimistic-concurrency
  token; a conflicting concurrent write fails the save explicitly.
- **Round-trip law:** an unedited projection diffs to zero ops — this is
  covered by a property test in `memory-doc.test.ts`.
- **Permissions per tab:** Profile is reset-only (the Mastra viewer,
  unchanged); My memory is the owner only; Projects requires
  `module.memory.write` on that project's scope; Organization is read-all
  with edit + inline approve/reject gated on `module.memory.approve`
  (proposed records render highlighted, with an inline approve/reject action
  — this tab *is* the approval queue); Entities requires `memory.write` plus
  the entity module's own write capability (e.g. `module.contacts.write`).
- **Live-cache, but only when clean:** `modules/memory/ui/memory-live-binding.ts`
  follows agent writes into the open document only while the editor has no
  unsaved changes, to avoid clobbering an in-progress edit.

## Entity refs and the context graph

`modules/memory/src/services/entity-ref.ts` parses `'<dotted-type>:<id>'`
(at least one dot in the type segment) and validates the type against the
context-graph ontology **when a graph host is available** — fail-soft: with
no graph host, or an empty ontology, refs are accepted on format alone. This
is what makes entity memory extend to new object types without a code change
in `modules/memory` itself: register the type in context-graph, and memory
refs against it validate immediately.

## Extending memory to a new entity type

1. Register the type's schema with the context-graph ontology (see
   `modules/contacts/src/context-graph-registration.ts` for the pilot).
2. Nothing else is required in `modules/memory` — `scope_kind: 'entity'` with
   a ref like `'yourmodule.yourtype:<id>'` validates and works immediately.
3. If you want an "Agent notes" surface on your module's detail page (as
   contacts has), bind a `module_memory.records` list query filtered to that
   entity's ref and subscribe to the module's live-cache channel — see
   `modules/contacts` for the pattern.

## Gotchas

- **`module_memory` is a new Postgres schema.** On the hosted Supabase
  project, PostgREST's `pgrst.db_schemas` needs the manual settings PATCH
  before the schema is queryable (same as every other module's first
  migration) — locally, `supabase stop && supabase start` picks it up.
- **`updated_by` landed in its own migration**
  (`20260722000000_plugin_module_memory_updated_by.sql`), not the base one —
  if you're diffing schema history, don't expect it in the first migration.
- **The `/skills` mount stays read-only.** Memory does not touch the
  managed/custom skills split; agent-authored procedural memory is out of
  scope for this module by design.
