// Step 3 of the Task Job — the agent-loop step. Runs the assigned specialist
// headless on the task brief and returns its final text. Reuses the Phase-3
// child-run primitive (runDelegatedConversation): a leaf Harness over the
// dynamically-assembled agent, driven to completion, never throwing — a failure
// comes back as `error` and becomes the `failed` outcome the finalize step acts on.
//
// The run gets the SAME Mastra workspace a chat of this agent would get —
// mounts resolved from its declaration and the containment visibility chain,
// sandbox included when it declares one (`headless-workspace.ts`).
import { createStep } from "@mastra/core/workflows";
import { createAppBuildTools } from "../../../ai/tools/app-build-tool.js";
import { createArtifactTools } from "../../../ai/tools/artifact-tools.js";
import { createTableTools } from "../../../ai/tools/table-tools.js";
import { createTaskSelfTools } from "../../../ai/tools/task-self-tools.js";
import { createDefaultAiRegistry } from "../agents.js";
import { runDelegatedConversation } from "../conversation/delegate-run.js";
import {
  createAgentRunStoreFromEnv,
  createRegistryStoreFromEnv,
  createThreadStoreFromEnv,
} from "../index.js";
import { createDefaultModuleCapabilityLoader } from "../module-capability-loader.js";
import { registerLiveTaskRun } from "../sessions/live-task-run-registry.js";
import {
  actingUserIdFromTask,
  resolveRunSpaceById,
  toolsSpaceFromResolution,
} from "../sessions/run-space.js";
import { createScopeModuleOperationInvoker } from "../sessions/task-workspace-hook.js";
import { resolveTenantDefaultSpaceId } from "../work-scope/resolve-space.js";
import { resolveWorkVisibility } from "../work-scope/resolve-work-visibility.js";
import { resolveGraphRunModelConfig } from "../workflows/model-config.js";
import { buildHeadlessWorkspace } from "./headless-workspace.js";
import { parseTaskBlocked } from "./task-blocked.js";
import {
  resolveEffectiveAgentApprovalMode,
  taskCompletionPolicyDepsFromEnv,
  taskRunGatingPolicy,
} from "./task-completion-policy.js";
import {
  isSkippedEnvelope,
  type PendingApproval,
  taskJobEnvelopeSchema,
} from "./task-job-schema.js";
import { resolveTaskJobServiceScope } from "./task-job-scope.js";

/**
 * How a comment that arrives MID-RUN reads to the specialist.
 *
 * It says "already on the task" for the same reason the brief replays comments
 * rather than restating them: the model must not helpfully post it back as its
 * own progress note. And it says the work is still in progress, because unlike
 * the brief this is not a fresh assignment — the agent is being corrected while
 * it works, which is the whole point of not making the person wait.
 */
export function taskCommentAsTurnInput(content: string): string {
  return [
    "A new comment just landed on this task while you are working on it (it is already saved on the task — do not repeat it back):",
    content.trim(),
    "",
    "Take it into account for the rest of this run. If it changes what you were about to do, change course; if it does not, carry on.",
  ].join("\n");
}

export const runSpecialistStep = createStep({
  id: "run-specialist",
  inputSchema: taskJobEnvelopeSchema,
  outputSchema: taskJobEnvelopeSchema,
  execute: async ({ inputData, runId, abortSignal }) => {
    if (isSkippedEnvelope(inputData)) {
      return inputData;
    }
    // The specialist somebody assigned this work item to — stated once here
    // rather than asserted at each use below.
    const specialistAgentId = inputData.agent_type_key;
    if (!specialistAgentId) {
      throw new Error(
        `task-job: task ${inputData.task_id} has no specialist assigned to run it`
      );
    }
    const store = createThreadStoreFromEnv();
    if (!store) {
      throw new Error("task-job: agent session store is not configured");
    }
    const scope = await resolveTaskJobServiceScope(inputData.tenant_id);
    const registry = createDefaultAiRegistry({
      databaseStore: createRegistryStoreFromEnv(),
      moduleLoader: createDefaultModuleCapabilityLoader(),
      tenantId: inputData.tenant_id,
    });

    // Collect tool-approval requests the specialist hits (deduped by op id).
    // Under "request" the pre-gate consults `approval_grants`, so a pre-approved
    // op runs; a miss lands here and pauses the task for human approval. The
    // recorded `input` is the exact call to replay once after approval —
    // last-wins on repeated asks, since the model's final attempt is its most
    // refined version of the call.
    const pendingByOp = new Map<string, PendingApproval>();

    // Visibility chain from the ONE containment resolver (work-scope/). The
    // task lane exposes it as named mounts: /task, optional /project, then
    // /space for a Space-bound task; /company is read-only for every task.
    const invoke = createScopeModuleOperationInvoker(scope);
    const visibility = await resolveWorkVisibility(
      {
        invoke,
        spaceId: await resolveTenantDefaultSpaceId(inputData.tenant_id),
        tenantId: inputData.tenant_id,
      },
      {
        taskId: inputData.task_id,
        taskIdentifier: inputData.identifier,
      }
    );

    // The task's OWN space narrows this run's tools, the same way the thread's
    // space narrows a chat. The id comes from
    // `resolveWorkVisibility` — a server-side lookup off the task row — so
    // unlike the chat lane there is no client claim to check.
    //
    // A service principal has no space membership, so a private Space 404s
    // at the surface endpoint. That is `unresolved`, never tenant-wide
    // reach. Pass the task id and the task's acting user so core can
    // authorize that already-validated Space; never substitute a
    // client-supplied space id.
    const actingUserId = actingUserIdFromTask(
      ((await invoke("tasks_get", { id: inputData.task_id }).catch(
        () => null
      )) as {
        created_by_user_id?: unknown;
        owner_user_id?: unknown;
        primary_assignee_user_id?: unknown;
      } | null) ?? {}
    );
    const spaceResolution = visibility.spaceId
      ? await resolveRunSpaceById({
          runId,
          scope,
          spaceId: visibility.spaceId,
          taskId: inputData.task_id,
          ...(actingUserId ? { actingUserId } : {}),
        })
      : { kind: "global" as const };

    // The run's trust dial, resolved ONCE from the same layers the completion
    // policy reads (tenant ai.config.agent_approval → space agent_approval_mode
    // → per-agent override, most restrictive wins). It decides how gated tools
    // behave for this whole run:
    // `manual` pre-gates ("request"), `auto`/`pass-all` let core decide
    // ("defer" — medium-risk writes with the space write mount run without a
    // human; high/critical still 202 and park the run). Missing deps fail soft
    // to `manual`, never wider.
    const policyDeps = taskCompletionPolicyDepsFromEnv();
    const approvalMode = policyDeps
      ? await resolveEffectiveAgentApprovalMode(policyDeps, {
          agentTypeKey: specialistAgentId,
          spaceId: visibility.spaceId ?? inputData.space_id ?? null,
          tenantId: inputData.tenant_id,
        })
      : "manual";

    // Same mechanism as the graph lane (run-specialist.ts): a delegated run
    // handed no modelConfig short-circuits to the agent's compiled-in default,
    // bypassing the tenant's bindings and AI settings entirely — so
    // specialists ignored chat_model_id. Each agent then resolves within it
    // by its OWN effort tier, else the chat model. The envelope's `model_id`
    // fills the chain's override slot and wins when set.
    const modelConfig = await resolveGraphRunModelConfig(
      scope,
      inputData.model_id ?? null
    );

    // The task's own channel: comment + ask. Bound to THIS task and mounted
    // regardless of the space, because a run must always be able to report on
    // and ask about the work it was dispatched onto — the space governs which
    // business records it may touch, not whether it can speak. A question ends
    // the run (see `askedQuestion` below), the same shape as an approval miss.
    let askedQuestion: string | null = null;

    // Artifact tools (durable deliverables) ride the run's own thread scope;
    // containment makes them task/project-visible with no promotion step.
    const extraTools = {
      ...createArtifactTools(),
      ...createTableTools(),
      ...createAppBuildTools(),
      ...createTaskSelfTools({
        agentTypeKey: specialistAgentId,
        invoke,
        onQuestion: (question) => {
          askedQuestion ??= question;
        },
        taskId: inputData.task_id,
      }),
    };

    // Calls approved while the previous run of this task was parked (tier-1
    // resume hands them in via the suspend payload). Only calls the fresh
    // grant set now covers are replayed — a denied op stays filtered out and
    // simply gates again if the model retries it.
    const grantSet = new Set(inputData.approval_grants ?? []);
    const approvedResumeCalls = (inputData.approved_resume_calls ?? []).filter(
      (call) => grantSet.has(call.operation_id)
    );

    // The run's files and, when its declaration asks for one, its computer.
    // Built here rather than inside `runDelegatedConversation` because the
    // containment chain is a task-lane fact: the workspace hangs off the work,
    // not off the conversation.
    const headlessWorkspace = await buildHeadlessWorkspace({
      agentId: specialistAgentId,
      registry,
      runId,
      scope,
      spaceResolution,
      threadId: inputData.thread_id ?? `taskjob-${inputData.task_id}`,
      ...(visibility.chain.find((node) => node.tier === "project")?.id
        ? {
            projectId: visibility.chain.find((node) => node.tier === "project")
              ?.id,
          }
        : {}),
      ...(visibility.spaceId ? { spaceId: visibility.spaceId } : {}),
      ...(inputData.identifier ? { taskIdentifier: inputData.identifier } : {}),
    });

    const result = await runDelegatedConversation({
      // Headless task job with a needs-input channel. Under `manual` mode this
      // is "request": pre-gate against the task's grants; an ungranted
      // gated op is reported (not run) and the task pauses until a human
      // approves → re-dispatch. Under `auto`/`pass-all` it is "defer": the
      // pre-gate steps aside and core (which knows the mode and the space's
      // write mounts) decides — its 202 lands in the same onApprovalRequired
      // collector below, so a genuinely gated op still parks identically.
      approvalPolicy: taskRunGatingPolicy(approvalMode),
      approvalGrants: inputData.approval_grants ?? [],
      ...(approvedResumeCalls.length > 0 ? { approvedResumeCalls } : {}),
      onApprovalRequired: (info) => {
        const previous = pendingByOp.get(info.operationId);
        pendingByOp.set(info.operationId, {
          operation_id: info.operationId,
          ...((info.riskLevel ?? previous?.risk_level)
            ? { risk_level: info.riskLevel ?? previous?.risk_level }
            : {}),
          ...((info.title ?? previous?.title)
            ? { title: info.title ?? previous?.title }
            : {}),
          ...((info.input ?? previous?.input)
            ? { input: info.input ?? previous?.input }
            : {}),
        });
      },
      brief: inputData.brief ?? "",
      childAgentId: specialistAgentId,
      childRunId: runId,
      // Run on the registered ai.thread (created at checkout) so memory + the run
      // record share one drillable thread; fall back to a task-derived id.
      childThreadId: inputData.thread_id ?? `taskjob-${inputData.task_id}`,
      // Be reachable while the loop runs, so a comment posted mid-work lands in
      // this turn instead of waiting for the run to end and a fresh dispatch.
      onLiveSession: ({ deliver }) =>
        registerLiveTaskRun({
          deliver: (content) => deliver(taskCommentAsTurnInput(content)),
          runId,
          taskId: inputData.task_id,
        }),
      // Forwarded to core as x-engenty-task-id: task-scoped grants open the
      // gate for this run, and a gated miss files a request that names the
      // task — which is what lets the approval re-dispatch it.
      taskId: inputData.task_id,
      extraTools,
      modelConfig,
      // Persist the run's AG-UI events + usage on `ai.agent_run` so the desk's
      // run detail has a timeline. Without this every headless task run showed
      // "no events recorded" and no tokens — the row existed (task-job-run-
      // record) but nothing ever wrote its stream. `suspendForApproval` stays
      // off: the task lane owns its own parking (pendingByOp below).
      observe: {
        runStore: createAgentRunStoreFromEnv(),
        tenantId: inputData.tenant_id,
      },
      registry,
      scope,
      space: toolsSpaceFromResolution(spaceResolution),
      store,
      ...(abortSignal ? { abortSignal } : {}),
      ...(headlessWorkspace ? { workspace: headlessWorkspace.workspace } : {}),
      ...(headlessWorkspace?.computeInstructions
        ? { extraInstructionBodies: [headlessWorkspace.computeInstructions] }
        : {}),
      ...(headlessWorkspace?.sandboxProvider
        ? { sandboxProvider: headlessWorkspace.sandboxProvider }
        : {}),
    });

    // A hard stream error wins as `failed`. Otherwise, if the specialist was
    // blocked on approval, pause the task (needs_approval takes precedence over
    // a nominal `ran`).
    if (result.error) {
      return { ...inputData, note: result.error, status: "failed" as const };
    }
    if (pendingByOp.size > 0) {
      return {
        ...inputData,
        pending_approvals: [...pendingByOp.values()],
        result_text: result.finalText,
        status: "needs_approval" as const,
      };
    }
    // An unanswered question outranks a nominal `ran`: the agent said it cannot
    // finish, so the task must wait for a person rather than close as done.
    // The question is already ON the task (the tool posted it), so the
    // write-result step has nothing more to say.
    if (askedQuestion) {
      return {
        ...inputData,
        question: askedQuestion,
        result_text: result.finalText,
        status: "needs_input" as const,
      };
    }
    // The other way a run can stop and wait: it needs an answer a human has to
    // give. Approval wins when both happened — the grant is the harder gate.
    const blocked = parseTaskBlocked(result.finalText);
    if (blocked) {
      return {
        ...inputData,
        blocked_question: blocked.question,
        result_text: blocked.cleanedText,
        status: "needs_input" as const,
      };
    }
    return {
      ...inputData,
      result_text: result.finalText,
      status: "ran" as const,
    };
  },
});
