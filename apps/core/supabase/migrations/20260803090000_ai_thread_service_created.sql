-- Headless task/action runs act as the AI service principal, whose id is a
-- core.service_credential id — not a core.users row. A thread's creator is
-- therefore optional: service-created threads carry NULL, matching
-- ai.agent_run.created_by_user_id which has been nullable all along.
alter table ai.thread alter column created_by_user_id drop not null;
