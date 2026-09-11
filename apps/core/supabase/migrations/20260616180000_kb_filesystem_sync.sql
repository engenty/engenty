-- Filename note: this moved from the module into core when the module was
-- dropped, and lost its `plugin_` prefix in the process — core migrations may
-- not carry it (aggregate-module-migrations.mjs rejects them, which broke
-- `db:migrate` outright). Only the SLUG changed; the timestamp is what
-- `supabase_migrations.schema_migrations` tracks, so released installs still
-- see 20260616180000 as applied and nothing re-runs.
--
-- RETAINED after the kb-filesystem-sync module was dropped (2026-08-15): the
-- space Data lane superseded the OKF mirror (live /data adapters, archive
-- export/import), but this version is applied on released installs, so the
-- file must keep existing for migration continuity. The bucket stays — it may
-- hold pre-v0.2 mirror blobs, and file-storage-tenant-buckets still covers it
-- for tenant-data lifecycle.
--
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
