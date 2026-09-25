-- A routine is a prompt or a Workflow plus where its result goes. The
-- free-text "outcome" promise repeated what the prompt or the steps already
-- say, so it goes.

alter table ai.routines drop column outcome;
