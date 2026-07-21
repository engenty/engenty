// The Task Job — a durable Mastra Workflow (the Job substrate). A dispatched
// task runs as: checkout → buildBrief → runSpecialist → writeResult → reflect
// → finalize.
// Step snapshots persist to the Mastra Postgres store, so a crash resumes at the
// next incomplete step (restartAllActiveWorkflowRuns on boot). The dispatch
// consumer just starts a run with the queue message as input.
//
// Why a custom specialist step (not createStep(agent)): Engenty specialists are
// assembled per tenant + agent_type_key at run time, so the agent can't be baked
// into a static workflow — the run-specialist step resolves and runs it.
import { createWorkflow } from "@mastra/core/workflows";
import { reflectStep } from "../../src/ai/jobs/task-job-reflect-step.js";
import {
  taskJobEnvelopeSchema,
  taskJobInputSchema,
} from "../../src/ai/jobs/task-job-schema.js";
import { runSpecialistStep } from "../../src/ai/jobs/task-job-specialist-step.js";
import {
  buildBriefStep,
  checkoutStep,
  finalizeStep,
  writeResultStep,
} from "../../src/ai/jobs/task-job-steps.js";

export const TASK_JOB_WORKFLOW_ID = "task-job";

export const taskJobWorkflow = createWorkflow({
  id: TASK_JOB_WORKFLOW_ID,
  inputSchema: taskJobInputSchema,
  outputSchema: taskJobEnvelopeSchema,
})
  .then(checkoutStep)
  .then(buildBriefStep)
  .then(runSpecialistStep)
  .then(writeResultStep)
  .then(reflectStep)
  .then(finalizeStep)
  .commit();
