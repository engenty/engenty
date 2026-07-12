-- Phase 0.3 — RLS coverage: module_kb.article_versions and module_kb.faq_versions
-- carry tenant_id but had RLS off. They are written/read only through the KB
-- service (service_role, which bypasses RLS) and are not granted to
-- authenticated. Enabling RLS with no policies makes them deny-all for other
-- roles — closing the isolation gap with no behavior change.
alter table module_kb.article_versions enable row level security;
alter table module_kb.faq_versions enable row level security;
