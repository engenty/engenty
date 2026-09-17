---
title: Optimistic UI mutation inventory
description: Main-UI mutation classification, cache keys, and recovery policy.
---

# Optimistic UI mutation inventory

This checklist covers the open main UI (`apps/ui` and installable module UIs).
`apps/manage` is intentionally excluded. Counts are interaction families rather
than individual buttons or call sites; a family can have several hooks when the
same write appears on list, detail, and embedded space surfaces.

## Summary

- **A — simple optimistic: 12**
- **B — temporary-ID create: 17**
- **C — bespoke/multi-key: 19**
- **D — remain pessimistic: 12**
- **Total: 60 mutation families**

Current rollout status:

- **A: 12 migrated**
- **B: 8 migrated, 1 partially migrated, 8 retained**
- **C: 1 fully migrated, 9 partially migrated, 9 retained**
- **D: 12 intentionally pessimistic**

`[x]` means every safely projectable interaction in the family is migrated.
`[~]` means a deterministic subset is migrated and the reason for retaining the
remainder is recorded. `[ ]` means the family remains authoritative-first.

Recovery abbreviations:

- **rollback** — guarded snapshot rollback through `beginOptimisticUpdate`
- **refetch** — targeted invalidation when writes may overlap
- **guarded** — entity/field-level rollback which preserves newer writes

## A — simple optimistic

- [x] **A01 Appearance settings document** — `["appearance-settings"]`;
  rollback; reconcile the submitted complete document (the batch API is
  acknowledgement-only).
- [x] **A02 Shell dock order** — tenant-setting dock-order key plus local shell
  state; existing local-first persistence is retained; restore prior order and
  show an error if persistence fails.
- [x] **A03 Pinned secondary navigation** — tenant-setting pin key plus local
  shell state; existing local-first persistence is retained; restore prior
  value and show an error on failure.
- [x] **A04 Copilot layout and calendar-overlay preferences** — tenant-setting
  layout/overlay keys plus local provider state; existing local-first
  persistence is retained because it already patches before the request.
- [x] **A05 Task settings document** — `["tasks","settings"]`; rollback;
  reconcile the complete returned settings.
- [x] **A06 Task detail field edits** —
  `["tasks","detail",id]`; guarded rollback;
  reconcile the complete returned entity. Filtered lists remain C.
- [x] **A07 Contact detail fields and roles** —
  `["contacts","detail",id]`; guarded rollback; reconcile the complete returned
  contact. Paginated lists remain C.
- [x] **A08 Contact settings and role-menu documents** — one page mutation
  saves both documents across `["contacts","settings"]`,
  `["contacts","role-menu"]` and `["contacts","settings-page"]`; rollback;
  acknowledgement-only role-menu writes reconcile the normalized submitted
  document.
- [x] **A09 Team-member detail fields** —
  `["team","members","detail",id]` and `detail-page`; guarded rollback;
  reconcile the complete returned member. Filtered lists remain C.
- [x] **A10 Offer detail fields** — `["offers","detail",id]`, `detail-page`,
  and `edit-page`; guarded rollback; merge the complete returned offer into
  composite page caches. Lists remain C.
- [x] **A11 Offer settings/default-template documents** —
  `["offers","settings-page"]`, `["offers","templates"]`; rollback; reconcile
  the complete returned settings/template without success invalidation.
- [x] **A12 Inbox category settings and commercial settings documents** —
  `["inbox","categories"]`, `["commercial-settings"]`; rollback; reconcile the
  complete response or submitted complete document.

The existing knowledge-base cover hook is also a reference implementation, not
an additional family count: it already patches KB list/detail caches, restores
the prior cover with a visible error, and applies the server response without a
success refetch.

## B — temporary-ID creates

- [x] **B01 Projects** — first paginated project-list page; `opt_<uuid>`;
  guarded temporary-row removal and authoritative replacement.
- [x] **B02 Tasks** — all matching scoped/filtered task-list keys;
  `opt_<uuid>`; guarded removal and authoritative replacement. Briefing
  placement remains server-derived because its reason/summary sections cannot
  be inferred from create input.
- **B03** — retired with Goals; the Tasks module no longer has that record.
- [x] **B04 Contacts** — current paginated contact-list key; `opt_<uuid>`;
  guarded removal and authoritative replacement.
- [x] **B05 Team members** — current paginated team-member list key;
  `opt_<uuid>`; guarded removal and authoritative replacement.
- [x] **B06 Offers and offer versions** — offers/versions/next-number keys;
  server number and version IDs must replace temporary values.
- [ ] **B07 Invoices** — retained authoritative-first: numbering, tax totals,
  and issue state are computed together and the create form navigates using the
  returned invoice.
- [~] **B08 Knowledge bases/categories/articles/FAQs/templates/tags/comments**
  — category creation uses `opt_<uuid>` and reconciles the tree. Article/FAQ
  editing navigates to the returned authoritative entity; template/tag/comment
  creates remain authoritative because ordering/count/version side effects are
  returned or separately derived.
- [ ] **B09 Knowledge-base sources and promotions** — source/inbox/list keys;
  retained authoritative-first because adapter validation and ingestion state
  are only known after server setup.
- [ ] **B10 Team-chat channels, DMs, messages, and reactions** — conversation
  and message keys; retained because membership authorization, server sequence,
  deduplication, and timestamps are authoritative.
- [ ] **B11 Contact relations** — relation list/detail keys; temporary edge ID.
  Retained because inverse-edge rendering and derived relation labels are
  resolved by the API.
- [ ] **B12 Files/folders and space-drive nodes** — directory/tree keys;
  retained because normalized paths and collision handling are authoritative.
- [ ] **B13 Secrets** — retained authoritative-first so rejected encryption or
  policy writes never render as stored metadata.
- [ ] **B14 Tenant roles/assignments and space membership** — role, assignment,
  member, and directory keys; retained because permission-derived surfaces and
  last-owner constraints cannot be projected safely.
- [ ] **B15 Time-tracking report snapshots and saved reports** — report/list
  keys; retained because snapshot totals and report definitions are normalized
  and computed by the server.
- [x] **B17 Project phases** — the project-detail document
  `["projects","detail",id]`; `opt_<uuid>`; guarded temporary-row removal and
  authoritative replacement, keeping any task added to the phase meanwhile.
- [x] **B16 Project tasks** — the project-detail document
  `["projects","detail",id]`; `opt_<uuid>`; guarded temporary-row removal and
  authoritative replacement through `lib/project-detail-task-cache.ts`. Derived
  task counts refetch after the create completes.

## C — bespoke optimistic reducers

- [~] **C01 Project deletes (optional task cascade)** — project rows remove
  immediately; optional cascades target-refetch task lists/counts after success
  and refetch all project keys on partial failure.
- [x] **C19 Project phase and project-level edits** — the project-detail
  document. Phase title/date edits and portal visibility roll back; a phase
  delete settles its tasks first (move or delete, one write each) so it
  recovers by refetch. Project settings, briefing, title and tab configuration
  roll back and refresh the project lists. Phase dates re-derive the project's
  own start/end the way `fetchProjectWithDateSync` does on a fetch.
- [~] **C02 Project task edits, phase moves, reorders, and deletes** — the
  project-detail document patches immediately for field edits (rollback),
  portal visibility (rollback), phase moves and same-phase reorders (refetch,
  because a reorder writes several rows), and deletes (refetch). Server-derived
  task counts remain authoritative and are refetched after a create or delete.
- [~] **C03 Task list edits, bulk updates, and bulk deletes** — matching scoped
  filtered lists and detail rows patch immediately. Briefing reasons, activity,
  and derived project counts remain authoritative.
- [~] **C04 Task deletes and linking** — matching task lists and
  details patch immediately; activity and derived counts remain authoritative.
- [~] **C05 Contact/team/offer/invoice deletes** — contact, team, and offer
  paginated lists remove immediately and refetch on failure. Invoice deletion
  remains authoritative because issued-document and linked-total effects are
  not locally projectable.
- [ ] **C06 Contact relation update/delete** — relation lists with derived
  counts.
- [~] **C07 Offer/invoice block replacement and ordering** — offer edit/detail
  composite caches reconcile the complete ordered block response. Invoice
  blocks remain coupled to authoritative tax and total calculations.
- [~] **C08 Inbox status/classification** — status changes patch thread detail,
  search, and known offset/filter lanes. Model classification and account
  aggregates remain authoritative.
- [~] **C09 Knowledge-base article/FAQ field and lifecycle edits** — matching
  filtered lists and article detail patch immediately; versions/graph refetch
  after authoritative completion, while favorites/sidebar keep their existing
  bespoke behavior.
- [~] **C10 Knowledge-base category move/reorder/delete** — category tree and
  detail patch immediately and retain the existing bespoke sidebar reorder
  model. Article buckets/page blocks refetch when server reparenting applies.
- [ ] **C11 Knowledge-base page-block and template ordering** — hub/detail,
  template, and preview keys; retained because page normalization and template
  inheritance can alter several blocks server-side.
- [ ] **C12 Knowledge-base source update/delete/item status** — paginated
  source/item lists, runs, and derived ingestion state; retained because
  ingestion/run state is asynchronous.
- [ ] **C13 Team taxonomies, custom fields, employment time, absences,
  holidays, working hours, and gallery** — retained because taxonomy
  normalization and HR overlap validation can change related records.
- [ ] **C14 Team-chat membership/topic/pin/delete/read state** — conversation,
  member, unread, and message keys; retained because unread/member aggregates
  depend on server sequence and authorization.
- [ ] **C15 Connection policy/settings/disconnect/approval decisions** —
  catalog, approval lanes, and external provider state; retained because
  provider state and approval side effects are external.
- [ ] **C16 Tenant plugin toggles, AI usage/search parameters, roles, and space
  setup/mount edits** — retained because plugin loading, permission changes,
  usage aggregation, and mount validation have non-local side effects.
- [ ] **C17 File rename/move/delete** — tree ancestors, breadcrumbs, detail,
  selection, and space-drive mirrors; retained because normalized paths,
  collisions, and descendant mirrors require server validation.
- [ ] **C18 Time-tracking report edits/deletes** — report list/detail,
  snapshots, summaries, and sidebar keys. Retained because report summaries and
  snapshots are computed server-side; entry/row/calendar reducers belong to the
  completed pilot.

## D — remain pessimistic

- [ ] **D01 Inbox sync-now and batch classification runs** — remote polling and
  unknown multi-record side effects; invalidate after completion.
- [ ] **D02 Inbox digest/summary generation** — model-generated output; cache
  only the response.
- [ ] **D03 Task run/release/question-answer/approval/handoff operations** —
  agent runtime and polling state cannot be projected reliably.
- [ ] **D04 Knowledge-base ingest, reindex, metadata generation, translation,
  duplication, and version restore** — asynchronous multi-record side effects.
- [ ] **D05 Knowledge-base Unsplash/AI cover import** — external media side
  effect; apply only the returned cover.
- [ ] **D06 File extraction/upload/download** — storage and parsing side
  effects; progress UI remains local, server data remains pessimistic.
- [ ] **D07 Connection OAuth/connect and provider imports** — external
  authorization or import side effects.
- [ ] **D08 Search-index rebuild/test and development reindex** — background
  jobs or read-only test operations.
- [ ] **D09 Plugin reload** — runtime side effect with unknown dependent state.
- [ ] **D10 Copilot sandbox kill-all** — external runtime side effect.
- [ ] **D12 Space-data recursive delete/move when descendants are unknown** —
  server validation and multi-node effects require authoritative completion.
