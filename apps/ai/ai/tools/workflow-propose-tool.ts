// workflow_propose: the agent-side writer for multi-step Workflows.
//
// This is the PRIMARY authoring path (PLAN-workflow-designer.md §2.5), not a
// convenience: a user describes the steps in chat, the model emits the graph
// JSON, and a human reviews it on the canvas before it can run. Same
// governance shape as `agent_propose` — nothing goes live from this call. The
// version is saved unapproved; publishing is a separate, human-only route
// deliberately NOT exposed as a tool.
//
// Capabilities are checked at PUBLISH, not here, and that is the right place:
// what matters is whether the human who turns this on could perform the calls
// themselves. A model drafting a Workflow it couldn't personally execute is
// fine — it can't publish it. The canvas still shows capability problems on
// the nodes so the reviewer sees them before deciding.
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createWorkflowStoreFromEnv } from "../../src/ai/index.js";
import { executionSpaceId } from "../../src/ai/sessions/execution-lane.js";
import { scopeCoversCapability } from "../../src/ai/sessions/types.js";
import {
  GRAPH_GUIDANCE,
  GRAPH_GUIDANCE_ESSENTIALS,
} from "../../src/ai/workflows/authoring-guidance.js";
import { capabilityForModuleOperation } from "../../src/ai/workflows/capabilities.js";
import { missingRequiredFlowInputs } from "../../src/ai/workflows/flow-input.js";
import { validateGraphAction } from "../../src/ai/workflows/validate-graph.js";
import { createCoreAiScopeResolver } from "../../src/api/http.js";
import type { WorkflowSurface } from "../../src/dal/workflows/index.js";
import { emitInboxNotification } from "../../src/notifications/inbox.js";
import {
  acquireFrontendToolSuspendSlot,
  releaseFrontendToolSuspendSlot,
} from "../frontend-tools/frontend-tool-suspend-lock.js";
import { callerScope } from "./engenty-tools/lib/caller-scope.js";
import { resolveRegistryAgent } from "./engenty-tools/lib/registry-agent.js";
import { getEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";

/** A Workflow's editor (canvas + Publish), outside any space. */
function workflowEditorRoute(workflowId: string): string {
  return `/admin/engenty/workflows/${encodeURIComponent(workflowId)}`;
}

export const WORKFLOW_PROPOSE_TOOL_ID = "workflow_propose";

/**
 * Artifact-id encoding for the in-chat Publish card, mirroring the
 * `tool-approval|…` convention: the id is the card's routing context. The
 * resume hands it back (server-persisted, never the client payload), which is
 * how the re-entered tool knows WHICH saved version the human decided on.
 */
export const FLOW_PUBLISH_ARTIFACT_PREFIX = "flow-publish|";
export const FLOW_PUBLISH_CHOICE_PUBLISH = "publish";
export const FLOW_PUBLISH_CHOICE_KEEP_DRAFT = "keep_draft";

export function buildFlowPublishArtifactId(
  workflowId: string,
  versionId: string
): string {
  return `${FLOW_PUBLISH_ARTIFACT_PREFIX}${encodeURIComponent(workflowId)}|${encodeURIComponent(versionId)}`;
}

export function parseFlowPublishArtifactId(
  artifactId: string | undefined
): { workflowId: string; versionId: string } | null {
  if (!artifactId?.startsWith(FLOW_PUBLISH_ARTIFACT_PREFIX)) {
    return null;
  }
  const [workflowId, versionId] = artifactId
    .slice(FLOW_PUBLISH_ARTIFACT_PREFIX.length)
    .split("|")
    .map((segment) => decodeURIComponent(segment));
  return workflowId && versionId ? { workflowId, versionId } : null;
}

/** What the resume hands back when the user answers the Publish card. */
const actionProposeResumeSchema = z.object({
  artifact_id: z.string().optional(),
  cancelled: z.boolean().optional(),
  choice_id: z.string().optional(),
  choice_label: z.string().optional(),
  text: z.string().optional(),
});

export type ActionProposeResumeData = z.infer<typeof actionProposeResumeSchema>;
export { actionProposeResumeSchema as workflowPublishResumeSchema };

/** Same serialization key the other suspending tools use (one park per thread). */
export function publishSuspendLockKey(): string {
  const ctx = getEngentyToolsRunContext();
  return (
    ctx.orchestratorThreadId?.trim() ||
    ctx.userFacingThreadId?.trim() ||
    ctx.runId?.trim() ||
    "__untagged__"
  );
}

/**
 * Publish the version the card named, as the RESUMING human: their bearer is
 * re-resolved into a scope so the capability re-validation and the
 * `approved_by_user_id` stamp are exactly what the canvas Publish route would
 * produce. The model never reaches this path — only a human's answer does.
 */
export async function publishFromDecision(
  resume: ActionProposeResumeData
): Promise<
  | { code: string; message: string; ok: false }
  | {
      workflow_id: string;
      issues?: unknown[];
      note: string;
      ok: true;
      published: boolean;
      version: number;
    }
> {
  const parsed = parseFlowPublishArtifactId(resume.artifact_id);
  const ctx = getEngentyToolsRunContext();
  const tenantId = ctx.tenantId?.trim();
  const store = createWorkflowStoreFromEnv();
  if (!(parsed && tenantId && store)) {
    return {
      ok: false as const,
      code: "publish_context_lost",
      message:
        "The publish decision could not be matched to a saved Workflow version. " +
        "The draft is safe — the user can publish it from the canvas.",
    };
  }
  const version = await store.getVersion({
    id: parsed.versionId,
    tenantId,
  });
  if (!version || version.workflow_id !== parsed.workflowId) {
    return {
      ok: false as const,
      code: "not_found",
      message: "The saved version no longer exists; nothing was published.",
    };
  }
  const declined =
    resume.cancelled || resume.choice_id !== FLOW_PUBLISH_CHOICE_PUBLISH;
  if (declined) {
    return {
      ok: true as const,
      workflow_id: parsed.workflowId,
      version: version.version,
      published: false,
      note:
        "The user kept the Workflow as a draft. It cannot run until a human " +
        "publishes it on the canvas — do not treat the job as live.",
    };
  }
  const accessToken = ctx.accessToken?.trim();
  const resolved = accessToken
    ? await createCoreAiScopeResolver()({
        authorization: `Bearer ${accessToken}`,
      })
    : null;
  if (!resolved?.ok) {
    return {
      ok: false as const,
      code: "publish_unauthorized",
      message:
        "The publish could not run as the approving user. The draft is " +
        "saved — publish it from the canvas instead.",
    };
  }
  // Same gate as the canvas route: the approver's capabilities may not cover
  // every operation the graph performs.
  const issues = validateGraphAction(version.graph as never, {
    capabilityForOperation: capabilityForModuleOperation,
    holdsCapability: (capabilityId: string) =>
      scopeCoversCapability(resolved.scope, capabilityId),
  });
  if (issues.length > 0) {
    return {
      ok: true as const,
      workflow_id: parsed.workflowId,
      version: version.version,
      published: false,
      issues,
      note:
        "The user chose Publish, but the graph no longer validates for them " +
        "— it stays a draft. Report the issues; fixes go through a new " +
        "workflow_propose version.",
    };
  }
  await store.publishVersion({
    approvedByUserId: resolved.scope.userId,
    tenantId,
    versionId: parsed.versionId,
  });
  return {
    ok: true as const,
    workflow_id: parsed.workflowId,
    version: version.version,
    published: true,
    note:
      "The user published this Workflow — it is active now. If it backs a " +
      "recurring job, make sure the routine exists (routines_create with " +
      "workflow_id plus the owning agent_id).",
  };
}

const RUN_BY_VALUES = ["routine", "button", "slash_command", "agent"] as const;
type RunBy = (typeof RUN_BY_VALUES)[number];

const SURFACE_VALUES = [
  "chat",
  "wizard",
] as const satisfies readonly WorkflowSurface[];

interface LiftedParams {
  input_schema: Record<string, unknown> | undefined;
  output_schema: Record<string, unknown> | undefined;
  owner_agent_id: string | undefined;
  run_by: string | undefined;
  surface: string | undefined;
  workflow_id: string | undefined;
}

/**
 * Rescue tool parameters that a model nested inside `input_schema` /
 * `output_schema`. None of these keys is a JSON-Schema keyword, so finding one
 * inside a schema object means the model closed that object one brace too
 * late (a stray closing brace at the end keeps the call parseable) — pulling
 * them back to the top level is unambiguous. Without the lift, such a call
 * fails on "run_by missing" while `owner_agent_id` vanishes silently, saving
 * a Workflow onto no one's page.
 */
export function liftMisnestedParams(input: {
  workflow_id?: string;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  owner_agent_id?: string;
  run_by?: string;
  surface?: string;
}): LiftedParams {
  const lifted: LiftedParams = {
    workflow_id: input.workflow_id,
    input_schema: input.input_schema ? { ...input.input_schema } : undefined,
    output_schema: input.output_schema ? { ...input.output_schema } : undefined,
    owner_agent_id: input.owner_agent_id,
    run_by: input.run_by,
    surface: input.surface,
  };
  const liftFrom = (schema: Record<string, unknown>) => {
    if (lifted.run_by === undefined && typeof schema.run_by === "string") {
      lifted.run_by = schema.run_by;
      schema.run_by = undefined;
    }
    if (lifted.surface === undefined && typeof schema.surface === "string") {
      lifted.surface = schema.surface;
      schema.surface = undefined;
    }
    if (
      lifted.owner_agent_id === undefined &&
      typeof schema.owner_agent_id === "string"
    ) {
      lifted.owner_agent_id = schema.owner_agent_id;
      schema.owner_agent_id = undefined;
    }
    if (
      lifted.workflow_id === undefined &&
      typeof schema.workflow_id === "string"
    ) {
      lifted.workflow_id = schema.workflow_id;
      schema.workflow_id = undefined;
    }
  };
  // output_schema first: it may itself be buried inside input_schema, and the
  // later keys can then sit inside IT.
  if (
    lifted.input_schema &&
    lifted.output_schema === undefined &&
    typeof lifted.input_schema.output_schema === "object" &&
    lifted.input_schema.output_schema !== null &&
    !Array.isArray(lifted.input_schema.output_schema)
  ) {
    lifted.output_schema = {
      ...(lifted.input_schema.output_schema as Record<string, unknown>),
    };
    lifted.input_schema.output_schema = undefined;
  }
  if (lifted.input_schema) {
    liftFrom(lifted.input_schema);
  }
  if (lifted.output_schema) {
    liftFrom(lifted.output_schema);
  }
  return lifted;
}

export const actionProposeTool = createTool({
  id: WORKFLOW_PROPOSE_TOOL_ID,
  description:
    "Propose a multi-step Workflow as a declarative graph, for human review. " +
    "Nothing runs from this call — the version is saved unapproved and a human " +
    "publishes it on the canvas, so this call alone leaves the user with " +
    "nothing that runs. Use for a fixed shape (draft → approve → send → wait " +
    "→ chase), NOT for one-off work and NOT as the answer to a recurring job: " +
    "a job that should keep happening needs an agent that owns it plus a " +
    "routine, and this Workflow is at most the body that routine points at. " +
    "Keep the input schema to what a caller genuinely carries — resolve a " +
    "mailbox, a connected account or the current date inside a node, since a " +
    "scheduled routine supplies no input of its own. If the call returns " +
    "issues, fix the graph and call again. In an interactive chat the call " +
    "pauses on a Publish card; the result then says whether the user " +
    "published the Workflow or kept it as a draft — report that outcome, never " +
    "assume it.",
  inputSchema: z.object({
    name: z
      .string()
      .min(1)
      .max(80)
      .describe("Short display name for the Workflow"),
    description: z
      .string()
      .min(1)
      .max(500)
      .describe("One sentence: what this Workflow does, in the user's words"),
    context_type: z
      .string()
      .optional()
      .describe(
        'Subject this Workflow runs against, e.g. "offers.offer". Omit for a ' +
          "Workflow with no subject."
      ),
    graph: z
      .array(z.record(z.string(), z.unknown()))
      .min(1)
      .describe(`The ordered entry list.\n${GRAPH_GUIDANCE_ESSENTIALS}`),
    input_schema: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("JSON Schema for the Workflow's input"),
    output_schema: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("JSON Schema for the Workflow's result"),
    workflow_id: z
      .string()
      .optional()
      .describe(
        "Existing Workflow to add a new version to. Omit to create a new Workflow."
      ),
    // Ownership decides where the Workflow LIVES: on the specialist's own page
    // (Manage tab, routine binding) or in the shared library. The hire flow
    // always names the specialist it just hired — a workflow proposed for an
    // agent but saved ownerless is invisible on that agent's page.
    owner_agent_id: z
      .string()
      .optional()
      .describe(
        "The specialist that OWNS this workflow — its registry id (e.g. " +
          "'research.daily-briefing'). Always set it when the Workflow is part " +
          "of hiring or extending a specialist. Omit only for a shared " +
          "library Workflow that belongs to no one agent."
      ),
    // Required, and deliberately not inferable: a Workflow runs only when
    // something calls it, and naming that caller here is what stops a Workflow
    // being delivered as a finished feature that nothing ever runs. Optional
    // in the Zod schema only so a call that misnested it (see
    // liftMisnestedParams) reaches execute, where the requirement is enforced
    // with an error the model can act on.
    run_by: z
      .enum(["routine", "button", "slash_command", "agent"])
      .optional()
      .describe(
        "REQUIRED — what will call this Workflow. `routine` = a standing job " +
          "on an owning agent, whether a clock wakes it or a person presses " +
          "it; it needs that agent and a routines_create call, and this tool " +
          "creates neither."
      ),
    // Optional rather than defaulted so a value misnested into a schema can
    // still be lifted (see liftMisnestedParams); execute treats absent as chat.
    surface: z
      .enum(SURFACE_VALUES)
      .optional()
      .describe(
        "wizard = an end user walks the run step by step: every approval_gate " +
          "is a page; needs at least one gate. chat (default) = the cards land " +
          "in the owning specialist's chat."
      ),
  }),
  resumeSchema: actionProposeResumeSchema,
  execute: async (input, executionContext) => {
    // Resume re-enters execute with the human's Publish-card answer; the
    // original `await suspend()` below never continues.
    const resume = executionContext?.agent?.resumeData as
      | ActionProposeResumeData
      | undefined;
    if (resume) {
      releaseFrontendToolSuspendSlot(publishSuspendLockKey());
      return await publishFromDecision(resume);
    }
    const ctx = getEngentyToolsRunContext();
    const tenantId = ctx.tenantId?.trim();
    if (!tenantId) {
      return {
        ok: false as const,
        code: "unauthorized",
        message: "workflow_propose is unavailable in this run (no tenant).",
      };
    }
    const store = createWorkflowStoreFromEnv();
    if (!store) {
      return {
        ok: false as const,
        code: "unavailable",
        message: "action storage is not configured.",
      };
    }

    const params = liftMisnestedParams(input);
    const runBy: RunBy | undefined = RUN_BY_VALUES.find(
      (value) => value === params.run_by
    );
    if (!runBy) {
      return {
        ok: false as const,
        code: "invalid_run_by",
        message:
          "`run_by` must be one of routine | button | slash_command | agent, " +
          "as a TOP-LEVEL parameter of this call — never inside " +
          "input_schema. " +
          (params.run_by === undefined
            ? "It was missing entirely."
            : `Got: ${JSON.stringify(params.run_by)}.`) +
          " Check the call's braces: close input_schema and output_schema " +
          "fully before the remaining parameters, then call again.",
      };
    }

    // The surface is declared intent; whether the graph can be walked as a
    // wizard is what the validator checks (`wizard-without-step`).
    const surface: WorkflowSurface =
      SURFACE_VALUES.find((value) => value === params.surface) ?? "chat";

    const stored = {
      description: input.description,
      graph: input.graph,
      id: "workflow:pending",
      inputSchema: params.input_schema ?? { properties: {}, type: "object" },
      outputSchema: params.output_schema ?? { properties: {}, type: "object" },
    };

    // Validate BEFORE creating the definition, so a malformed graph doesn't
    // leave an empty shell behind for the user to clean up.
    const issues = validateGraphAction(stored, { surface });
    if (issues.length > 0) {
      return {
        ok: false as const,
        code: "action_invalid",
        issues,
        // The full authoring rules ride WITH the failure rather than in the
        // tool description: a graph that lands first try never pays for them.
        message: `The Workflow did not validate. Fix these and call again:\n${issues
          .map((issue) => `- [${issue.code}] ${issue.message}`)
          .join(
            "\n"
          )}\n\nThe complete rules for writing a graph:\n${GRAPH_GUIDANCE}`,
      };
    }

    // A specialist writes Workflows for its own page only: the owner is
    // itself, whatever the call named. A coordinator and the copilot may
    // name any mounted specialist (the hire flow does).
    const caller = callerScope();
    let ownerAgentId = params.owner_agent_id?.trim() || null;
    if (caller.kind === "specialist") {
      if (ownerAgentId && ownerAgentId !== caller.id) {
        return {
          ok: false as const,
          code: "not_owner",
          message:
            `You can propose Workflows for yourself only, not for '${ownerAgentId}'. ` +
            "Omit owner_agent_id, or ask a coordinator to write it for them.",
        };
      }
      ownerAgentId = caller.id;
    }
    // The owner must exist in the registry — a typo here would save a
    // workflow onto a page nobody can ever open. An unreachable registry
    // does not refuse: the draft is inert until a human publishes it.
    if (ownerAgentId) {
      const owner = await resolveRegistryAgent(ownerAgentId);
      if (owner === null) {
        return {
          ok: false as const,
          code: "unknown_owner",
          message:
            `No agent '${ownerAgentId}' in this tenant's registry. Use ` +
            "registry_agents_list and pass an id it returned, or omit " +
            "owner_agent_id for a library Workflow.",
        };
      }
    }

    try {
      let graphId = params.workflow_id;
      if (graphId) {
        const existing = await store.getGraph({ id: graphId, tenantId });
        if (!existing) {
          return {
            ok: false as const,
            code: "not_found",
            message: `No Workflow with id ${graphId} in this workspace.`,
          };
        }
      } else {
        const created = await store.create({
          description: input.description,
          name: input.name,
          surface,
          tenantId,
          ...(input.context_type ? { contextType: input.context_type } : {}),
          ...(ownerAgentId ? { ownerAgentId } : {}),
        });
        graphId = created.id;
      }

      const version = await store.saveVersion({
        workflowId: graphId,
        authoredBy: "copilot",
        graph: { ...stored, id: `workflow:${graphId}` },
        inputSchema: stored.inputSchema as Record<string, unknown>,
        outputSchema: stored.outputSchema as Record<string, unknown>,
        tenantId,
      });

      await emitInboxNotification({
        dedupeKey: `flow-graph-proposal:${tenantId}:${graphId}`,
        spaceId: executionSpaceId(ctx.space) ?? null,
        kind: "workflow_proposed",
        ...(ctx.agentTypeKey
          ? { actor: { id: ctx.agentTypeKey, kind: "agent" as const } }
          : {}),
        body: input.description,
        metadata: {
          workflow_id: graphId,
          version: version.version,
          ...(ownerAgentId ? { owner_agent_id: ownerAgentId } : {}),
        },
        priority: "medium",
        source: "workflows",
        // An owned Workflow opens on its owner's manage panel (built from
        // workflow_id + owner_agent_id); a library one has no desk, so its
        // own editor page, where Publish sits.
        ...(ownerAgentId ? {} : { target: workflowEditorRoute(graphId) }),
        tenantId,
        title: { key: "workflow_proposed", params: { name: input.name } },
      });

      // Interactive chat: park the run on a Publish card so the human can
      // activate the Workflow right here. The generic decision lane renders it
      // (no bespoke widget); the resume above performs the publish AS THE
      // HUMAN. Headless and delegated runs cannot park — they keep the
      // review-on-canvas result below.
      //
      // A routine's body is the exception: routines_create publishes it as
      // it creates the routine — on ONE card where the Space asks a person,
      // on its own where the mode lets the agent decide — so a second card
      // here would ask the same person twice for the same job.
      if (
        runBy !== "routine" &&
        ctx.canSuspendForInteraction &&
        executionContext?.agent?.suspend
      ) {
        const artifactId = buildFlowPublishArtifactId(graphId, version.id);
        const stepCount = input.graph.length;
        const lockKey = publishSuspendLockKey();
        const ticket = await acquireFrontendToolSuspendSlot(lockKey);
        try {
          const noun = surface === "wizard" ? "Wizard" : "Workflow";
          await executionContext.agent.suspend({
            artifact_id: artifactId,
            artifact_type: "decision" as const,
            title: `Publish ${noun} "${input.name}"?`,
            body:
              `${input.description}\n\n${stepCount} step${stepCount === 1 ? "" : "s"}` +
              `${ownerAgentId ? ` · owned by ${ownerAgentId}` : ` · library ${noun}`}` +
              (surface === "wizard"
                ? " · walked page by page by the person who starts it. "
                : ". ") +
              "Publishing activates it; as a draft it cannot run.",
            choices: [
              {
                id: FLOW_PUBLISH_CHOICE_PUBLISH,
                label: "Publish",
                description: "Activate this Workflow so it can run.",
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

      const requiredInput = missingRequiredFlowInputs(stored.inputSchema, {});
      return {
        ok: true as const,
        workflow_id: graphId,
        version: version.version,
        surface,
        note: [
          runBy === "routine"
            ? "Saved as a draft. This Workflow runs nothing on its own: " +
              "create the routine now (routines_create with this workflow_id" +
              (ownerAgentId ? ` and agent_id ${ownerAgentId}` : "") +
              ") — that call publishes the Workflow as it creates the " +
              "routine, on a card for the person where this Space asks one. " +
              "Tell the user who owns it."
            : "Saved unapproved. It cannot run until a human reviews the steps " +
              "on the canvas and publishes the Workflow — you cannot publish it " +
              "yourself.",
          ownerAgentId && runBy !== "routine"
            ? `It is listed in ${ownerAgentId}'s settings drawer as awaiting publish. ` +
              `In a Space run, link it as /s/<space key>/agents/${ownerAgentId}?panel=manage ` +
              "(the key is on current_space) — never an /admin/… link, which " +
              "leaves the user's Space."
            : null,
          surface === "wizard"
            ? "Once published it is listed as a wizard: a slash command and a " +
              "catalog card open it, and the person answers one page per gate."
            : null,
          requiredInput.length > 0
            ? `Every call must carry: ${requiredInput.join(", ")}. A schedule ` +
              "carries only the routine's static workflow_input, so either set " +
              "it there or resolve the value inside a node instead."
            : null,
        ]
          .filter(Boolean)
          .join(" "),
      };
    } catch (err) {
      return {
        ok: false as const,
        code: "workflow_propose_failed",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

export function createActionProposeTools() {
  return { [WORKFLOW_PROPOSE_TOOL_ID]: actionProposeTool };
}
