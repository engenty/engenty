-- Backfill REPLICA IDENTITY FULL for the already-published KB realtime tables so
-- DELETE events (and the tenant_id filter in @engenty/live-cache) carry the full
-- row, not just the primary key. Without this, deletes never reach the live cache
-- and the KB sidebar stays stale until reload.

alter table module_kb.articles replica identity full;
alter table module_kb.categories replica identity full;
