// The Action Job — a durable Mastra Workflow (Phase 5). An Action is a Workflow on
// the same Job substrate the Task Job introduced (pg snapshots, crash-resume via
// restartAllActiveWorkflowRuns). The endpoint resolves/validates the action and
// creates the run/thread/action_request, then starts this workflow: run the
// action's scoped specialist → finalize the action_request + run record.
import { createWorkflow } from "@mastra/core/workflows";
import {
  actionJobInputSchema,
  actionJobOutputSchema,
} from "../../src/ai/jobs/action-job-schema.js";
import {
  applyApprovedUpdatesStep,
  finalizeActionStep,
  runActionSpecialistStep,
} from "../../src/ai/jobs/action-job-steps.js";

export const ACTION_JOB_WORKFLOW_ID = "action-job";

// run specialist (suspends for approval if it proposes updates)
//   → apply the approved patch (generic, by context_type)
//   → finalize the action_request + run record
export const actionJobWorkflow = createWorkflow({
  id: ACTION_JOB_WORKFLOW_ID,
  inputSchema: actionJobInputSchema,
  outputSchema: actionJobOutputSchema,
})
  .then(runActionSpecialistStep)
  .then(applyApprovedUpdatesStep)
  .then(finalizeActionStep)
  .commit();
