import {
  type AGUIEvent,
  encodeAgUiSseEvent,
  isAgentUiStateSnapshotV1,
  isFrontendToolDefinition,
  isFrontendToolOpenInterrupt,
  type RunAgentInput,
  RunAgentInputSchema,
} from "@engenty/ag-ui-bridge";
import {
  AI_EFFORT_LEVELS,
  type AiEffort,
  type AiEffortChoice,
  type AiUsageStore,
  bindingsFromList,
  checkUsageLimits,
  type DynamicAiModuleCapabilityLoader,
  formatUsageLimitError,
  type ModelBindings,
} from "@engenty/ai-core";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import type { FrontendToolResumeData } from "../../ai/frontend-tools/native-frontend-tool.js";
import type { ToolApprovalResumeData } from "../../ai/tools/engenty-tools/engenty-tool-execute-tool.js";
import {
  isToolApprovalArtifactId,
  parseToolApprovalGrantContext,
  parseToolApprovalOperationId,
  TOOL_APPROVAL_CHOICE_APPROVE_ALWAYS,
  TOOL_APPROVAL_CHOICE_APPROVE_ONCE,
} from "../../ai/tools/engenty-tools/lib/tool-approval.js";
import { buildChatTurnContextEntries } from "../ai/chat-commands.js";
import { startConversationRun } from "../ai/conversation/conversation-run.js";
import { resumeConversationRun } from "../ai/conversation/resume-conversation-run.js";
import { isParkedResumeInFlight } from "../ai/conversation/session-park.js";
import { getEngentyCoreBaseUrlFromEnv } from "../ai/core-http-client.js";
import { filterAgentUiFrontendToolsForScope } from "../ai/frontend-tool-gating/filter-agent-ui-for-scope.js";
import type { AiService } from "../ai/index.js";
import type { AiRegistry } from "../ai/registry/index.js";
import { persistSecretsGoalGrant } from "../ai/secrets-goal-grant.js";
import {
  loadConnectionApprovalGrants,
  mergeApprovalGrants,
} from "../ai/sessions/connection-approval-grants.js";
import {
  type AgUiResumeEntry,
  mergeAgUiOpenInterruptMetadata,
  readAgUiOpenInterrupt,
  resumePayloadToModelContent,
  runInputHasNewUserMessages,
} from "../ai/sessions/interrupts.js";
import { resolveEffortForRun } from "../ai/sessions/resolve-auto-effort.js";
import { resolveToolCallResultInHistory } from "../ai/sessions/resolve-tool-call-history.js";
import {
  getLiveRunEventsSnapshot,
  markRunDone,
  markRunLive,
  subscribeRunEvents,
} from "../ai/sessions/run-event-bus.js";
import { auditToolApprovalDecision } from "../ai/sessions/tool-approval-audit.js";
import {
  clearOnceToolApprovalGrants,
  readToolApprovalGrants,
  withToolApprovalGrant,
  withToolApprovalGrantOnce,
} from "../ai/sessions/tool-approval-grants.js";
import { resolveDecisionResumeChoice } from "../ai/sessions/transcript.js";
import { type AiSessionScope, scopeAccessToken } from "../ai/sessions/types.js";
import { createSkillStorage } from "../ai/skills/skill-storage.js";
import { createEngentyCoreFileStorageClient } from "../ai/workspace/core-file-storage-client.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { AgentRunStore, ThreadStore } from "../dal/threads/index.js";
import {
  latestUserAttachmentParts,
  resolveTieredAttachments,
} from "./attachments/tiered-attachments.js";
import type { AgUiDebugEventBus } from "./copilotkit-debug-events.js";
import {
  type AiScopeResolver,
  handleRouteError,
  resolveScope,
  uuidString,
} from "./http.js";

export {
  isModelFeedableMime,
  latestUserAttachmentParts,
  latestUserAttachments,
  resolveTieredAttachments,
} from "./attachments/tiered-attachments.js";

// AG-UI message content is a string or a parts array ([{ type:"text", text }]).
// Extract plain text — never JSON.stringify, or the user turn persists as raw
// JSON and renders as `[{"type":"text",...}]` in the chat.
function messageContentToText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : ""
      )
      .join("");
  }
  return "";
}

/**
 * Reject an approval resume whose `choice_id` names nothing the server offered.
 *
 * The alternative — treating it as "not approved" — is how this used to fail:
 * silently, in the deny direction, indistinguishable from the user pressing
 * Deny. Approving instead would be far worse. So the only safe answer is to
 * refuse and say which value was not understood.
 */
function unresolvedChoiceResponse(
  // Structural, matching `handleRouteError` — avoids pinning the helper to one
  // Hono generic instantiation.
  c: { json: (object: unknown, status?: number) => Response },
  choiceId: string
) {
  return c.json(
    {
      choice_id: choiceId,
      error: "agent_threads.unresolvedChoice",
      message: `The answered choice "${choiceId}" is not one of this interrupt's choices, and the payload carried no choice_label to fall back on. Send both choice_id and choice_label, or a choice_id matching the interrupt.`,
    },
    400
  );
}

// Map an AG-UI resume entry to the durable frontend tool's resume payload
// (`{ output } | { rejected } | { error }`) the native tool reads on resume.
function toFrontendToolResumeData(
  entry: AgUiResumeEntry | undefined
): FrontendToolResumeData {
  const payload =
    entry?.payload &&
    typeof entry.payload === "object" &&
    !Array.isArray(entry.payload)
      ? (entry.payload as Record<string, unknown>)
      : {};
  // A handler error is a tool FAILURE — surface it (not "User rejected"). Check
  // this BEFORE the rejection signal, since a failed handler also carries
  // approved:false / status:cancelled.
  if (typeof payload.error === "string" && payload.error) {
    return { error: payload.error };
  }
  if (
    entry?.status === "cancelled" ||
    payload.rejected === true ||
    payload.approved === false
  ) {
    return { rejected: true };
  }
  return { output: payload.output ?? { ok: true } };
}

// Latest user-turn text for the durable path. Native memory recalls prior
// history from the thread, so the durable run only needs the current turn.
function latestUserText(input: RunAgentInput): string {
  const messages = Array.isArray(input.messages) ? input.messages : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as { content?: unknown; role?: string };
    if (message?.role === "user") {
      return messageContentToText(message.content);
    }
  }
  return "";
}

// Client-assigned id of the latest user turn — carried into the run event log
// so OTHER windows attached to this run can render the user bubble live (the
// durable message row only lands at the end-of-turn coalescer flush).
function latestUserMessageId(input: RunAgentInput): string | null {
  const messages = Array.isArray(input.messages) ? input.messages : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as { id?: unknown; role?: string };
    if (message?.role === "user") {
      return typeof message.id === "string" && message.id ? message.id : null;
    }
  }
  return null;
}

// Typed @-mention references on the latest user turn (the `engenty_refs`
// carrier part — see `@engenty/ai-ui` chat-reference-part).
export function latestUserReferenceItems(
  input: RunAgentInput
): Array<{ entity?: string; label: string; ref: string }> {
  const messages = Array.isArray(input.messages) ? input.messages : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as { content?: unknown; role?: string };
    if (message?.role !== "user") {
      continue;
    }
    const content = message.content;
    if (!Array.isArray(content)) {
      return [];
    }
    const items: Array<{ entity?: string; label: string; ref: string }> = [];
    for (const part of content) {
      const refs = (
        part as { metadata?: { engenty_refs?: unknown } } | null | undefined
      )?.metadata?.engenty_refs;
      if (!Array.isArray(refs)) {
        continue;
      }
      for (const entry of refs) {
        const item = entry as {
          entity?: unknown;
          label?: unknown;
          ref?: unknown;
        };
        if (typeof item?.ref !== "string" || !item.ref) {
          continue;
        }
        items.push({
          entity: typeof item.entity === "string" ? item.entity : undefined,
          label: typeof item.label === "string" ? item.label : item.ref,
          ref: item.ref,
        });
      }
    }
    return items;
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The user's effort pick (`forwardedProps.engenty.effort`). Travels alongside
 * `model_id` rather than replacing it: an expert / self-hosted install may still
 * pin a model, and that pin keeps precedence.
 *
 * `auto` is a first-class choice: sized per turn via heuristics + (only when
 * ambiguous) a cheap router call — see `resolveEffortForRun`.
 */
function resolveEffortChoice(input: RunAgentInput): AiEffortChoice | null {
  const forwardedProps = isRecord(input.forwardedProps)
    ? input.forwardedProps
    : {};
  if (!isRecord(forwardedProps.engenty)) {
    return null;
  }
  const effort = forwardedProps.engenty.effort;
  if (typeof effort !== "string") {
    return null;
  }
  const value = effort.trim().toLowerCase();
  if (value === "auto") {
    return "auto";
  }
  return (AI_EFFORT_LEVELS as readonly string[]).includes(value)
    ? (value as AiEffort)
    : null;
}

async function loadEffortResolutionContext(params: {
  getUsageStore?: () => AiUsageStore | null;
  tenantId: string;
}): Promise<{
  allowedEfforts: readonly string[] | null;
  bindings: ModelBindings | undefined;
}> {
  const store = params.getUsageStore?.() ?? null;
  if (!store) {
    return { allowedEfforts: null, bindings: undefined };
  }
  let allowedEfforts: readonly string[] | null = null;
  let bindings: ModelBindings | undefined;
  try {
    const policy = await store.getTenantPolicy(params.tenantId);
    allowedEfforts = policy?.allowed_efforts ?? null;
  } catch {
    allowedEfforts = null;
  }
  try {
    const rows = await (
      store as AiUsageStore & {
        listModelBindings?: () => Promise<
          Array<{ gateway: string; model_id: string; role: string }>
        >;
      }
    ).listModelBindings?.();
    if (rows && rows.length > 0) {
      bindings = bindingsFromList(
        rows.map((r) => ({
          gateway: r.gateway,
          modelId: r.model_id,
          role: r.role,
        }))
      );
    }
  } catch {
    bindings = undefined;
  }
  return { allowedEfforts, bindings };
}

function resolveModelIdOverride(input: RunAgentInput): string | null {
  const forwardedProps = isRecord(input.forwardedProps)
    ? input.forwardedProps
    : {};
  if (!isRecord(forwardedProps.engenty)) {
    return null;
  }
  const modelId = forwardedProps.engenty.model_id;
  return typeof modelId === "string" && modelId.trim() ? modelId.trim() : null;
}

function buildAppsAiRunContext(input: RunAgentInput) {
  const frontendTools = input.tools.filter(isFrontendToolDefinition);
  const stateSnapshot = isAgentUiStateSnapshotV1(input.state)
    ? input.state
    : undefined;
  if (!stateSnapshot && frontendTools.length === 0) {
    return null;
  }
  return {
    frontend_tools: frontendTools,
    ...(stateSnapshot ? { state_snapshot: stateSnapshot } : {}),
  };
}

export function registerThreadRunRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    createRegistry?: (scope: AiSessionScope) => AiRegistry;
    /** Core service base URL — used to resolve chat attachment bytes for the model. */
    coreBaseUrl?: string;
    /** Module capabilities — used to resolve the chat slash-command catalog. */
    moduleLoader?: DynamicAiModuleCapabilityLoader;
    getRunStore?: () => AgentRunStore | null;
    getStore?: () => ThreadStore | null;
    getUsageStore?: () => AiUsageStore | null;
    aiService: AiService;
    onThreadPersisted?: (params: {
      threadId: string;
      tenantId: string;
      userId: string;
    }) => Promise<void>;
    scopeResolver: AiScopeResolver;
    debugEvents?: AgUiDebugEventBus;
  }
): void {
  const base = `${AI_BASE_PATH}/v1/threads`;

  app.post(`${base}/:threadId/runs`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }

    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_threads.invalidThreadId" }, 400);
    }
    const body = RunAgentInputSchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!body.success) {
      return c.json({ error: "agent_threads.invalidBody" }, 400);
    }
    if (body.data.threadId !== threadId) {
      return c.json({ error: "agent_threads.threadMismatch" }, 400);
    }
    const resumeEntries = body.data.resume ?? [];
    const isResumeRun = resumeEntries.length > 0;
    if (isResumeRun && runInputHasNewUserMessages(body.data)) {
      return c.json({ error: "agent_threads.resumeWithMessages" }, 400);
    }

    let session;
    try {
      const result = await opts.aiService.threads.getThread({
        scope: scope.scope,
        threadId,
      });
      session = result.thread;
    } catch (err) {
      return handleRouteError(
        c,
        "getSession failed",
        "agent_threads.getFailed",
        err
      );
    }

    // The external chatbot's runtime is RETIRED in the Harness cutover (2026-06-20).
    // TODO: the embedded chatbot needs a new implementation on the Harness (its
    // tool-gating / state-snapshot shape differs from the internal agents). Fail
    // loudly rather than running it on an untested path.
    if (session.agent_id.startsWith("chatbot")) {
      return c.json(
        {
          error: "agent_threads.chatbotRuntimeRetired",
          message:
            "The chatbot runtime was retired in the Harness cutover and needs a new implementation.",
        },
        501
      );
    }

    const runContext = buildAppsAiRunContext(body.data);
    if (session.agent_id.startsWith("chatbot_") && runContext) {
      runContext.state_snapshot = undefined;
      runContext.frontend_tools = runContext.frontend_tools.filter(
        (tool: { metadata?: { engenty?: { owner_module_id?: string } } }) =>
          tool.metadata?.engenty?.owner_module_id === "chatbot"
      );
    }

    const agentUi = runContext
      ? await filterAgentUiFrontendToolsForScope({
          agentUi: runContext,
          tenantId: scope.scope.tenantId,
          accessToken: scopeAccessToken(scope.scope),
        })
      : null;
    const modelIdOverride = resolveModelIdOverride(body.data);
    const effortChoice = resolveEffortChoice(body.data);

    try {
      await opts.aiService.threads.assertNativeMemoryAvailable({
        scope: scope.scope,
        threadId,
      });
    } catch (err) {
      return handleRouteError(
        c,
        "run memory mode preflight failed",
        "agent_threads.runFailed",
        err
      );
    }

    const runId = body.data.runId || crypto.randomUUID();
    const runStore = opts.getRunStore?.() ?? null;

    // Start executor as a detached async task — returns immediately.
    // D1: client disconnect does not abort; only POST /runs/:id/cancel does.
    // Chat runs on the conversation substrate (Mastra Harness `Session`).
    const conversationStore = opts.getStore?.() ?? null;
    const canRunConversation =
      Boolean(opts.createRegistry) && Boolean(conversationStore);
    // A SUSPENDED tool (frontend tool, or the execute tool's approval gate)
    // PARKS the session — its interrupt carries `run_id` and the resume
    // reattaches via respondToToolSuspension, continuing the same run.
    // Decision/feedback interrupts from requestDecision/requestFeedback come
    // from a tool RESULT (no suspend, no run_id) — they re-run with the user's
    // selection nudged in.
    const openInterrupt = canRunConversation
      ? readAgUiOpenInterrupt(session.metadata)
      : null;
    const isParkedApprovalResume =
      isResumeRun &&
      openInterrupt != null &&
      Boolean(openInterrupt.run_id) &&
      isToolApprovalArtifactId(openInterrupt.artifact_id);
    const isParkedResume =
      isResumeRun &&
      openInterrupt != null &&
      Boolean(openInterrupt.run_id) &&
      (isFrontendToolOpenInterrupt(openInterrupt) || isParkedApprovalResume);
    const isArtifactResume =
      isResumeRun &&
      !isParkedResume &&
      openInterrupt != null &&
      (openInterrupt.kind === "decision" || openInterrupt.kind === "feedback");
    // Interactive chat runs the approval gate under the "artifact" policy: a gated
    // op returns the Approve/Deny card as a decision artifact (no Mastra suspend →
    // no run_id → not a parked resume), and the resume RE-RUNS with the persisted
    // grant. This is the same decision-artifact re-run branch, but the resume must
    // also persist the tool-approval grant (mirroring the parked branch's
    // once/always/secrets handling) or the re-run's gate would re-prompt forever.
    const isApprovalArtifactResume =
      isArtifactResume && isToolApprovalArtifactId(openInterrupt?.artifact_id);
    if (canRunConversation && conversationStore && isParkedResume) {
      // The client answered a SPECIFIC interrupt. If it names a different one
      // than the currently open interrupt (a stale card answered after the run
      // already moved on to the NEXT approval — e.g. parallel gated tool calls
      // resolving one at a time), applying the answer to whatever happens to be
      // open would approve an action the user never looked at. Reject instead;
      // the client re-syncs and shows the real card.
      const answeredInterruptId = resumeEntries[0]?.interruptId;
      if (
        answeredInterruptId &&
        openInterrupt?.interrupt_id &&
        answeredInterruptId !== openInterrupt.interrupt_id
      ) {
        return c.json(
          {
            error: "agent_threads.interruptMismatch",
            message:
              "The answered interrupt is no longer the open one; reload the pending approval and answer it.",
            open_interrupt_id: openInterrupt.interrupt_id,
          },
          409
        );
      }
      // A duplicate answer while the previous resume is still executing must
      // not race it (the parked session was already taken; letting this run
      // would surface a bogus "no longer in memory" error and abandon the
      // suspended tools). The in-flight resume will re-park or finish.
      if (
        openInterrupt?.run_id &&
        isParkedResumeInFlight(openInterrupt.run_id)
      ) {
        return c.json(
          {
            error: "agent_threads.resumeInProgress",
            message:
              "A resume for this approval is already in progress; wait for it to finish.",
          },
          409
        );
      }
      markRunLive(runId);
      let resumeData: FrontendToolResumeData | ToolApprovalResumeData =
        toFrontendToolResumeData(resumeEntries[0]);
      // Metadata the resume writes back when it clears the interrupt — must
      // include a grant persisted below, or the write-back would erase it.
      let resumeSessionMetadata = session.metadata;
      if (isParkedApprovalResume) {
        // Tool-approval resume: audit the decision, persist the grant ("once"
        // survives this request's resumes; "always" the whole chat), and hand
        // the suspended execute tool the decision. The gate re-check on
        // re-execution passes via the resume data itself.
        const operationId =
          parseToolApprovalOperationId(openInterrupt?.artifact_id) ?? "";
        const resolution = resumeEntries[0]
          ? resolveDecisionResumeChoice(
              resumeEntries[0],
              openInterrupt?.choices
            )
          : ({ kind: "absent" } as const);
        if (resolution.kind === "unresolved") {
          return unresolvedChoiceResponse(c, resolution.choiceId);
        }
        const choice =
          resolution.kind === "choice" ? resolution.choiceId : undefined;
        const always = choice === TOOL_APPROVAL_CHOICE_APPROVE_ALWAYS;
        const once = choice === TOOL_APPROVAL_CHOICE_APPROVE_ONCE;
        auditToolApprovalDecision({
          decision: always ? "approve_always" : once ? "approve_once" : "deny",
          operationId,
          tenantId: scope.scope.tenantId,
          threadId,
          userId: scope.scope.userId,
        });
        if (once || always) {
          resumeSessionMetadata = always
            ? withToolApprovalGrant(session.metadata, operationId)
            : withToolApprovalGrantOnce(session.metadata, operationId);
          try {
            await conversationStore.updateThreadForUser({
              metadata: resumeSessionMetadata,
              tenantId: scope.scope.tenantId,
              threadId,
              userId: scope.scope.userId,
            });
          } catch (err) {
            console.error("conversation approval grant persist failed", err);
          }
          // Approving an agent's secret reveal also persists the durable
          // goal-scoped grant in core (goal = this conversation thread). Must
          // land BEFORE the resume re-invokes, or core re-gates the reveal.
          const grantContext = parseToolApprovalGrantContext(
            openInterrupt?.artifact_id
          );
          if (operationId === "secrets_reveal" && grantContext) {
            await persistSecretsGoalGrant({
              coreBaseUrl: opts.coreBaseUrl,
              goalId: threadId,
              secretId: grantContext.secret_id,
              accessToken: scopeAccessToken(scope.scope),
            });
          }
        }
        resumeData = {
          approved: once || always,
          ...(choice ? { choice_id: choice } : {}),
        };
      }
      void resumeConversationRun({
        agentId: session.agent_id,
        // Snapshot lane only: a re-assembled agent has no browser tools unless
        // this resume re-declares them (the parked lane's Session still holds them).
        agentUi,
        // Only used if the in-process park is gone: they let the resume
        // re-assemble the agent and continue from the stored snapshot.
        mastra: opts.aiService.mastra,
        newRunId: runId,
        ...(opts.createRegistry
          ? { registry: opts.createRegistry(scope.scope) }
          : {}),
        resolvedToolCallId: openInterrupt?.tool_call_id ?? "",
        resumeData,
        runStore,
        scope: scope.scope,
        sessionMetadata: resumeSessionMetadata,
        store: conversationStore,
        suspendedRunId: openInterrupt?.run_id ?? "",
        threadId,
      }).catch((err) => {
        console.error("conversation resume failed", err);
      });
    } else if (
      canRunConversation &&
      conversationStore &&
      opts.createRegistry &&
      (!isResumeRun || isArtifactResume)
    ) {
      // Conversation run: drive the run on Mastra's Harness `Session`. AG-UI
      // events flow to the same run-event-bus; the SSE block below is unchanged.
      // A decision/feedback resume re-runs here with the selection nudged in.
      markRunLive(runId);
      let hsSessionMetadata = session.metadata;
      let hsPrompt = latestUserText(body.data);
      // Operation ids approved earlier in this chat — the execute-boundary gate
      // skips them. A fresh "Approve" on this resume is folded in below.
      let hsApprovalGrants = readToolApprovalGrants(session.metadata);
      if (isApprovalArtifactResume) {
        // Tool-approval re-run (interactive HITL): audit the decision and, on
        // approval, persist the grant — "once" survives this request's resume
        // runs, "always" the whole chat — so the re-executed pre-gate lets the op
        // run. The grant (not a nudged selection) drives the continuation; a short
        // proceed/deny note steers the model. Mirrors the parked-approval branch.
        // Approve exactly the op the user answered: the answered interrupt id IS
        // the artifact id (buildToolApprovalArtifact sets interrupt_id = artifact_id).
        // The artifact branch has no answered-vs-open mismatch guard, so keying off
        // the answered id — not whatever is currently open — avoids granting the
        // wrong op if a stale card is answered after the run moved on.
        const answeredArtifactId =
          resumeEntries[0]?.interruptId ?? openInterrupt?.artifact_id;
        const operationId =
          parseToolApprovalOperationId(answeredArtifactId) ?? "";
        // Choices come from the OPEN interrupt; when a stale card is answered
        // (answered id != open id) there are none to match against, so an
        // id-only payload lands in `unresolved` and is rejected rather than
        // guessed at — which is the correct outcome for a stale answer anyway.
        const resolution = resumeEntries[0]
          ? resolveDecisionResumeChoice(
              resumeEntries[0],
              openInterrupt?.choices
            )
          : ({ kind: "absent" } as const);
        if (resolution.kind === "unresolved") {
          return unresolvedChoiceResponse(c, resolution.choiceId);
        }
        const choice =
          resolution.kind === "choice" ? resolution.choiceId : undefined;
        const always = choice === TOOL_APPROVAL_CHOICE_APPROVE_ALWAYS;
        const once = choice === TOOL_APPROVAL_CHOICE_APPROVE_ONCE;
        auditToolApprovalDecision({
          decision: always ? "approve_always" : once ? "approve_once" : "deny",
          operationId,
          tenantId: scope.scope.tenantId,
          threadId,
          userId: scope.scope.userId,
        });
        if (once || always) {
          hsSessionMetadata = always
            ? withToolApprovalGrant(hsSessionMetadata, operationId)
            : withToolApprovalGrantOnce(hsSessionMetadata, operationId);
          // Approving an agent's secret reveal also persists the durable
          // goal-scoped grant in core (goal = this conversation thread), or core
          // re-gates the reveal on the re-run's agent-forwarded invoke.
          const grantContext =
            parseToolApprovalGrantContext(answeredArtifactId);
          if (operationId === "secrets_reveal" && grantContext) {
            await persistSecretsGoalGrant({
              coreBaseUrl: opts.coreBaseUrl,
              goalId: threadId,
              secretId: grantContext.secret_id,
              accessToken: scopeAccessToken(scope.scope),
            });
          }
        }
        // The gate already returned the Approve/Deny card as this tool call's
        // result; mark it resolved so the model reads a completed interaction and
        // does not re-emit the same card, then steer the continuation.
        await resolveToolCallResultInHistory({
          result: { approved: once || always, operation_id: operationId },
          scope: scope.scope,
          store: conversationStore,
          threadId,
          toolCallId: openInterrupt?.tool_call_id ?? "",
        });
        hsPrompt =
          once || always
            ? `Approved: you may now run "${operationId}". Proceed with the operation.`
            : `The user denied "${operationId}". Do not run it; continue without that operation.`;
        hsSessionMetadata = mergeAgUiOpenInterruptMetadata(
          hsSessionMetadata,
          null
        );
        try {
          await conversationStore.updateThreadForUser({
            metadata: hsSessionMetadata,
            tenantId: scope.scope.tenantId,
            threadId,
            userId: scope.scope.userId,
          });
        } catch (err) {
          console.error("conversation approval grant persist failed", err);
        }
        // Fold the just-granted op into the grants the re-run's gate consults.
        hsApprovalGrants = readToolApprovalGrants(hsSessionMetadata);
      } else if (isArtifactResume) {
        hsPrompt = resumePayloadToModelContent(resumeEntries[0]!);
        // Mark the resolved decision/feedback tool call ANSWERED in history (write the
        // user's selection as its result) so the model sees a completed interaction
        // and stops re-emitting the same interrupt on every later turn.
        await resolveToolCallResultInHistory({
          result: { resolved: true, response: hsPrompt },
          scope: scope.scope,
          store: conversationStore,
          threadId,
          toolCallId: openInterrupt?.tool_call_id ?? "",
        });
        hsSessionMetadata = mergeAgUiOpenInterruptMetadata(
          hsSessionMetadata,
          null
        );
        try {
          await conversationStore.updateThreadForUser({
            metadata: hsSessionMetadata,
            tenantId: scope.scope.tenantId,
            threadId,
            userId: scope.scope.userId,
          });
        } catch (err) {
          console.error("conversation clear interrupt failed", err);
        }
      } else if (!isResumeRun) {
        // Fresh user turn: drop any "approve once" grants (they are valid only for
        // the request that created them) and clear a stale open interrupt the user
        // moved past without answering. Only write when something actually changes.
        const reset = clearOnceToolApprovalGrants(
          mergeAgUiOpenInterruptMetadata(hsSessionMetadata, null)
        );
        const changed =
          Boolean(openInterrupt) ||
          readToolApprovalGrants(reset).length !==
            readToolApprovalGrants(hsSessionMetadata).length;
        if (changed) {
          hsSessionMetadata = reset;
          hsApprovalGrants = readToolApprovalGrants(hsSessionMetadata);
          try {
            await conversationStore.updateThreadForUser({
              metadata: hsSessionMetadata,
              tenantId: scope.scope.tenantId,
              threadId,
              userId: scope.scope.userId,
            });
          } catch (err) {
            console.error("conversation fresh-turn reset failed", err);
          }
        }
      }
      // Workspace prep and Auto effort sizing overlap: heuristics are instant,
      // and the rare cheap-router call shares wall-clock with workspace IO.
      let hsWorkspaces: Awaited<
        ReturnType<typeof opts.aiService.threads.resolveRunWorkspaces>
      > = {};
      let effort: AiEffort | null = null;
      let autoEffortResolved: {
        effort: AiEffort;
        reason?: string;
        source?: string;
      } | null = null;
      const workspacesPromise = opts.aiService.threads
        .resolveRunWorkspaces({
          runId,
          scope: scope.scope,
          session,
          threadId,
        })
        .catch((err) => {
          console.error("conversation workspace resolution failed", err);
          return {} as Awaited<
            ReturnType<typeof opts.aiService.threads.resolveRunWorkspaces>
          >;
        });
      const effortPromise = (async (): Promise<{
        autoResolved: {
          effort: AiEffort;
          reason?: string;
          source?: string;
        } | null;
        effort: AiEffort | null;
      }> => {
        try {
          const effortCtx = await loadEffortResolutionContext({
            getUsageStore: opts.getUsageStore,
            tenantId: scope.scope.tenantId,
          });
          const resolved = await resolveEffortForRun({
            agentId: session.agent_id,
            allowedEfforts: effortCtx.allowedEfforts,
            bindings: effortCtx.bindings,
            choice: effortChoice,
            hasAttachments: latestUserAttachmentParts(body.data).length > 0,
            modelIdOverride,
            text: latestUserText(body.data),
          });
          const autoResolved =
            resolved.autoResolved && resolved.effort
              ? {
                  effort: resolved.effort,
                  ...(resolved.reason ? { reason: resolved.reason } : {}),
                  ...(resolved.source ? { source: resolved.source } : {}),
                }
              : null;
          return { autoResolved, effort: resolved.effort };
        } catch (err) {
          console.error("conversation auto-effort resolution failed", err);
          if (
            effortChoice === "low" ||
            effortChoice === "medium" ||
            effortChoice === "high"
          ) {
            return { autoResolved: null, effort: effortChoice };
          }
          return { autoResolved: null, effort: null };
        }
      })();
      {
        const [workspaces, effortResult] = await Promise.all([
          workspacesPromise,
          effortPromise,
        ]);
        hsWorkspaces = workspaces;
        effort = effortResult.effort;
        autoEffortResolved = effortResult.autoResolved;
      }
      let hsModelConfig: Awaited<
        ReturnType<typeof opts.aiService.threads.resolveRunModelConfig>
      > | null = null;
      try {
        hsModelConfig = await opts.aiService.threads.resolveRunModelConfig({
          agentId: session.agent_id,
          effort,
          modelIdOverride,
          scope: scope.scope,
        });
      } catch (err) {
        console.error("conversation model config resolution failed", err);
      }
      // Usage-limit + model-allow-list preflight. The streaming chat path must
      // REJECT over-limit runs, not just meter them post-hoc (parity with the
      // non-streaming sessions.generate() preflight). Resumes of an already
      // suspended run are intentionally not re-gated — denying a pending
      // approval mid-run would strand the interrupt.
      const usagePreflight = await checkUsageLimits({
        agent_budget_cost_micros: hsModelConfig?.agentBudgetCostMicros ?? null,
        agent_id: session.agent_id,
        feature: "copilot",
        model_id: hsModelConfig?.modelId ?? modelIdOverride ?? "",
        store: opts.getUsageStore?.() ?? null,
        tenant_id: scope.scope.tenantId,
        user_id: scope.scope.userId,
      });
      if (!usagePreflight.allowed) {
        // Not yet started: thread status is still idle, only the liveness
        // marker set at branch entry needs clearing.
        markRunDone(runId);
        // `error` must carry the harness error code so the AG-UI client maps
        // this to friendly copy (mirrors the non-streaming preflight below,
        // which wraps the same helper in an AiSessionError for that reason).
        return c.json(
          {
            error: "agent_threads.usageLimitExceeded",
            ...formatUsageLimitError(usagePreflight),
          },
          429
        );
      }
      // Durable connection-level "always allow" grants (Settings → Connections)
      // merge with this chat's session grants; both feed the same pre-gate.
      const hsConnectionGrants = await loadConnectionApprovalGrants({
        accessToken: scopeAccessToken(scope.scope),
      });
      // Tiered attachments: images/PDFs → multimodal files; small text/CSV →
      // run context (≤32KiB); larger/binary → manifest + agent-file_analyst.
      // Artifact resume carries no new user message, so there is nothing to resolve.
      const hsTieredAttachments = isArtifactResume
        ? { contextEntries: [], modelAttachments: [] }
        : await resolveTieredAttachments({
            coreBaseUrl: opts.coreBaseUrl,
            input: body.data,
            accessToken: scopeAccessToken(scope.scope),
          });
      // Durable transcript parts for this turn (persisted so attachments render
      // on reload); empty on an artifact resume (no new user message).
      const hsAttachmentParts = isArtifactResume
        ? []
        : latestUserAttachmentParts(body.data);
      // Slash-command / skill expansion + typed @-mention references + attachment
      // manifest/inline text ride the run context — raw user text stays untouched.
      const hsCoreBaseUrl = getEngentyCoreBaseUrlFromEnv();
      const hsUserAccessToken = scopeAccessToken(scope.scope)?.trim();
      const hsSkillStorage =
        hsCoreBaseUrl && hsUserAccessToken
          ? createSkillStorage({
              storage: createEngentyCoreFileStorageClient({
                coreBaseUrl: hsCoreBaseUrl,
                accessToken: hsUserAccessToken,
              }),
              tenantId: scope.scope.tenantId,
            })
          : null;
      const hsChatContextEntries =
        isArtifactResume || isResumeRun
          ? []
          : [
              ...(await buildChatTurnContextEntries({
                agentId: session.agent_id,
                moduleLoader: opts.moduleLoader,
                prompt: hsPrompt,
                refs: latestUserReferenceItems(body.data),
                skillStorage: hsSkillStorage,
              })),
              ...hsTieredAttachments.contextEntries,
            ];
      const autoEffortForRun = autoEffortResolved
        ? {
            ...autoEffortResolved,
            modelId: hsModelConfig?.modelId ?? modelIdOverride ?? null,
          }
        : null;
      void startConversationRun({
        agentId: session.agent_id,
        agentUi: agentUi ?? null,
        attachments: hsTieredAttachments.modelAttachments,
        attachmentParts: hsAttachmentParts,
        approvalGrants: mergeApprovalGrants(
          hsApprovalGrants,
          hsConnectionGrants
        ),
        ...(autoEffortForRun ? { autoEffortResolved: autoEffortForRun } : {}),
        mastra: opts.aiService.mastra,
        modelConfig: hsModelConfig?.modelConfig ?? null,
        modelId: hsModelConfig?.modelId ?? modelIdOverride,
        prompt: hsPrompt,
        registry: opts.createRegistry(scope.scope),
        // Phase 3 — child-run delegation: resolve each delegated agent's own
        // workspace + sandbox on demand (keyed by the child run's own thread).
        resolveChildWorkspace: (child) =>
          opts.aiService.threads.resolveAgentWorkspaceForRun({
            agentId: child.agentId,
            runId: child.runId,
            scope: scope.scope,
            session,
            threadId: child.threadId,
          }),
        routeContext: session.route_context,
        runContext:
          hsChatContextEntries.length > 0
            ? [...(body.data.context ?? []), ...hsChatContextEntries]
            : body.data.context,
        runId,
        runStore,
        scope: scope.scope,
        sessionMetadata: hsSessionMetadata,
        store: conversationStore,
        userMessageId: latestUserMessageId(body.data),
        threadId,
        usageStore: opts.getUsageStore?.() ?? null,
        ...(hsWorkspaces.sandboxProvider
          ? { sandboxProvider: hsWorkspaces.sandboxProvider }
          : {}),
        ...(hsWorkspaces.workspace
          ? { workspace: hsWorkspaces.workspace }
          : {}),
      }).catch((err) => {
        console.error("conversation run failed", err);
      });
    } else {
      // Chat runs on the single conversation substrate; reaching here means a
      // prerequisite (registry/store) is missing.
      return handleRouteError(
        c,
        "no runtime matched this run",
        "agent_threads.runFailed",
        new Error(
          `Run ${runId}: conversation executor prerequisites missing (registry/store)`
        )
      );
    }

    // Respond with SSE stream attached to the bus (since=-1 = all events from start).
    const encoder = new TextEncoder();
    const clientSignal = c.req.raw.signal;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const write = (event: AGUIEvent) => {
          if (closed) {
            return;
          }
          opts.debugEvents?.publish(event);
          try {
            controller.enqueue(encoder.encode(encodeAgUiSseEvent(event)));
          } catch {
            closed = true;
          }
        };
        const close = () => {
          if (closed) {
            return;
          }
          closed = true;
          controller.close();
        };
        // Client disconnect only closes THIS SSE stream; run continues.
        clientSignal.addEventListener("abort", close, { once: true });

        void (async () => {
          // Subscribe AND snapshot the live buffer in the same tick — the
          // buffer is written at publish time, so together they cover every
          // event with no seam (persistence lags publish; a DB replay after
          // subscribing can miss events committed late — see agent-run-routes).
          const buffered: Array<{ event: AGUIEvent; seq: number }> = [];
          const unsub = subscribeRunEvents(runId, (e) => {
            buffered.push(e);
          });
          const liveSnapshot = getLiveRunEventsSnapshot(runId);
          const finishEvents = new Set(["RUN_FINISHED", "RUN_ERROR"]);
          try {
            let lastSeq = -1;
            let sawFinish = false;
            const writeSeq = (event: AGUIEvent, seq: number) => {
              if (seq <= lastSeq) {
                return;
              }
              write(event);
              lastSeq = seq;
              if (finishEvents.has((event as { type: string }).type)) {
                sawFinish = true;
              }
            };

            if (!liveSnapshot) {
              // Run finished before we could attach — replay persisted only.
              const persisted = runStore
                ? await runStore.listRunEvents({
                    tenantId: scope.scope.tenantId,
                    runId,
                    sinceSeq: -1,
                  })
                : [];
              for (const row of persisted) {
                writeSeq(row.payload as AGUIEvent, row.seq);
              }
              unsub();
              close();
              return;
            }

            if (liveSnapshot.truncatedBeforeSeq > -1 && runStore) {
              const bufferStartSeq =
                liveSnapshot.events[0]?.seq ?? Number.POSITIVE_INFINITY;
              const persisted = await runStore.listRunEvents({
                tenantId: scope.scope.tenantId,
                runId,
                sinceSeq: -1,
              });
              for (const row of persisted) {
                if (row.seq >= bufferStartSeq) {
                  break;
                }
                writeSeq(row.payload as AGUIEvent, row.seq);
              }
            }
            for (const e of liveSnapshot.events) {
              writeSeq(e.event, e.seq);
            }

            unsub();
            const directUnsub = subscribeRunEvents(runId, (e) => {
              writeSeq(e.event, e.seq);
              if (sawFinish) {
                directUnsub();
                close();
              }
            });
            for (const e of buffered) {
              writeSeq(e.event, e.seq);
            }
            if (sawFinish) {
              directUnsub();
              close();
            }
          } catch {
            unsub();
            close();
          }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream",
      },
    });
  });
}
