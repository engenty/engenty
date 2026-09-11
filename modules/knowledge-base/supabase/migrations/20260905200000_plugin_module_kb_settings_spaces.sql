-- Knowledge-base settings in the spaces model (PLAN-kb-settings.md).
--
-- A knowledge base belongs to exactly one space, and nothing about the module
-- is configured per space. What remains tenant-wide is index infrastructure
-- (embedding model, retrieval-quality knobs); everything content-shaped moved
-- onto the library. Two settings had no reader at all and go away:
--
--   kb.auto_generate_summary / kb.auto_generate_questions — source ingest uses
--   its own per-source flags; article summaries are generated on request.
--
--   kb.default_kb_id — only ever chose which library the module root opened
--   when a space had several. The root asks now, and agents get the candidate
--   list back (`kb_id_required`) instead of a silent first-row pick.
--
-- `knowledge_bases.is_default` was the agent-side twin of that default and was
-- never written: no code path set it to true, so the "default in space"
-- lookup always fell through to the first row. Dropped with it.
--
-- Chunking (`kb.chunking`, json, context {kb_id}) is a new per-library KV row;
-- no migration needed — a library without one uses the code defaults, which
-- is exactly what every library got before (the tenant-level chunk fields
-- were never persisted).
--
-- Idempotent.

delete from module_kb.kb_settings
where name in (
  'kb.default_kb_id',
  'kb.auto_generate_summary',
  'kb.auto_generate_questions'
);

alter table module_kb.knowledge_bases drop column if exists is_default;

notify pgrst, 'reload schema';
