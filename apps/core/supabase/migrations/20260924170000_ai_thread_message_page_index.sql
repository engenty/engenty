-- Transcript pages read a thread's rows newest first under the tenant filter:
-- `WHERE tenant_id = … AND thread_id = … ORDER BY created_at DESC, id DESC`
-- with a (created_at, id) tuple cursor either side. The only index so far was
-- (thread_id, id), so every page sorted the whole thread. This one serves the
-- tail page, "load older" (before) and the delta fetch (after) as range scans.
CREATE INDEX IF NOT EXISTS thread_message_tenant_thread_created_idx
  ON ai.thread_message USING btree (tenant_id, thread_id, created_at DESC, id DESC);
