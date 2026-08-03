-- D2 phase 2: connections approval requests now live in core.approval_requests.
--
-- module_connections.approval_requests was the connections module's own request
-- ledger — request-only (no grant half), so approving a row closed it without
-- unblocking the run that was waiting. New requests go to core; this migration
-- carries the still-pending rows over so they stay visible in the queue. The
-- old table is left in place as a read-only archive of decided history; it is
-- dropped in a later release once nothing reads it.
--
-- Decided rows are NOT copied: core's ledger should not claim decisions it
-- never made — the archive keeps them queryable.

do $$
begin
  if to_regclass('module_connections.approval_requests') is null then
    return; -- connections module never installed here
  end if;

  insert into core.approval_requests
    (tenant_id, actor_id, module_id, operation_id, reason, context,
     status, created_at, expires_at)
  select
    r.tenant_id,
    r.requested_by,
    'connections',
    r.operation_id,
    'connection_approval_pending: a human must approve this action; the request was sent to the connection owner',
    jsonb_build_object(
      'action_id', r.action_id,
      'connection_id', r.connection_id,
      'input_summary', r.input_summary,
      'task_id', r.task_id
    ),
    'pending',
    r.created_at,
    -- Same waiting period new requests get, counted from the migration so a
    -- long-forgotten row still gives its owner a week to act rather than
    -- expiring the moment it arrives.
    now() + interval '7 days'
  from module_connections.approval_requests r
  where r.status = 'pending';
end $$;

notify pgrst, 'reload schema';
