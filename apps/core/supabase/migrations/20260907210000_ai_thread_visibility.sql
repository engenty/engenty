-- Who may read a conversation, per thread (PLAN-agent-rooms.md R9).
--
-- Until now a shared specialist's every thread in a Space was open to
-- everyone who may enter the Space — the desk is one conversation for the
-- whole team, and that stays. A room may be private: only the people in it
-- (`ai.thread_participant`) and its agents. Existing rows keep today's
-- behaviour (`space`).
--
-- A room is a conversation opened AS one — named, with a purpose and a member
-- list — and carries `route_context.room = true`; a desk does not, whatever
-- its member count. Rooms that exist already (two or more agents, not a pair
-- room) get the marker here.

alter table ai.thread
  add column if not exists visibility text not null default 'space'
    constraint thread_visibility_check check (visibility in ('private', 'space'));

comment on column ai.thread.visibility is
  'space: anyone who may enter the thread''s Space reads and posts (a shared specialist''s desk). private: only the people in ai.thread_participant and the room''s agents.';

update ai.thread t
set route_context = coalesce(t.route_context, '{}'::jsonb) || '{"room": true}'::jsonb
where coalesce(t.route_context->>'delegated', '') <> 'true'
  and coalesce(t.route_context->>'room', '') <> 'true'
  and (select count(*) from ai.thread_agent a where a.thread_id = t.id) >= 2;

notify pgrst, 'reload schema';
