// `app_build` — the agent-facing composite for building an engenty App. One
// tool call runs the durable app-build workflow (ensure → write → propose →
// publish) instead of exposing the agent to four separately-gated operations
// it kept fumbling. The agent's contract: hand over name + manifest + files;
// get back either a proposed version with a preview artifact, or the verbatim
// build_log to fix against. Activation stays the human's act
// (`app_release_approve`), never this tool's.
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  type AppBuildEnvelope,
  type AppBuildResult,
  appBuildResultSchema,
} from "../../src/ai/jobs/app-build-schema.js";
import { getEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";

const inputSchema = z.object({
  description: z.string().max(2000).optional(),
  files: z
    .record(z.string(), z.string())
    .describe(
      "path -> full file content. Pass the COMPLETE set every time — a fix loop resends all files, not a diff."
    ),
  manifest: z
    .record(z.string(), z.unknown())
    .describe(
      "The app manifest (entry, storage, engenty.operations, actions, egress) — see the app-authoring skill."
    ),
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,62}$/)
    .optional()
    .describe(
      "Stable identity across builds. Reuse the same slug when fixing a failed build, or you will create a second app."
    ),
});

function describeNextStep(envelope: AppBuildEnvelope): string {
  switch (envelope.status) {
    case "published":
    case "built":
      return (
        `Version ${envelope.version} is built and proposed. The conversation now ` +
        "carries the App with its Approve button, and the person has a decision " +
        "notification. Tell them it is ready and that activating it is theirs — " +
        "do not report the App as live until they approve it."
      );
    case "build_failed":
      return (
        "The build failed. Read build_log, fix the named files, and call app_build " +
        "again with the SAME slug and the complete corrected file set."
      );
    default:
      return "The build did not reach propose; inspect the result and retry.";
  }
}

export const appBuildTool = createTool({
  id: "app_build",
  description:
    "Build an engenty App in one step: creates (or reuses) the app, writes the draft files, compiles the release, and publishes a live preview artifact into this chat. Returns the build log on failure. Load the app-authoring skill BEFORE calling this — the manifest shape, the engenty:bridge import and how an App reads Space tables are specified there, not guessable. Use this instead of calling app_create/app_file_write/app_release_propose individually.",
  inputSchema,
  outputSchema: appBuildResultSchema,
  execute: async (input): Promise<AppBuildResult> => {
    const ctx = getEngentyToolsRunContext();
    if (!ctx.tenantId) {
      throw new Error("app_build: tenant is not set in run context.");
    }
    // Publish the preview artifact where the human is looking. Inside a
    // delegated run orchestratorThreadId is the app-coder's CHILD thread — an
    // artifact there is invisible to the user (the bug the first live E2E
    // found). userFacingThreadId is inherited from the root run.
    const publishThreadId = ctx.userFacingThreadId ?? ctx.orchestratorThreadId;
    // Dynamic import breaks the static cycle: the copilot agent module imports
    // the tools, and the mastra barrel imports the copilot agent.
    const { mastra } = await import("../index.js");
    const run = await mastra
      .getWorkflow("app-build")
      .createRun({ runId: crypto.randomUUID() });
    const result = await run.start({
      inputData: {
        ...(ctx.agentTypeKey ? { agent_type_key: ctx.agentTypeKey } : {}),
        ...(input.description ? { description: input.description } : {}),
        files: input.files,
        manifest: input.manifest,
        name: input.name,
        ...(input.slug ? { slug: input.slug } : {}),
        tenant_id: ctx.tenantId,
        ...(publishThreadId ? { thread_id: publishThreadId } : {}),
      },
    });
    if (result.status !== "success") {
      const message =
        result.status === "failed"
          ? (result.error?.message ?? "unknown error")
          : `workflow ended with status ${result.status}`;
      throw new Error(`app_build: ${message}`);
    }
    const envelope = result.result as AppBuildEnvelope;
    return {
      app_id: envelope.app_id,
      ...(envelope.artifact_id ? { artifact_id: envelope.artifact_id } : {}),
      ...(envelope.build_log ? { build_log: envelope.build_log } : {}),
      next_step: describeNextStep(envelope),
      status: envelope.status,
      ...(envelope.version === undefined ? {} : { version: envelope.version }),
    };
  },
});

export function createAppBuildTools() {
  return { app_build: appBuildTool };
}
