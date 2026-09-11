-- The space filter in search.query_chunks treats a NULL space_id as visible
-- from EVERY space — the escape hatch for tenant-level sources (contacts,
-- inbox, memory, team-chat). KB articles are space-bound since 20260810080000,
-- but documents indexed before search.documents.space_id existed
-- (20260811010000, apps/core) still carry NULL and so kept answering from
-- every space, private ones included.
--
-- Reset, not backfill (Matthias, 2026-08-15): delete the stale KB rows and let
-- the existing machinery rebuild them — the superadmin Rebuild button
-- (/settings/search-index) or the next article event re-ingests each doc, and
-- the KB retrieval source writes space_id on every ingest since the column
-- exists. A missing row scans as `pending`, so the rebuild picks up exactly
-- these. search.chunks cascades on the document row. Until the rebuild runs,
-- affected KB docs are simply absent from search — a narrower failure than
-- answering from the wrong space.

delete from search.documents
where source_type = 'kb.article'
  and space_id is null;

-- Same reset for artifacts pinned to a space (D9): the artifact retrieval
-- source now writes space_id for scope_type='space' rows, but everything
-- indexed before that carries NULL and answers from every space. Tenant-level
-- artifacts (thread/tenant scope) legitimately stay NULL and are untouched.
delete from search.documents d
using ai.artifact a
where d.source_type = 'ai.artifact'
  and d.space_id is null
  and a.tenant_id = d.tenant_id
  and a.id::text = d.doc_id
  and a.scope_type = 'space';
