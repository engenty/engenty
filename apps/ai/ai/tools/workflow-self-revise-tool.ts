// `workflow_self_revise` — a specialist proposing a new version of a Workflow
// it OWNS, from the chat where the change was asked for.
//
// `workflow_propose` is the copilot's: it takes `owner_agent_id` as a free
// parameter and can create Workflows on anyone's page. A specialist gets this
// narrower verb instead — one existing Workflow, and only when the row's
// `owner_agent_id` is the run's own `agentTypeKey`. No owner input, no
// new-Workflow path: revise what is yours, nothing else.
//
// Governance is unchanged: the version is saved unapproved. On an interactive
// lane the run parks on the same Publish card `workflow_propose` uses, and the
// resume publishes AS THE HUMAN who answered; headless runs leave it for the
// canvas. The published version keeps running until then.
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createWorkflowStoreFromEnv } from "../../src/ai/index.js";
import { executionSpaceId } from "../../src/ai/sessions/execution-lane.js";
import {
  GRAPH_GUIDANCE,
  GRAPH_GUIDANCE_ESSENTIALS,
} from "../../src/ai/workflows/authoring-guidance.js";
import { validateGraphAction } from "../../src/ai/workflows/validate-graph.js";
import type { WorkflowStore } from "../../src/dal/workflows/index.js";
import { emitInboxNotification } from "../../src/notifications/inbox.js";
import {
  acquireFrontendToolSuspendSlot,
  releaseFrontendToolSuspendSlot,
} from "../frontend-tools/frontend-tool-suspend-lock.js";
import { getEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";
import {
  type ActionProposeResumeData,
  buildFlowPublishArtifactId,
  FLOW_PUBLISH_CHOICE_KEEP_DRAFT,
  FLOW_PUBLISH_CHOICE_PUBLISH,
  publishFromDecision,
  publishSuspendLockKey,
  workflowPublishResumeSchema,
} from "./workflow-propose-tool.js";

export const WORKFLOW_SELF_REVISE_TOOL_ID = "workflow_self_revise";

const inputSchema = z.object({
  workflow_id: z
    .string()
    .min(1)
    .describe("The Workflow to revise — one of yours, from workflows_list."),
  graph: z
    .array(z.record(z.string(), z.unknown()))
    .min(1)
    .describe(
      `The COMPLETE new ordered entry list, not a diff.\n${GRAPH_GUIDANCE_ESSENTIALS}`
    ),
  input_schema: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "JSON Schema for the Workflow's input. Omit to keep the current one."
    ),
  output_schema: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "JSON Schema for the Workflow's result. Omit to keep the current one."
    ),
  summary: z
    .string()
    .min(1)
    .max(200)
    .describe(
      "One line for the person publishing: what changes and why they asked for it."
    ),
});

type WorkflowSelfReviseStore = Pick<
  WorkflowStore,
  "getGraph" | "listVersions" | "saveVersion"
>;

export function createWorkflowSelfReviseTools(
  /** Overrides the env store; the run lane always takes the default. */
  getStore: () => WorkflowSelfReviseStore | null = createWorkflowStoreFromEnv
) {
  return {
    [WORKFLOW_SELF_REVISE_TOOL_ID]: createTool({
      id: WORKFLOW_SELF_REVISE_TOOL_ID,
      description:
        "Propose a new version of a Workflow YOU OWN, when the user asks you to " +
        "change how one of your Workflows runs. Pass the complete new graph. " +
        "Nothing runs from this call: the version is saved unapproved and the " +
        "current one keeps running until a person publishes the new one. In an " +
        "interactive chat the call pauses on a Publish card; report whether " +
        "the user published or kept the draft, never assume it. If the call " +
        "returns issues, fix the graph and call again.",
      inputSchema,
      resumeSchema: workflowPublishResumeSchema,
      execute: async (input, executionContext) => {
        const resume = executionContext?.agent?.resumeData as
          | ActionProposeResumeData
          | undefined;
        if (resume) {
          releaseFrontendToolSuspendSlot(publishSuspendLockKey());
          return await publishFromDecision(resume);
        }
        const ctx = getEngentyToolsRunContext();
        const tenantId = ctx.tenantId?.trim();
        const agentId = ctx.agentTypeKey?.trim();
        if (!agentId) {
          return {
            ok: false as const,
            code: "unknown_agent",
            message:
              "This run does not know which registry agent it is, so it cannot tell which Workflows are its own.",
          };
        }
        if (!tenantId) {
          return {
            ok: false as const,
            code: "unauthorized",
            message: `${WORKFLOW_SELF_REVISE_TOOL_ID} is unavailable in this run (no tenant).`,
          };
        }
        const store = getStore();
        if (!store) {
          return {
            ok: false as const,
            code: "unavailable",
            message: "workflow storage is not configured.",
          };
        }

        const existing = await store.getGraph({
          id: input.workflow_id,
          tenantId,
        });
        if (!existing) {
          return {
            ok: false as const,
            code: "not_found",
            message: `No Workflow with id ${input.workflow_id} in this workspace.`,
          };
        }
        if (existing.owner_agent_id !== agentId) {
          // Ownership is the whole permission: a library Workflow or a
          // colleague's is not yours to rewrite, whatever the user asked.
          return {
            ok: false as const,
            code: "not_yours",
            message: `Workflow "${existing.name}" is ${
              existing.owner_agent_id
                ? `owned by ${existing.owner_agent_id}`
                : "a shared library Workflow"
            }, not yours. Tell the user to ask the copilot to change it.`,
          };
        }

        // The schemas the Workflow's callers already satisfy, unless the
        // revision names new ones — a routine's static workflow_input must
        // keep fitting.
        const latest = (
          await store.listVersions({ tenantId, workflowId: existing.id })
        ).sort((a, b) => b.version - a.version)[0];
        const stored = {
          description: existing.description ?? "",
          graph: input.graph,
          id: `workflow:${existing.id}`,
          inputSchema: input.input_schema ??
            latest?.input_schema ?? { properties: {}, type: "object" },
          outputSchema: input.output_schema ??
            latest?.output_schema ?? { properties: {}, type: "object" },
        };
        // The row's surface is kept, never re-declared here: a wizard stays a
        // wizard, so the revision must still carry at least one gate.
        const surface = existing.surface ?? "chat";
        const issues = validateGraphAction(stored, { surface });
        if (issues.length > 0) {
          return {
            ok: false as const,
            code: "action_invalid",
            issues,
            message: `The Workflow did not validate. Fix these and call again:\n${issues
              .map((issue) => `- [${issue.code}] ${issue.message}`)
              .join(
                "\n"
              )}\n\nThe complete rules for writing a graph:\n${GRAPH_GUIDANCE}`,
          };
        }

        try {
          const version = await store.saveVersion({
            authoredBy: "copilot",
            graph: stored,
            inputSchema: stored.inputSchema as Record<string, unknown>,
            outputSchema: stored.outputSchema as Record<string, unknown>,
            tenantId,
            workflowId: existing.id,
          });

          await emitInboxNotification({
            dedupeKey: `flow-graph-proposal:${tenantId}:${existing.id}`,
            spaceId: executionSpaceId(ctx.space) ?? null,
            kind: "workflow_proposed",
            metadata: {
              owner_agent_id: agentId,
              version: version.version,
              workflow_id: existing.id,
            },
            priority: "medium",
            source: "workflows",
            summary: `${agentId} proposed version ${version.version} of its Workflow "${existing.name}": ${input.summary}`,
            tenantId,
          });

          if (
            ctx.canSuspendForInteraction &&
            executionContext?.agent?.suspend
          ) {
            const artifactId = buildFlowPublishArtifactId(
              existing.id,
              version.id
            );
            const lockKey = publishSuspendLockKey();
            const ticket = await acquireFrontendToolSuspendSlot(lockKey);
            try {
              await executionContext.agent.suspend({
                artifact_id: artifactId,
                artifact_type: "decision" as const,
                title: `Publish version ${version.version} of "${existing.name}"?`,
                body:
                  `${input.summary}\n\n${input.graph.length} step${input.graph.length === 1 ? "" : "s"} · owned by ${agentId}. ` +
                  `Version ${existing.current_version ?? "—"} keeps running until this one is published.`,
                choices: [
                  {
                    id: FLOW_PUBLISH_CHOICE_PUBLISH,
                    label: "Publish",
                    description: "Switch the Workflow to this version.",
                  },
                  {
                    id: FLOW_PUBLISH_CHOICE_KEEP_DRAFT,
                    label: "Keep as draft",
                    description: "Review the steps on the canvas first.",
                  },
                ],
                interrupt_id: artifactId,
              });
              releaseFrontendToolSuspendSlot(lockKey, ticket);
            } catch (error) {
              releaseFrontendToolSuspendSlot(lockKey, ticket);
              throw error;
            }
            return undefined as never;
          }

          return {
            ok: true as const,
            workflow_id: existing.id,
            version: version.version,
            surface,
            note:
              "Saved unapproved. The current version keeps running until a " +
              "human reviews the steps on the canvas and publishes this one — " +
              "you cannot publish it yourself. Say so plainly.",
          };
        } catch (err) {
          return {
            ok: false as const,
            code: "workflow_self_revise_failed",
            message: err instanceof Error ? err.message : String(err),
          };
        }
      },
    }),
  };
}
