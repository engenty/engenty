-- A Space's browser memory ceiling, set by a tenant admin (the host's RAM is
-- shared). NULL = the server default. The AI service clamps it to its own
-- ENGENTY_BROWSER_MEMORY_MAX_BYTES.
ALTER TABLE core.space_browser_grants
  ADD COLUMN memory_mb integer CHECK (memory_mb IS NULL OR memory_mb BETWEEN 512 AND 32768);

COMMENT ON COLUMN core.space_browser_grants.memory_mb IS 'Chromium memory cap for the Space''s browser container, in MiB. NULL = server default.';
