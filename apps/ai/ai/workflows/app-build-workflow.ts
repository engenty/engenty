// The App Build workflow — the durable sequence behind the `app_build` tool:
// ensure-app → write-files → propose (build) → publish-artifact.
//
// This exists because the chat E2E showed the sequence cannot live in the
// model: across approval interruptions it lost its own app_id and created
// three duplicate apps, and its "show me" step pasted the source into an html
// artifact instead of publishing the app handle. Here the pipeline is code —
// the agent's job narrows to authoring files and reading build_log, the same
// division of labour as agentOS's workflow()/ctx.step() orchestration.
//
// Activation is deliberately NOT a step. `app_release_approve` stays a
// human-governed operation (`apps.approve`); a green build ends this workflow
// with a proposed version and a preview artifact pinned to it.
import { createWorkflow } from "@mastra/core/workflows";
import {
  appBuildEnvelopeSchema,
  appBuildInputSchema,
} from "../../src/ai/jobs/app-build-schema.js";
import {
  ensureAppStep,
  proposeStep,
  publishArtifactStep,
  writeFilesStep,
} from "../../src/ai/jobs/app-build-steps.js";

export const APP_BUILD_WORKFLOW_ID = "app-build";

export const appBuildWorkflow = createWorkflow({
  id: APP_BUILD_WORKFLOW_ID,
  inputSchema: appBuildInputSchema,
  outputSchema: appBuildEnvelopeSchema,
})
  .then(ensureAppStep)
  .then(writeFilesStep)
  .then(proposeStep)
  .then(publishArtifactStep)
  .commit();
