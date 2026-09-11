-- Fix: deleting a space tried to null a knowledge base's TENANT (PLAN-spaces.md).
--
-- `kb_knowledge_bases_space_tenant_fkey` is composite on (space_id, tenant_id),
-- and the Phase 4 migration gave it a bare `on delete set null`. Postgres applies
-- SET NULL to EVERY column of the constraint, not just the one that pointed at
-- the deleted row — so deleting a space emitted:
--
--   UPDATE module_kb.knowledge_bases SET space_id = NULL, tenant_id = NULL …
--
-- which fails on `tenant_id`'s not-null constraint. The visible symptom is a
-- space that cannot be deleted, with an error naming the wrong table and column.
-- The invisible one is worse: were tenant_id ever nullable, deleting a space
-- would silently detach the library from its tenant — a row belonging to no
-- tenant, in a codebase whose entire isolation model is "every row has a
-- tenant_id". The composite FK exists to stop cross-tenant references; it should
-- not be able to produce a tenant-less row.
--
-- `set null (space_id)` (Postgres 15+) narrows it to the intended column, which
-- preserves what the KB migration meant: a deleted space leaves its knowledge
-- bases behind as TENANT-WIDE, the same state a KB has when it was never bound
-- to a space at all.
--
-- The tasks/projects companions had the identical defect. It is moot there —
-- their Phase 6 migration replaces `set null` with `restrict`, since `not null`
-- and `set null` cannot coexist — so this is the only table left carrying it.
--
-- Idempotent: drop-then-add.

alter table module_kb.knowledge_bases
  drop constraint if exists kb_knowledge_bases_space_tenant_fkey;
alter table module_kb.knowledge_bases
  add constraint kb_knowledge_bases_space_tenant_fkey
  foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)
  on delete set null (space_id);

notify pgrst, 'reload schema';
