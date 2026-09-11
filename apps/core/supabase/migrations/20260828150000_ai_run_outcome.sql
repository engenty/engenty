-- A run's two verdicts live on different planes, recorded side by side.
--
-- `status` is the engine's word — did the run crash. Nothing in it says
-- whether the WORK succeeded: a nightly import that found nothing and one the
-- counterparty refused both settle `completed`, and a business failure had
-- only `throw`, which reads as a crash. `outcome` is the flow's own verdict,
-- carried in its declared output; `reporting` is how loudly the result lands
-- in the owner's chat, a per-run widening of the routine's `report` knob.
--
-- Both nullable: absent means the flow declared nothing, which is every run
-- that exists today. See docs/content/dev/work-model.md → "Outcome and
-- reporting".

alter table ai.action_request
  add column if not exists outcome text
    check (outcome in ('ok', 'nothing_to_do', 'partial', 'needs_attention', 'rejected', 'failed')),
  add column if not exists reporting text
    check (reporting in ('silent', 'info', 'verbose'));

comment on column ai.action_request.outcome is
  'The flow''s own verdict on the work, from its declared output. Independent of status: outcome=failed on status=completed is a business failure, not a crash.';
comment on column ai.action_request.reporting is
  'How loudly this run''s result lands in the owner''s chat. Overrides the routine''s report knob when present.';
