-- Notifications open the agent's context; results ride beside it
-- (PLAN-notification-cards).
--
-- `target` is always the context (the conversation, run, task or room). What
-- the work produced — an artifact, a file, a module record — is an
-- attachment the card opens directly:
--   [{ "kind": "artifact" | "file" | "record", "label": "…", "target": "/…" }]
alter table core.notifications
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table core.notifications
  drop constraint if exists notifications_attachments_check;
alter table core.notifications
  add constraint notifications_attachments_check
  check (
    jsonb_typeof(attachments) = 'array'
    and jsonb_array_length(attachments) <= 3
  );

comment on column core.notifications.attachments is
  'Results the card opens directly: [{kind, label, target}], max 3. target = the context.';
