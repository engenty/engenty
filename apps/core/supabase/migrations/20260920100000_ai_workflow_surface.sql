-- How a run of a workflow is meant to be experienced: `chat` (its cards land
-- in the owner's chat) or `wizard` (a person walks it one gate per page; it is
-- listed in the catalog and as a slash command for that).
alter table ai.workflow
  add column if not exists surface text not null default 'chat';

alter table ai.workflow
  drop constraint if exists workflow_surface_check;

alter table ai.workflow
  add constraint workflow_surface_check
  check (surface in ('chat', 'wizard'));
