-- KB Filesystem Sync — storage bucket for the OKF mirror of the Knowledge Base.
--
-- The sync module reads/writes the database-backed KB structure as Open
-- Knowledge Format Markdown under tenant/KB-scoped keys (see config.ts:
-- `<path_prefix?>/<tenantId>/<kbId>/…`). It uses the service-role client, which
-- bypasses storage RLS, so no per-object policies are required here — only the
-- bucket must exist. The bucket id matches the module's default `bucket` config.
INSERT INTO storage.buckets (id, name, public)
VALUES ('kb-sync', 'kb-sync', false)
ON CONFLICT (id) DO NOTHING;
