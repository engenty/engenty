-- Per-agent generated portrait. Blob silhouette (`engenty`) stays the
-- fallback; when this is set the desk and roster prefer the stored image.
-- Value is a file-storage object key (tenants/<tid>/ai/agents/…) or, in
-- tests, a data URL.

ALTER TABLE ai.engenty_ai_agents
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN ai.engenty_ai_agents.avatar_url IS
  'Optional generated portrait (file-storage key). Null = wear the blob silhouette.';
