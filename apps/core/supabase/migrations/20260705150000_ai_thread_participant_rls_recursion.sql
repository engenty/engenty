-- Fix infinite RLS recursion on ai.thread_participant.
--
-- thread_participant_select checked membership by querying
-- ai.thread_participant itself, so evaluating the policy as a non-bypassing
-- role recursed: Postgres aborts with "infinite recursion detected in policy
-- for relation thread_participant". App API traffic never hits this (service
-- role bypasses RLS) — but Supabase Realtime's WALRUS evaluates policies as
-- the subscriber's role, and one poisoned row aborts realtime.list_changes
-- for the whole WAL batch, killing live updates for every table.
--
-- Fix: a security definer helper (owned by the migration role, bypasses RLS)
-- performs the membership lookup; the policy calls the helper.

create or replace function ai.is_thread_member(p_thread_id uuid, p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from ai.thread_participant p
    where p.thread_id = p_thread_id
      and p.tenant_id = p_tenant_id
      and p.principal_type = 'user'::ai.session_principal_type
      and p.principal_id = (auth.jwt() ->> 'sub')::uuid
  );
$$;

revoke all on function ai.is_thread_member(uuid, uuid) from public;
grant execute on function ai.is_thread_member(uuid, uuid) to authenticated;

drop policy if exists thread_participant_select on ai.thread_participant;
create policy thread_participant_select on ai.thread_participant for select
  using (
    tenant_id = core.current_tenant_id()
    and ai.is_thread_member(thread_id, tenant_id)
  );
