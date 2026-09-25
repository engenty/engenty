// `run_specialist` — the judgment pocket, and the reason graph actions don't
// use Mastra's declarative `agent` entry.
//
// Engenty specialists are assembled per (tenant, agent_type_key) at run time
// (same constraint documented in `ai/workflows/task-job-workflow.ts`), so an
// agent cannot be baked into a static graph by id. Modelling an agent node as a
// `tool` entry moves that resolution INSIDE the primitive, where the run
// context is available — and makes per-node tool scoping a plain tool argument
// instead of an upstream feature request.
//
// Approvals: a specialist node MAY ask for approval mid-run (Matthias's
// ruling, 2026-08-24) — but only when the RUN says so, never by graph
// authorship. With no `approvalPolicy` in the run context the node keeps the
// original rule, `deny`: it cannot perform gated operations, and approval is
// an explicit `approval_gate` node followed by an explicit write node, so what
// needs a human stays visible on the canvas. A run that sets "request" (an
// instruction routine, whose agent has always been allowed to ask and whose
// task parks for a human) gets the ask: the node suspends carrying the parked
// call, the human decides, and the resume replays it exactly once — the same
// suspend/resume seam `approval_gate` uses, and the same replay-once contract
// as the task lane's `approved_resume_calls`.
import { randomUUID } from "node:crypto";
import { createTool } from "@mastra/core/tools";
import { jsonSchemaToZod } from "@mastra/core/workflows";
import { z } from "zod";
import {
  CALLER_THREAD_TOOLS_GUIDANCE,
  createCallerThreadTools,
} from "../../../../ai/tools/caller-thread-tools.js";
import {
  type EngentyToolsRunContext,
  engentyToolsRunAls,
} from "../../../../ai/tools/engenty-tools/lib/run-context.js";
import { isUnresolvedSpaceGate } from "../../../../ai/tools/engenty-tools/lib/space-gate.js";
import {
  createOutcomesDeliverTool,
  OUTCOMES_DELIVER_GUIDANCE,
} from "../../../../ai/tools/outcomes-deliver-tool.js";
import {
  createRoutineSelfTools,
  ROUTINE_SELF_TOOLS_GUIDANCE,
} from "../../../../ai/tools/routine-self-tools.js";
import {
  createTaskSelfTools,
  TASK_SELF_TOOLS_GUIDANCE,
} from "../../../../ai/tools/task-self-tools.js";
import { createDefaultAiRegistry } from "../../agents.js";
import { inheritChildSpace } from "../../conversation/child-space.js";
import { runDelegatedConversation } from "../../conversation/delegate-run.js";
import {
  createAgentRunStoreFromEnv,
  createRegistryStoreFromEnv,
  createRoutineOutcomeStoreFromEnv,
  createRoutineStoreFromEnv,
  createThreadStoreFromEnv,
  createWorkflowRunStoreFromEnv,
} from "../../index.js";
import { buildHeadlessWorkspace } from "../../jobs/headless-workspace.js";
import { createDefaultModuleCapabilityLoader } from "../../module-capability-loader.js";
import { serviceScopeTokenRefresher } from "../../service-credential.js";
import { formatRunClock } from "../../sessions/run-clock.js";
import { createScopeModuleOperationInvoker } from "../../sessions/task-workspace-hook.js";
import { scopeAccessToken } from "../../sessions/types.js";
import { resolveGraphRunModelConfig } from "../model-config.js";
import { RUN_SPECIALIST_PRIMITIVE_ID } from "../primitive-ids.js";
import {
  intersectAllowedToolIds,
  readGraphRunContext,
  resolveGraphRunScope,
} from "../run-context.js";
import { narrateGraphRunActivity } from "../run-events.js";
import { resolveGraphToolSpace } from "./engenty-tool.js";

export { RUN_SPECIALIST_PRIMITIVE_ID } from "../primitive-ids.js";

const inputSchema = z.object({
  /** Registry agent id / agent_type_key resolved against the tenant registry. */
  agent_type_key: z.string().min(1),
  /** What this node should accomplish. Usually built by an upstream mapping. */
  brief: z.string().min(1),
  /** Structured payload appended to the brief as context. */
  input: z.record(z.string(), z.unknown()).default({}),
  /**
   * JSON Schema the node's output must satisfy — carried as DATA so the
   * designer can type-check edges across an agent node (Mastra's own schema
   * flow sees only this primitive's static envelope).
   */
  output_schema: z.record(z.string(), z.unknown()).optional(),
  /** Node-level tool narrowing; intersected with the action-level allow list. */
  allowed_tools: z.array(z.string()).optional(),
  /**
   * "new" gives this node its own thread; "reuse" runs it on the action's.
   *
   * NEW is the default because a routine's fires share one action thread, and
   * on `reuse` every fire inherits the last one's transcript. Live-observed:
   * a greeting agent kept following a plan from an earlier fire — and a stale
   * instruction with it — long after its own instructions had changed, and
   * greeted with "welcome back" on what was meant to be first contact. The
   * same run on a fresh thread called its tools and got it right.
   *
   * Carrying data BETWEEN steps is the mapping's job, not the thread's:
   * `brief` takes a `{template}` over `${stepResults.<id>.<field>}`, which is
   * explicit and visible on the canvas. A shared thread is an implicit side
   * channel that nobody reviewing the graph can see.
   */
  thread_mode: z.enum(["reuse", "new"]).default("new"),
});

const outputSchema = z.object({
  /** Parsed + validated against `output_schema`, or `{ text }` when unset. */
  output: z.unknown(),
  run_id: z.string(),
  thread_id: z.string(),
});

/**
 * Pull a JSON object out of a model's final text: bare, fenced, or embedded.
 * Returns undefined when there's nothing object-shaped to take.
 *
 * The embedded case scans for the first BALANCED object instead of slicing
 * first `{` to last `}`: models sometimes append a stray closing brace after
 * an otherwise perfect object, and the last-brace slice would swallow it and
 * fail the whole step over one junk character.
 */
function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidates = [fenced?.[1]?.trim(), trimmed].filter(
    (value): value is string => Boolean(value)
  );
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // fall through to the balanced-object attempt
    }
    const balanced = firstBalancedJsonObject(candidate);
    if (balanced !== undefined) {
      try {
        return JSON.parse(balanced);
      } catch {
        // not this one either
      }
    }
  }
  return;
}

/** The first string-aware brace-balanced `{...}` span, or undefined. */
function firstBalancedJsonObject(text: string): string | undefined {
  const start = text.indexOf("{");
  if (start === -1) {
    return;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return;
}

/**
 * Compose what the specialist actually opens with: the brief, what the run is
 * ABOUT, its structured input, and the output contract.
 *
 * The subject comes from the run context rather than the node definition — a
 * graph run already knows which record it is about (a button press, a task's
 * `task_contexts`), and without this the specialist has to guess from prose.
 * `buildActionBrief` has always given the action lane exactly this section;
 * a specialist inside a graph gets the same account of its situation.
 *
 * Until delegate-run grows a native structuredOutput seam, the output contract
 * plus schema validation on the way out is what makes an agent node's output
 * type-safe enough to chain from.
 */
/** The short string arguments of a call — enough to say what it does. */
function shortStringArgs(args: unknown): Record<string, string> {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && value.trim() && value.length <= 200) {
      out[key] = value.trim();
    }
  }
  return out;
}

/**
 * Where a routine run's result goes: the next step stores the answer, rows
 * go into the Space's table, or — a canvas step with no contract — the run
 * stores it itself and ends with a short summary. The settle links the result
 * from the report and the notification, so the person lands on it.
 */
/** True when the step answers with the document the next step stores. */
function answersWithDocument(
  outputSchema: Record<string, unknown> | undefined
): boolean {
  const properties = outputSchema?.properties;
  return (
    Boolean(properties) &&
    typeof properties === "object" &&
    "document" in (properties as object)
  );
}

export function routineResultGuidance(
  outputSchema: Record<string, unknown> | undefined
): string {
  if (answersWithDocument(outputSchema)) {
    // The next step stores the answer; writing it here too would leave two.
    return [
      "## Result",
      "- Your answer is the result: the next step stores it and links it from the notification. Do not store it yourself.",
    ].join("\n");
  }
  if (outputSchema) {
    // A data routine: the rows are the result, the answer only reports them.
    return [
      "## Result",
      "- The result is rows in this Space's table: load **space-data**, find the table the brief names with `artifact_read`, and write with `table_write` — the same table every run, created only the first time. Never a page for rows.",
      "- Your answer is the summary: what you added or changed.",
    ].join("\n");
  }
  return [
    "## Result",
    "- Store what the person should read or open with `artifact_write`. When it is the same document every run (a daily page), update that artifact instead of creating another. If you wrote more than one, `show_artifact` the one that is the result.",
    "- End with two or three sentences: what you found or did. That becomes the notification, and the stored result is linked from it.",
  ].join("\n");
}

export function composeSpecialistBrief(
  brief: string,
  input: Record<string, unknown>,
  outputJsonSchema: Record<string, unknown> | undefined,
  subject?: { contextId?: string; contextType?: string }
): string {
  const parts = [brief, `\n## Run context\n${formatRunClock()}`];
  const subjectType = subject?.contextType?.trim();
  const subjectId = subject?.contextId?.trim();
  if (subjectType && subjectId) {
    parts.push(`\n## Subject\n- ${subjectType}: ${subjectId}`);
  }
  if (Object.keys(input).length > 0) {
    parts.push(`\nInput:\n${JSON.stringify(input, null, 2)}`);
  }
  if (outputJsonSchema) {
    parts.push(
      `\nRespond with ONLY a JSON object matching this schema — no prose, no code fence:\n${JSON.stringify(
        outputJsonSchema
      )}`
    );
  }
  return parts.join("\n");
}

/**
 * The parked call, as it travels. DECLARED because Mastra validates a tool's
 * suspend payload and resume data against these schemas — a node that suspends
 * without declaring them has its payload rejected, which is the same
 * validation trap that has bitten this codebase twice.
 */
const gatedCallSchema = z.object({
  input: z.record(z.string(), z.unknown()).optional(),
  operation_id: z.string(),
  title: z.string().optional(),
});

const suspendSchema = z.object({
  context_id: z.string().optional(),
  context_type: z.string().optional(),
  kind: z.enum(["operation_approval", "question"]),
  payload: z.object({
    pending_calls: z.array(gatedCallSchema).optional(),
    question: z.string().optional(),
  }),
  request_id: z.string(),
  title: z.string(),
});

/** What a resume hands back: the calls a human said yes to. */
const resumeSchema = z.object({
  approved_calls: z.array(gatedCallSchema).optional(),
});

/**
 * A gated operation an agent asked for and did not have. Same shape as the
 * task lane's `approvedResumeCallSchema` on purpose: one contract for "a call
 * a human approved", whether the run is a graph node or a task job.
 */
interface ApprovedGatedCall {
  input?: Record<string, unknown>;
  operation_id: string;
  title?: string;
}

export function createRunSpecialistPrimitive() {
  return createTool({
    id: RUN_SPECIALIST_PRIMITIVE_ID,
    description:
      "Run a tenant specialist agent on a brief and return its structured output.",
    inputSchema,
    outputSchema,
    suspendSchema,
    resumeSchema,
    execute: async (input, ctx) => {
      const runCtx = readGraphRunContext(ctx.requestContext);
      const store = createThreadStoreFromEnv();
      if (!store) {
        throw new Error(
          "graph-action: agent session store is not configured — run_specialist cannot run"
        );
      }
      const scope = await resolveGraphRunScope(runCtx);
      // A scheduled fire executes with NO ambient engenty-tools context, and
      // the registry's capability loader resolves its core client from that
      // ALS — so everything from here on runs inside one, carrying the
      // run's own service credential. (An HTTP-triggered run used to borrow
      // the caller's request context here, which masked exactly this gap for
      // every manual fire.) The delegated child still enters its richer
      // context on top.
      const toolsContext: EngentyToolsRunContext = {
        accessToken: scopeAccessToken(scope),
        tenantId: runCtx.tenantId,
        userId: scope.userId,
      };
      // A step can outlive the 15-minute service token it started on; the
      // refresh seam re-mints on a core 401 and writes the live bearer back
      // so the step's later calls start on it.
      const refresher = serviceScopeTokenRefresher(scope);
      if (refresher) {
        toolsContext.refreshAccessToken = async () => {
          const fresh = await refresher();
          if (fresh) {
            toolsContext.accessToken = fresh;
          }
          return fresh;
        };
      }
      return await engentyToolsRunAls.run(toolsContext, async () => {
        const registry = createDefaultAiRegistry({
          databaseStore: createRegistryStoreFromEnv(),
          moduleLoader: createDefaultModuleCapabilityLoader(),
          tenantId: runCtx.tenantId,
        });

        let threadId = runCtx.threadId;
        const space = inheritChildSpace({
          parent: resolveGraphToolSpace(runCtx.space),
        });
        // The mount gate, in the space-gate vocabulary: a specialist that is
        // not mounted in this run's Space does not exist for it. Global runs
        // ({@code space === null}) stay tenant-wide by intention.
        if (isUnresolvedSpaceGate(space)) {
          throw new Error(
            `run_specialist: this run claimed a Space (${space.reason}) but could not resolve it, so ${input.agent_type_key} cannot run. ` +
              "Delegation is refused until the Space is available — do not retry."
          );
        }
        if (space && !(space.agentIds?.has(input.agent_type_key) ?? false)) {
          throw new Error(
            `run_specialist: ${input.agent_type_key} is not mounted in this run's Space. ` +
              "Only mounted specialists can be delegated to here; mount it via space_setup or pick one from registry_agents_list."
          );
        }
        if (input.thread_mode === "new") {
          const spaceId =
            space && "spaceId" in space && typeof space.spaceId === "string"
              ? space.spaceId
              : undefined;
          const { thread } = await store.createThread({
            agentId: input.agent_type_key,
            // Nobody authored this room — the machine opened it for one
            // step. Null is also the only correct value: a fire runs on a
            // service scope whose user id is a principal, not a row in
            // `users`, and naming it here trips the thread's FK. Leaving it
            // null is what makes `isConversationThread` read this as the
            // run's thread rather than somebody's chat.
            createdByUserId: null,
            // The run this step belongs to, so `threadKind` reads it as a
            // `run` the way the run's own thread is read. Without it the step
            // thread looked like a desk line, and the desk opened it as
            // "where you left off" — showing the person the structured JSON
            // the specialist answered its graph with.
            routeContext: {
              workflow_id: runCtx.workflowId,
              workflow_run_id: runCtx.requestId,
              ...(runCtx.routineId ? { routine_id: runCtx.routineId } : {}),
              ...(runCtx.taskId ? { task_id: runCtx.taskId } : {}),
            },
            tenantId: runCtx.tenantId,
            title: `Action step — ${input.agent_type_key}`,
            ...(spaceId ? { spaceId } : {}),
          });
          threadId = thread.id;
        }

        const childRunId = randomUUID();
        const allowedToolIds = intersectAllowedToolIds(
          runCtx.allowedToolIds,
          input.allowed_tools
        );

        // Without this the specialist runs on its compiled-in default model:
        // `assembleDynamicAgent` short-circuits when no modelConfig is supplied,
        // so the tenant's bindings and AI settings never get a say. Resolved
        // here (not pinned to a tier) so each node runs at the effort tier ITS
        // agent declares.
        const modelConfig = await resolveGraphRunModelConfig(scope);

        // Resume path first, exactly like approval_gate: the same node
        // re-executes with resumeData once the human has decided. The approved
        // calls are replayed ONCE inside the delegated run, before the model
        // gets a turn, so the agent continues from the work already done rather
        // than re-deciding it.
        const resumed = ctx.workflow?.resumeData as
          | { approved_calls?: ApprovedGatedCall[] }
          | undefined;
        const approvedResumeCalls = resumed?.approved_calls ?? [];

        // The task's own tools, when this run works ON a task. Without them a
        // graph node could not comment or ask — so a FLOW routine's agent node
        // was mute while an instruction routine's could report and ask, for no
        // reason other than which lane built the run. A question parks the run
        // exactly like an approval does: both mean "a human is needed".
        let askedQuestion: string | null = null;
        const taskTools = runCtx.taskId
          ? createTaskSelfTools({
              agentTypeKey: input.agent_type_key,
              invoke: createScopeModuleOperationInvoker(scope),
              onQuestion: (question) => {
                askedQuestion ??= question;
              },
              taskId: runCtx.taskId,
            })
          : {};

        // A routine run's voice: interim findings and questions land in the
        // owner's chat while the run works, instead of only the settle report
        // after it. A question parks the run exactly like a task question does.
        const routineStore = runCtx.routineId
          ? createRoutineStoreFromEnv()
          : null;
        const outcomeStore = runCtx.routineId
          ? createRoutineOutcomeStoreFromEnv()
          : null;
        const outcomeBindings =
          outcomeStore && runCtx.routineId
            ? await outcomeStore.list({
                enabled: true,
                routineId: runCtx.routineId,
                tenantId: runCtx.tenantId,
              })
            : [];
        const routineTools =
          runCtx.routineId && routineStore
            ? {
                ...createRoutineSelfTools({
                  agentTypeKey: input.agent_type_key,
                  onQuestion: (question) => {
                    askedQuestion ??= question;
                  },
                  routineId: runCtx.routineId,
                  routines: routineStore,
                  runId: childRunId,
                  tenantId: runCtx.tenantId,
                }),
                ...(outcomeBindings.length > 0
                  ? createOutcomesDeliverTool({
                      bindings: outcomeBindings,
                      graphRunId: ctx.workflow?.runId ?? null,
                      requestId: runCtx.requestId,
                      routineId: runCtx.routineId,
                      routines: routineStore,
                      tenantId: runCtx.tenantId,
                      threadId: runCtx.threadId,
                    })
                  : {}),
              }
            : {};
        // A window onto the conversation that ASKED for this run, when one
        // did. Read-only and bound to that thread id — the run answers where
        // it normally answers; this only lets a step resolve what the brief
        // pointed at without naming ("the offer we just discussed").
        const callerTools = runCtx.callerThreadId
          ? createCallerThreadTools({
              callerThreadId: runCtx.callerThreadId,
              store,
              tenantId: runCtx.tenantId,
            })
          : {};
        const selfTools = { ...taskTools, ...routineTools, ...callerTools };

        // What "last time" did, so successive runs of a routine accumulate
        // instead of each waking with amnesia. The run index is the source —
        // outcome, summary and reason are already recorded there at settle.
        const previousRuns = runCtx.routineId
          ? await createWorkflowRunStoreFromEnv()
              ?.listByRoutine({
                limit: 5,
                routineId: runCtx.routineId,
                tenantId: runCtx.tenantId,
              })
              .then((rows) =>
                rows
                  .filter(
                    (row) =>
                      row.status === "completed" || row.status === "failed"
                  )
                  .slice(0, 3)
              )
              .catch(() => [])
          : [];
        const previousRunsSection = previousRuns?.length
          ? `## Previous runs\n${previousRuns
              .map((row) => {
                const day = row.created_at.slice(0, 10);
                const verdict = row.outcome ?? row.status;
                const said = row.summary ?? row.reason ?? "";
                return `- ${day} · ${verdict}${said ? ` — ${said.slice(0, 200)}` : ""}`;
              })
              .join("\n")}`
          : null;

        // Where a routine run's result goes.
        const routineResultSection = runCtx.routineId
          ? routineResultGuidance(input.output_schema)
          : null;

        // Only a run that opted in may ask; absent policy stays `deny`.
        const approvalPolicy = runCtx.approvalPolicy ?? "deny";

        // The node's files, and its computer when its agent declares one. A
        // routine fire is the case this exists for: an agent that can write a
        // script and run it only when a person is watching is not the same agent
        // the schedule reaches. `/routine` is rooted on the routine, so
        // successive fires read what the last one left.
        const headlessWorkspace = await buildHeadlessWorkspace({
          agentId: input.agent_type_key,
          registry,
          runId: childRunId,
          scope,
          threadId,
          ...(runCtx.routineId ? { routineId: runCtx.routineId } : {}),
          ...(space && "spaceId" in space && typeof space.spaceId === "string"
            ? { spaceId: space.spaceId }
            : {}),
        });
        // Collected by the delegated run under the "request" policy: every gated
        // operation its agent wanted and did not have. Deduped by operation id —
        // a model that asks three times has one thing to approve.
        const pending = new Map<string, ApprovedGatedCall>();

        // The card watching the workflow says what this step is doing now.
        const graphRunId = ctx.workflow?.runId ?? null;
        const result = await runDelegatedConversation({
          ...(graphRunId
            ? {
                onToolCall: (call: { args: unknown; toolName: string }) =>
                  narrateGraphRunActivity(graphRunId, {
                    args: shortStringArgs(call.args),
                    step: input.agent_type_key,
                    tool_name: call.toolName,
                  }),
              }
            : {}),
          approvalPolicy,
          // Standing grants, so a fire that needs to run a script or write to a
          // gated module does it instead of parking for an absent human.
          ...(runCtx.approvalGrants?.length
            ? { approvalGrants: [...runCtx.approvalGrants] }
            : {}),
          ...(headlessWorkspace
            ? { workspace: headlessWorkspace.workspace }
            : {}),
          ...(headlessWorkspace?.sandboxProvider
            ? { sandboxProvider: headlessWorkspace.sandboxProvider }
            : {}),
          ...(headlessWorkspace?.computeInstructions
            ? {
                extraInstructionBodies: [headlessWorkspace.computeInstructions],
              }
            : {}),
          ...(Object.keys(selfTools).length > 0
            ? { extraTools: selfTools }
            : {}),
          ...(approvedResumeCalls.length > 0 ? { approvedResumeCalls } : {}),
          ...(approvalPolicy === "request"
            ? {
                onApprovalRequired: (request: {
                  input?: Record<string, unknown>;
                  operationId: string;
                  title?: string;
                }) => {
                  // MERGE, never overwrite. A model often asks for the same
                  // operation twice and the second ask can be bare (a bulk
                  // pre-approval carries no input) — clobbering the first
                  // request would throw away the concrete arguments, and those
                  // are the whole reason an approval can replay the exact call
                  // instead of letting the model re-derive it.
                  const existing = pending.get(request.operationId);
                  pending.set(request.operationId, {
                    operation_id: request.operationId,
                    ...(existing?.input ? { input: existing.input } : {}),
                    ...(existing?.title ? { title: existing.title } : {}),
                    ...(request.input ? { input: request.input } : {}),
                    ...(request.title ? { title: request.title } : {}),
                  });
                },
              }
            : {}),
          brief: composeSpecialistBrief(
            // The guidance has to ride the brief: a tool the agent is not told
            // about is a tool it does not use.
            [
              input.brief,
              ...(previousRunsSection ? [previousRunsSection] : []),
              ...(routineResultSection ? [routineResultSection] : []),
              ...(runCtx.taskId ? [TASK_SELF_TOOLS_GUIDANCE] : []),
              ...(runCtx.routineId && routineStore
                ? [
                    ROUTINE_SELF_TOOLS_GUIDANCE,
                    ...(outcomeBindings.length > 0
                      ? [OUTCOMES_DELIVER_GUIDANCE]
                      : []),
                  ]
                : []),
              ...(runCtx.callerThreadId ? [CALLER_THREAD_TOOLS_GUIDANCE] : []),
            ].join("\n\n"),
            input.input,
            input.output_schema,
            {
              ...(runCtx.contextId ? { contextId: runCtx.contextId } : {}),
              ...(runCtx.contextType
                ? { contextType: runCtx.contextType }
                : {}),
            }
          ),
          childAgentId: input.agent_type_key,
          childRunId,
          childThreadId: threadId,
          modelConfig,
          // Stream + persist so the canvas run overlay and WorkflowButton show
          // live progress. `suspendForApproval` stays off: THIS node owns its
          // suspend (below), so the conversation layer must not also park.
          observe: {
            runStore: createAgentRunStoreFromEnv(),
            tenantId: runCtx.tenantId,
          },
          registry,
          // Carries to core as `x-engenty-routine-id`, so a fire may spend the
          // routine's own approval grants instead of parking on every write.
          ...(runCtx.routineId ? { routineId: runCtx.routineId } : {}),
          scope,
          space,
          store,
          ...(allowedToolIds ? { allowedToolIds } : {}),
          // The next step stores the document. Told not to, an agent used to
          // writing pages stored it anyway — so it does not get the tool.
          ...(answersWithDocument(input.output_schema)
            ? { blockedToolIds: ["artifact_write"] }
            : {}),
        });

        if (result.error) {
          throw new Error(
            `graph-action: specialist "${input.agent_type_key}" failed — ${result.error}`
          );
        }

        // The agent asked the human something. Park the run so the answer can
        // come back as a comment on the task, then resume.
        if (askedQuestion && ctx.workflow) {
          await ctx.workflow.suspend({
            kind: "question",
            payload: { question: askedQuestion },
            request_id: runCtx.requestId,
            title: `${input.agent_type_key} asked a question`,
            ...(runCtx.contextType ? { context_type: runCtx.contextType } : {}),
            ...(runCtx.contextId ? { context_id: runCtx.contextId } : {}),
          });
        }

        // The agent asked for something it may not do. Park the whole graph run
        // here so a human can decide, and carry the calls in the suspend payload
        // — Mastra clears that payload atomically when a resume claims the run,
        // which is what makes the replay single-use.
        if (pending.size > 0 && ctx.workflow) {
          await createWorkflowRunStoreFromEnv()
            ?.setStatus({
              id: runCtx.requestId,
              status: "requires_action",
              tenantId: runCtx.tenantId,
            })
            .catch(() => {
              // best-effort — agent_run status is the authority for the UI
            });
          await ctx.workflow.suspend({
            kind: "operation_approval",
            payload: { pending_calls: [...pending.values()] },
            request_id: runCtx.requestId,
            title: `${input.agent_type_key} needs approval`,
            ...(runCtx.contextType ? { context_type: runCtx.contextType } : {}),
            ...(runCtx.contextId ? { context_id: runCtx.contextId } : {}),
          });
        }

        if (!input.output_schema) {
          return {
            output: { text: result.finalText },
            run_id: childRunId,
            thread_id: threadId,
          };
        }

        const outputSchema = jsonSchemaToZod(input.output_schema);
        const readAnswer = (text: string) => {
          const parsed = extractJsonObject(text);
          return parsed === undefined ? null : outputSchema.safeParse(parsed);
        };
        let validated = readAnswer(result.finalText);
        if (!validated?.success) {
          // After a long run the model forgets the format it was asked for at
          // the start and ends with prose. One short turn on the same thread,
          // without tools, asks for the answer again — the work is in its
          // history, so it only has to write it down.
          const retry = await runDelegatedConversation({
            allowedToolIds: [],
            brief: `Your last message was not the result. Answer now with ONLY the JSON object matching this schema — no prose, no code fence:\n${JSON.stringify(input.output_schema)}`,
            childAgentId: input.agent_type_key,
            childRunId: randomUUID(),
            childThreadId: threadId,
            modelConfig,
            observe: {
              runStore: createAgentRunStoreFromEnv(),
              tenantId: runCtx.tenantId,
            },
            registry,
            ...(runCtx.routineId ? { routineId: runCtx.routineId } : {}),
            scope,
            space,
            store,
          });
          if (!retry.error) {
            validated = readAnswer(retry.finalText);
          }
        }
        if (!validated) {
          throw new Error(
            `graph-action: specialist "${input.agent_type_key}" returned no JSON object for its declared output schema`
          );
        }
        if (!validated.success) {
          // Fail the node rather than let a wrong shape flow downstream — the
          // whole point of declaring output_schema on the node.
          throw new Error(
            `graph-action: specialist "${input.agent_type_key}" output did not match its schema — ${validated.error.issues
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; ")}`
          );
        }
        return {
          output: validated.data,
          run_id: childRunId,
          thread_id: threadId,
        };
      });
    },
  });
}
