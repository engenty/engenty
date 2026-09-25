-- Notifications say what they are and where they lead (PLAN-notifications-structured).
--
-- A row was one free-form English `summary` and a link the client guessed
-- from metadata. It now carries its parts, set by the server at emit time:
--   title_key + title_params — `notifications.titles.<key>` and the names it
--                              uses; the UI says it in the viewer's language
--   body                     — one plain line under the title (<= 140)
--   target                   — the in-app route of the subject, built with
--                              the record's own space
-- `summary` stays: the English rendering for push, mail and older rows.
alter table core.notifications
  add column if not exists title_key text,
  add column if not exists title_params jsonb,
  add column if not exists body text,
  add column if not exists target text;

alter table core.notifications
  drop constraint if exists notifications_target_check;
alter table core.notifications
  add constraint notifications_target_check
  check (target is null or left(target, 1) = '/');

comment on column core.notifications.title_key is
  'Title as an i18n key (notifications.titles.<key>); null = show summary.';
comment on column core.notifications.body is
  'One plain line under the title, never raw agent output.';
comment on column core.notifications.target is
  'In-app route of the subject (relative, starts with /).';

-- Rows written before this change carry only the old free-form summary and a
-- guessed link; nothing in the UI reads them any more. There is no production
-- data yet: drop them (seen and delivery rows cascade).
delete from core.notifications where title_key is null and target is null;
