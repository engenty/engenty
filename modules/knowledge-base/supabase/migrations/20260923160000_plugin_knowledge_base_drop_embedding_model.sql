-- The embedding model is the platform `embedding` role binding
-- (ai.model_binding); the per-tenant KB override is gone. Drop its rows so no
-- stale value sits in kb_settings looking authoritative.
delete from module_kb.kb_settings
where name = 'kb.embedding_model';
