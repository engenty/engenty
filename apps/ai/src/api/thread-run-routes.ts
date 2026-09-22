import {
  type AGUIEvent,
  EventType,
  encodeAgUiSseEvent,
  isFrontendToolDefinition,
  isFrontendToolOpenInterrupt,
  type RunAgentInput,
  RunAgentInputSchema,
  readAgentUiStateSnapshot,
  readRunRouteContext,
} from "@engenty/ag-ui-bridge";
import {
  AI_EFFORT_LEVELS,
  type AiEffort,
  type AiEffortChoice,
  type AiUsageStore,
  agentDefaultEffort,
  checkUsageLimits,
  type DynamicAiModuleCapabilityLoader,
  formatUsageLimitError,
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
import { persistCoreApprovalDecision } from "../ai/approval-decision.js";
import { buildChatTurnContextEntries } from "../ai/chat-commands.js";
import { startConversationRun } from "../ai/conversation/conversation-run.js";
import { isResumeInFlight } from "../ai/conversation/resume-claims.js";
import { resumeConversationRun } from "../ai/conversation/resume-conversation-run.js";
import { getEngentyCoreBaseUrlFromEnv } from "../ai/core-http-client.js";
import { filterAgentUiFrontendToolsForScope } from "../ai/frontend-tool-gating/filter-agent-ui-for-scope.js";
import type { AiService } from "../ai/index.js";
import type { AiRegistry } from "../ai/registry/index.js";
import { noteHumanTurnInRoom } from "../ai/rooms/deliver.js";
import { persistSecretsGoalGrant } from "../ai/secrets-goal-grant.js";
import { steerActiveThreadRun } from "../ai/sessions/active-thread-runs.js";
import {
  loadConnectionApprovalGrants,
  mergeApprovalGrants,
} from "../ai/sessions/connection-approval-grants.js";
import {
  AG_UI_OPEN_INTERRUPT_METADATA_KEY,
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
  TOOL_APPROVAL_GRANTS_METADATA_KEY,
  TOOL_APPROVAL_GRANTS_ONCE_METADATA_KEY,
  withToolApprovalGrant,
  withToolApprovalGrantOnce,
} from "../ai/sessions/tool-approval-grants.js";
import { resolveDecisionResumeChoice } from "../ai/sessions/transcript.js";
import { type AiSessionScope, scopeAccessToken } from "../ai/sessions/types.js";
import { createSkillStorage } from "../ai/skills/skill-storage.js";
import { createEngentyCoreFileStorageClient } from "../ai/workspace/core-file-storage-client.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { AgentRunStore, ThreadStore } from "../dal/threads/index.js";
import { resolveThreadInterruptNotifications } from "../notifications/thread-interrupts.js";
import {
  latestUserAttachmentParts,
  resolveTieredAttachments,
} from "./attachments/tiered-attachments.js";
import { invokeChatAction } from "./chat-action-invocation.js";
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
 * Refuse and name the value. Do NOT fall back to "not approved": that denies
 * silently and indistinguishably from the user pressing Deny. Falling back to
 * approved would be far worse.
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
  if (payload.output !== undefined) {
    return { output: payload.output as FrontendToolResumeData["output"] };
  }
  // AG-UI types `ResumeEntry.payload` as `any` — nesting the result under
  // `output` is OUR convention, and one an external client cannot guess. Falling
  // straight through to `{ok:true}` discarded their data SILENTLY: the tool
  // reported success with nothing in it and the model confabulated around the
  // hole ("location access returned successfully, but no latitude or longitude
  // was provided"). A payload that carries no envelope key IS the output.
  if (Object.keys(payload).length > 0) {
    return { output: payload as FrontendToolResumeData["output"] };
  }
  return { output: { ok: true } };
}

/**
 * The user's chooser answer, in the shape the suspended `requestDecision` tool
 * resumes with. Must NOT go through `toFrontendToolResumeData` — that maps any
 * payload to `{output:{ok:true}}`, which would silently discard the choice and
 * hand the model a successful-but-empty answer.
 */
function toDecisionResumeData(
  entry: AgUiResumeEntry | undefined
): Record<string, unknown> {
  if (entry?.status === "cancelled") {
    return { cancelled: true };
  }
  const payload =
    entry?.payload &&
    typeof entry.payload === "object" &&
    !Array.isArray(entry.payload)
      ? (entry.payload as Record<string, unknown>)
      : {};
  const text =
    typeof payload.text === "string"
      ? payload.text
      : typeof payload.answer === "string"
        ? payload.answer
        : undefined;
  return {
    ...(typeof payload.choice_id === "string"
      ? { choice_id: payload.choice_id }
      : {}),
    ...(typeof payload.choice_label === "string"
      ? { choice_label: payload.choice_label }
      : {}),
    ...(Array.isArray(payload.choices) ? { choices: payload.choices } : {}),
    ...(text ? { text } : {}),
  };
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

/**
 * Is this event the run echoing back the user turn the CALLER just sent?
 *
 * The run emits the user's message as a role:"user" TEXT_MESSAGE_* triple under
 * the id the client assigned, so other windows on the same run can render the
 * bubble before the end-of-turn coalescer flush. The client that SENT it must
 * not receive it: AG-UI's TEXT_MESSAGE_START means "begin a new message", so a
 * spec-compliant client that already holds the id appends instead of replacing
 * and the user's own text is doubled. Verified against a stock @ag-ui/client
 * HttpAgent.
 *
 * Only the ORIGINATING stream filters on this. The echo stays in the durable
 * log so `?since=` replays still carry it.
 */
export function isUserTurnEchoFor(
  event: AGUIEvent,
  ownUserMessageId: string | null
): boolean {
  if (!ownUserMessageId) {
    return false;
  }
  const candidate = event as { messageId?: unknown; type?: string };
  if (candidate.messageId !== ownUserMessageId) {
    return false;
  }
  return (
    candidate.type === EventType.TEXT_MESSAGE_START ||
    candidate.type === EventType.TEXT_MESSAGE_CONTENT ||
    candidate.type === EventType.TEXT_MESSAGE_END
  );
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
}): Promise<{ allowedEfforts: readonly string[] | null }> {
  const store = params.getUsageStore?.() ?? null;
  if (!store) {
    return { allowedEfforts: null };
  }
  try {
    const policy = await store.getTenantPolicy(params.tenantId);
    return { allowedEfforts: policy?.allowed_efforts ?? null };
  } catch {
    return { allowedEfforts: null };
  }
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
  // From `forwardedProps.engenty.ui_state`, not `RunAgentInput.state` — AG-UI's
  // `state` is durable shared state, and our snapshot is transient UI context.
  // See readAgentUiStateSnapshot in @engenty/ag-ui-bridge.
  const stateSnapshot = readAgentUiStateSnapshot(input.forwardedProps);
  if (!stateSnapshot && frontendTools.length === 0) {
    return null;
  }
  return {
    frontend_tools: frontendTools,
    ...(stateSnapshot ? { state_snapshot: stateSnapshot } : {}),
  };
}

/**
 * The run a steered message "is": started and finished at once, carrying
 * the id of the run the words went into. A stock AG-UI client renders
 * nothing for it; the answer arrives on the run that was already streaming.
 */
function readSteerOnly(input: { forwardedProps?: unknown }): boolean {
  const forwardedProps = isRecord(input.forwardedProps)
    ? input.forwardedProps
    : {};
  return (
    isRecord(forwardedProps.engenty) &&
    forwardedProps.engenty.steer_only === true
  );
}

function steeredRunResponse(input: {
  intoRunId: string;
  runId: string;
  threadId: string;
}): Response {
  const encoder = new TextEncoder();
  const events = [
    {
      runId: input.runId,
      threadId: input.threadId,
      type: EventType.RUN_STARTED,
    },
    {
      name: "engenty.steered",
      type: EventType.CUSTOM,
      value: { run_id: input.intoRunId },
    },
    {
      runId: input.runId,
      threadId: input.threadId,
      type: EventType.RUN_FINISHED,
    },
  ] as unknown as AGUIEvent[];
  const stream = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(encodeAgUiSseEvent(event)));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "text/event-stream",
    },
  });
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
    // A resume carries its answer in `resume`, never in `messages`. In AG-UI
    // `messages` is ACCUMULATED agent state, so a conforming client re-sends the
    // original user turn on every resume. Rejecting those messages would make us
    // unresumable by any stock AG-UI client — it only appears to work when the
    // client trims the array itself, as ours does. They are ignored instead: a
    // resume skips the startConversationRun block entirely (see the
    // `!isResumeRun || isArtifactResume` gate below) and reads no messages at
    // all. The artifact-resume path does read them, in two places, and both now
    // ignore them on a resume — a resume has no new turn to size or echo.
    //
    // Warn rather than reject: if a genuinely ambiguous case (a user typing a new
    // turn WHILE a run is suspended) ever shows up, this is the evidence to
    // design the real check on, instead of guessing at one now.
    if (isResumeRun && runInputHasNewUserMessages(body.data)) {
      console.warn(
        "resume run carries user messages; ignoring them (the resume payload is the answer)",
        { runId: body.data.runId, threadId }
      );
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
    // `requestDecision` now suspends natively, so its interrupt carries a
    // `run_id` and resumes the parked run in place — the user's choice is handed
    // to the suspended tool and becomes its result. A decision interrupt WITHOUT
    // a run_id is still the artifact shape (tool-approval cards, and headless
    // runs that cannot suspend) and keeps the re-run path below.
    const isParkedDecisionResume =
      isResumeRun &&
      openInterrupt != null &&
      Boolean(openInterrupt.run_id) &&
      openInterrupt.kind === "decision" &&
      !isToolApprovalArtifactId(openInterrupt.artifact_id);
    const isParkedResume =
      isResumeRun &&
      openInterrupt != null &&
      Boolean(openInterrupt.run_id) &&
      (isFrontendToolOpenInterrupt(openInterrupt) ||
        isParkedApprovalResume ||
        isParkedDecisionResume);
    const isArtifactResume =
      isResumeRun &&
      !isParkedResume &&
      openInterrupt != null &&
      (openInterrupt.kind === "decision" || openInterrupt.kind === "feedback");
    // The answer is the resolution: whoever answered this card closed the
    // ask for everyone, whatever the run does next (finish, re-park on the
    // next gate under the same interrupt id, fail). Resolved here, before any
    // branch, so a resume that parks again never leaves the row open.
    if (isResumeRun && openInterrupt?.interrupt_id) {
      await resolveThreadInterruptNotifications({
        interruptId: openInterrupt.interrupt_id,
        outcome: "resumed",
        tenantId: scope.scope.tenantId,
      });
    }
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
      // A duplicate answer while the previous resume is still executing must not
      // race it: both would resolve the same suspension and both would tear down
      // the one session-scoped sandbox.
      if (openInterrupt?.run_id && isResumeInFlight(openInterrupt.run_id)) {
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
      let resumeData:
        | FrontendToolResumeData
        | ToolApprovalResumeData
        | Record<string, unknown> = isParkedDecisionResume
        ? {
            ...toDecisionResumeData(resumeEntries[0]),
            // The SERVER-persisted artifact id, not the client payload's: a
            // suspended tool that acts on its answer (workflow_propose publishes
            // the version its card named) must trust only what this route
            // validated as the open interrupt.
            ...(openInterrupt?.artifact_id
              ? { artifact_id: openInterrupt.artifact_id }
              : {}),
          }
        : toFrontendToolResumeData(resumeEntries[0]);
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
        // A bulk pre-approval card (engenty_tools_preapprove) covers several
        // operations — the full set rides the artifact id's grant context, and
        // ONE approve persists a grant for each. Single-op cards carry none;
        // the primary operation id alone is granted.
        const grantContext = parseToolApprovalGrantContext(
          openInterrupt?.artifact_id
        );
        const grantOperationIds = Array.from(
          new Set(
            [operationId, ...(grantContext?.operation_ids ?? [])].filter(
              Boolean
            )
          )
        );
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
          ...(grantOperationIds.length > 1
            ? { operationIds: grantOperationIds }
            : {}),
          tenantId: scope.scope.tenantId,
          threadId,
          userId: scope.scope.userId,
        });
        if (once || always) {
          // The local copy feeds this request's in-process gate re-check; the
          // DB write unions just these grants, so a grant added concurrently
          // (or Mastra's own metadata) is not reverted by a whole-blob write.
          resumeSessionMetadata = grantOperationIds.reduce(
            (metadata, id) =>
              always
                ? withToolApprovalGrant(metadata, id)
                : withToolApprovalGrantOnce(metadata, id),
            session.metadata as Record<string, unknown>
          );
          try {
            await conversationStore.mergeThreadMetadataForUser({
              appendSets: {
                [always
                  ? TOOL_APPROVAL_GRANTS_METADATA_KEY
                  : TOOL_APPROVAL_GRANTS_ONCE_METADATA_KEY]: grantOperationIds,
              },
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
          if (operationId === "secrets_reveal" && grantContext?.secret_id) {
            await persistSecretsGoalGrant({
              coreBaseUrl: opts.coreBaseUrl,
              goalId: threadId,
              secretId: grantContext.secret_id,
              accessToken: scopeAccessToken(scope.scope),
            });
          }
        }
        // Card raised by core's 202: relay the answer to the request core
        // filed. Approve, or the re-run's agent-forwarded invoke hits the same
        // policy and the user's approval buys nothing; deny, or the request
        // outlives its answer in the tenant's queue. Outside the grant branch
        // above precisely because it also covers deny, and must land BEFORE
        // the resume re-invokes.
        if (grantContext?.approval_request_id) {
          await persistCoreApprovalDecision({
            accessToken: scopeAccessToken(scope.scope),
            approvalRequestId: grantContext.approval_request_id,
            coreBaseUrl: opts.coreBaseUrl,
            decision: always ? "always" : once ? "once" : "deny",
            subjectId: threadId,
          });
        }
        resumeData = {
          approved: once || always,
          ...(choice ? { choice_id: choice } : {}),
        };
      }
      // Snapshot lane only: the re-assembled agent has no model pick of its
      // own, so without this the continuation can answer on a different model
      // than the first half of the same turn. Resolved here rather than in the
      // executor because only the route knows the request's effort/override.
      // The tier the SUSPENDING run resolved to, carried on the interrupt.
      // Resolving without it falls through to the `chat` purpose
      // (`model.medium`), so a question asked at `low` came back answered by a
      // different model. Re-derive from the tier rather than pinning the
      // suspending run's model id: the id is stored bare, and pinning it would
      // drop a non-default gateway and skip governance clamping.
      //
      // Auto-effort is deliberately NOT re-run here. It sizes a turn from the
      // user's text, and a resume has none — the answer is the payload.
      const resumeEffort = openInterrupt?.effort ?? null;
      let resumeModelConfig: Awaited<
        ReturnType<typeof opts.aiService.threads.resolveRunModelConfig>
      > | null = null;
      try {
        resumeModelConfig = await opts.aiService.threads.resolveRunModelConfig({
          agentId: session.agent_id,
          effort: resumeEffort,
          // The user may change the picker while the card is open; their pick
          // outranks the tier, exactly as it does on a fresh turn.
          modelIdOverride,
          scope: scope.scope,
        });
      } catch (err) {
        console.error(
          "conversation resume model config resolution failed",
          err
        );
      }
      void resumeConversationRun({
        agentId: session.agent_id,
        // A reassembled agent has no browser tools unless this resume
        // re-declares them.
        agentUi,
        // Needed to reassemble the agent and continue from the stored snapshot.
        mastra: opts.aiService.mastra,
        modelConfig: resumeModelConfig?.modelConfig ?? null,
        effort: resumeEffort,
        // Metering: an approval-gated turn runs its expensive half AFTER the
        // gate, so this lane has to bill too or the turn is under-charged.
        modelId: resumeModelConfig?.modelId ?? null,
        newRunId: runId,
        ...(opts.createRegistry
          ? { registry: opts.createRegistry(scope.scope) }
          : {}),
        resolvedToolCallId: openInterrupt?.tool_call_id ?? "",
        resolveChildWorkspace: (child) =>
          opts.aiService.threads.resolveAgentWorkspaceForRun({
            agentId: child.agentId,
            runId: child.runId,
            scope: scope.scope,
            session,
            threadId: child.threadId,
          }),
        // Called LAZILY on purpose: resolving unconditionally would build a
        // second sandbox and syncIn over the same staging dir. Without it the
        // continuation has no `ctx.workspace.sandbox` and Code Mode / file /
        // skill tools vanish mid-conversation.
        resolveWorkspace: () =>
          opts.aiService.threads.resolveRunWorkspaces({
            runId,
            scope: scope.scope,
            session,
            threadId,
          }),
        resumeData,
        // Snapshot lane only: the runtime instructions the start lane sets on
        // its controller. `route_context` carries the user's UI language, so
        // without it the continuation answers a German user in English.
        routeContext:
          readRunRouteContext(body.data.forwardedProps) ??
          session.route_context,
        runContext: body.data.context,
        runStore,
        scope: scope.scope,
        sessionMetadata: resumeSessionMetadata,
        store: conversationStore,
        suspendedRunId: openInterrupt?.run_id ?? "",
        threadId,
        usageStore: opts.getUsageStore?.() ?? null,
      }).catch((err) => {
        console.error("conversation resume failed", err);
      });
    } else if (
      canRunConversation &&
      conversationStore &&
      opts.createRegistry &&
      (!isResumeRun || isArtifactResume)
    ) {
      // Conversation run. AG-UI events flow to the run-event-bus; the SSE block
      // below is unchanged.
      // A decision/feedback resume re-runs here with the selection nudged in.
      markRunLive(runId);
      let hsSessionMetadata = session.metadata;
      // On a resume the prompt comes from the resume payload, never from
      // `messages` — both resume branches below assign it unconditionally. Start
      // empty rather than relying on that coverage: a future resume kind reaching
      // this block would otherwise silently re-send the ORIGINAL user turn as if
      // it were new.
      let hsPrompt = isResumeRun ? "" : latestUserText(body.data);
      // A person's words while a run is already answering on this thread go
      // INTO that run — a room turn, or another window's turn — instead of
      // waiting behind it (PLAN-agent-rooms.md R3). Mastra takes the message
      // as the loop's next input; this response is a finished run that says
      // where the words went.
      if (!isResumeRun && hsPrompt.trim()) {
        const steered = await steerActiveThreadRun({
          text: hsPrompt,
          threadId,
        });
        if (steered.steered) {
          // The loop has the words; the thread must too. A room turn persists
          // no user rows of its own (its prompt is a wake line), so the
          // steered turn is written here, under the id the client gave it.
          const steeredMessageId = latestUserMessageId(body.data);
          await conversationStore.appendMessage({
            authorUserId: scope.scope.userId,
            ...(steeredMessageId ? { id: steeredMessageId } : {}),
            parts: [{ text: hsPrompt, type: "text" }],
            role: "user",
            tenantId: scope.scope.tenantId,
            threadId,
          });
          await noteHumanTurnInRoom({
            scope: scope.scope,
            store: conversationStore,
            threadId,
          });
          markRunDone(runId);
          return steeredRunResponse({
            intoRunId: steered.runId,
            runId,
            threadId,
          });
        }
        // The client attached to a run and meant its words for that run
        // only. It ended first: say so, and let the client send the ordinary
        // way instead of this route starting a turn the client did not ask for.
        if (readSteerOnly(body.data)) {
          markRunDone(runId);
          return c.json({ error: "agent_threads.notSteerable" }, 409);
        }
      }
      // Operation ids approved earlier in this chat — the execute-boundary gate
      // skips them. A fresh "Approve" on this resume is folded in below.
      let hsApprovalGrants = readToolApprovalGrants(session.metadata);
      if (isApprovalArtifactResume) {
        // Tool-approval re-run (interactive HITL): audit the decision and, on
        // approval, persist the grant — "once" survives this request's resume
        // runs, "always" the whole chat — so the re-executed pre-gate lets the op
        // run. The grant (not a nudged selection) drives the continuation; a short
        // proceed/deny note steers the model and is NOT persisted as a user
        // bubble — the Approve/Deny widget is the visible record.
        // Approve exactly the op the user answered: the answered interrupt id IS
        // the artifact id (buildToolApprovalArtifact sets interrupt_id = artifact_id).
        // The artifact branch has no answered-vs-open mismatch guard, so keying off
        // the answered id — not whatever is currently open — avoids granting the
        // wrong op if a stale card is answered after the run moved on.
        const answeredArtifactId =
          resumeEntries[0]?.interruptId ?? openInterrupt?.artifact_id;
        const operationId =
          parseToolApprovalOperationId(answeredArtifactId) ?? "";
        // Bulk pre-approval: the answered card may cover several operations
        // (grant context on the artifact id). One approve grants each.
        const hsGrantContext =
          parseToolApprovalGrantContext(answeredArtifactId);
        const hsGrantOperationIds = Array.from(
          new Set(
            [operationId, ...(hsGrantContext?.operation_ids ?? [])].filter(
              Boolean
            )
          )
        );
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
          ...(hsGrantOperationIds.length > 1
            ? { operationIds: hsGrantOperationIds }
            : {}),
          tenantId: scope.scope.tenantId,
          threadId,
          userId: scope.scope.userId,
        });
        // Grant to UNION into the durable metadata below. The in-memory copy
        // alone only carries the approval through THIS request's re-runs — once
        // they finish it is gone, so the same operation prompts again on a later
        // turn and "approve always" silently means "approve this once". The
        // parked branch above has always persisted; this branch (the one
        // interactive chat actually takes, because the start run gates under
        // approvalPolicy "artifact") did not.
        let grantAppendSets: Record<string, string[]> | undefined;
        if (once || always) {
          hsSessionMetadata = hsGrantOperationIds.reduce(
            (metadata, id) =>
              always
                ? withToolApprovalGrant(metadata, id)
                : withToolApprovalGrantOnce(metadata, id),
            hsSessionMetadata as Record<string, unknown>
          );
          grantAppendSets = {
            [always
              ? TOOL_APPROVAL_GRANTS_METADATA_KEY
              : TOOL_APPROVAL_GRANTS_ONCE_METADATA_KEY]: hsGrantOperationIds,
          };
          // Approving an agent's secret reveal also persists the durable
          // goal-scoped grant in core (goal = this conversation thread), or core
          // re-gates the reveal on the re-run's agent-forwarded invoke.
          if (operationId === "secrets_reveal" && hsGrantContext?.secret_id) {
            await persistSecretsGoalGrant({
              coreBaseUrl: opts.coreBaseUrl,
              goalId: threadId,
              secretId: hsGrantContext.secret_id,
              accessToken: scopeAccessToken(scope.scope),
            });
          }
        }
        // Card raised by core's 202: relay the answer to the request core
        // filed. Approve, or the re-run's agent-forwarded invoke hits the same
        // policy and the user's approval buys nothing; deny, or the request
        // outlives its answer in the tenant's queue. Outside the grant branch
        // above precisely because it also covers deny, and must land BEFORE
        // the resume re-invokes.
        if (hsGrantContext?.approval_request_id) {
          await persistCoreApprovalDecision({
            accessToken: scopeAccessToken(scope.scope),
            approvalRequestId: hsGrantContext.approval_request_id,
            coreBaseUrl: opts.coreBaseUrl,
            decision: always ? "always" : once ? "once" : "deny",
            subjectId: threadId,
          });
        }
        // The gate already returned the Approve/Deny card as this tool call's
        // result; mark it resolved so the model reads a completed interaction and
        // does not re-emit the same card, then steer the continuation.
        await resolveToolCallResultInHistory({
          result: {
            approved: once || always,
            operation_id: operationId,
            ...(hsGrantOperationIds.length > 1
              ? { operation_ids: hsGrantOperationIds }
              : {}),
          },
          scope: scope.scope,
          store: conversationStore,
          threadId,
          toolCallId: openInterrupt?.tool_call_id ?? "",
        });
        const hsOpsLabel =
          hsGrantOperationIds.length > 1
            ? hsGrantOperationIds.map((id) => `"${id}"`).join(", ")
            : `"${operationId}"`;
        hsPrompt =
          once || always
            ? `Approved: you may now run ${hsOpsLabel}. Proceed with the operation.`
            : `The user denied ${hsOpsLabel}. Do not run it; continue without that operation.`;
        hsSessionMetadata = mergeAgUiOpenInterruptMetadata(
          hsSessionMetadata,
          null
        );
        try {
          // One statement: union the grant AND drop the answered interrupt. The
          // RPC applies patch → append → remove against the CURRENT row, so a
          // concurrent writer to another key is not reverted.
          await conversationStore.mergeThreadMetadataForUser({
            ...(grantAppendSets ? { appendSets: grantAppendSets } : {}),
            removeKeys: [AG_UI_OPEN_INTERRUPT_METADATA_KEY],
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
          await conversationStore.mergeThreadMetadataForUser({
            removeKeys: [AG_UI_OPEN_INTERRUPT_METADATA_KEY],
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
            await conversationStore.mergeThreadMetadataForUser({
              removeKeys: [
                AG_UI_OPEN_INTERRUPT_METADATA_KEY,
                TOOL_APPROVAL_GRANTS_ONCE_METADATA_KEY,
              ],
              tenantId: scope.scope.tenantId,
              threadId,
              userId: scope.scope.userId,
            });
          } catch (err) {
            console.error("conversation fresh-turn reset failed", err);
          }
          // The person typed past the card: nobody will answer it now.
          await resolveThreadInterruptNotifications({
            interruptId: openInterrupt?.interrupt_id,
            outcome: "abandoned",
            tenantId: scope.scope.tenantId,
          });
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
          // An artifact resume re-runs the turn, so it lands here rather than
          // in the parked branch — but it is still the same turn. Sizing it
          // again would size it off no text at all (see `text` below), which
          // reads as "short" and silently demotes a turn the user asked at a
          // higher tier. The tier the interrupt was opened at wins; auto never
          // gets a second, worse guess at the same turn.
          const carriedEffort = isResumeRun
            ? (openInterrupt?.effort ?? null)
            : null;
          if (carriedEffort) {
            return { autoResolved: null, effort: carriedEffort };
          }
          // The agent's own default tier: what Auto answers for a coding
          // agent before it reads a word of the turn.
          const agentEffort = opts.createRegistry
            ? agentDefaultEffort(
                await Promise.resolve(
                  opts
                    .createRegistry(scope.scope)
                    .getAgentConfig?.(session.agent_id)
                ).catch(() => null)
              )
            : null;
          const resolved = await resolveEffortForRun({
            agentEffort,
            agentId: session.agent_id,
            allowedEfforts: effortCtx.allowedEfforts,
            choice: effortChoice,
            hasAttachments: isResumeRun
              ? false
              : latestUserAttachmentParts(body.data).length > 0,
            modelIdOverride,
            // A resume has no new user turn; sizing effort off the original
            // one re-reads text this thread already answered.
            text: isResumeRun ? "" : latestUserText(body.data),
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
      // Tiered attachments: images → multimodal files; PDFs/office stay as
      // extracted markdown (sidecar + 32 KiB inline). Never attach original
      // PDF bytes — that blows the token limiter.
      // Artifact resume carries no new user message, so there is nothing to resolve.
      const hsHistoryMessages = isArtifactResume
        ? []
        : await conversationStore
            .listMessagesOrdered({
              tenantId: scope.scope.tenantId,
              threadId,
            })
            .then((rows) =>
              rows.map((row) => ({ parts: row.parts, role: row.role }))
            )
            .catch((err) => {
              console.error("thread attachment history load failed", err);
              return [];
            });
      const hsTieredAttachments = isArtifactResume
        ? { contextEntries: [], modelAttachments: [] }
        : await resolveTieredAttachments({
            accessToken: scopeAccessToken(scope.scope),
            coreBaseUrl: opts.coreBaseUrl,
            historyMessages: hsHistoryMessages,
            input: body.data,
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
                invokeWorkflowCommand: ({ argsText, command, refs }) =>
                  invokeChatAction({
                    argsText,
                    command,
                    idempotencyKey: `slash:${latestUserMessageId(body.data) ?? runId}:${command.id}`,
                    mastra: opts.aiService.mastra,
                    moduleLoader: opts.moduleLoader,
                    refs,
                    scope: scope.scope,
                    spaceId:
                      (session as { space_id?: string | null }).space_id ??
                      null,
                  }),
                moduleLoader: opts.moduleLoader,
                prompt: hsPrompt,
                refs: latestUserReferenceItems(body.data),
                skillStorage: hsSkillStorage,
                tenantId: scope.scope.tenantId,
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
        // Persisted onto the interrupt if this turn suspends, so the resume
        // resolves the same model instead of drifting to the `chat` default.
        effort,
        mastra: opts.aiService.mastra,
        modelConfig: hsModelConfig?.modelConfig ?? null,
        modelId: hsModelConfig?.modelId ?? modelIdOverride,
        prompt: hsPrompt,
        ...(isArtifactResume ? { persistCurrentUserTurn: false } : {}),
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
        // The run's own place first — the thread only remembers where it was
        // created, and the copilot's one thread is walked through many spaces.
        // It decides the run's space, its language and the place stamped on
        // the user turn (turn-context.ts).
        routeContext:
          readRunRouteContext(body.data.forwardedProps) ??
          session.route_context,
        runContext:
          hsChatContextEntries.length > 0
            ? [...(body.data.context ?? []), ...hsChatContextEntries]
            : body.data.context,
        runId,
        runStore,
        scope: scope.scope,
        sessionMetadata: hsSessionMetadata,
        store: conversationStore,
        // Only a fresh turn has a user bubble to echo. On a resume the id would
        // be the ORIGINAL turn's, re-emitting a message every attached window
        // already shows.
        userMessageId: isResumeRun ? null : latestUserMessageId(body.data),
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
    // The run echoes the user's turn as a role:"user" TEXT_MESSAGE_* triple under
    // the id the CLIENT assigned, so other windows attached to the same run can
    // render the bubble before the end-of-turn coalescer flush (see
    // conversation-run.ts). THIS client is not one of those windows — it supplied
    // the message and already holds it. AG-UI's TEXT_MESSAGE_START means "begin a
    // new message", so a spec-compliant client receiving one for an id it already
    // has APPENDS: the user's own text ends up doubled. Verified against a stock
    // @ag-ui/client HttpAgent.
    // So: keep the echo in the durable log for attachers, withhold it from the
    // originating stream. Filtering here rather than at the emit site is what
    // keeps the log complete — `?since=` replays still carry it.
    const ownUserMessageId = latestUserMessageId(body.data);
    const isOwnUserTurnEcho = (event: AGUIEvent): boolean =>
      isUserTurnEchoFor(event, ownUserMessageId);
    const encoder = new TextEncoder();
    const clientSignal = c.req.raw.signal;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const write = (event: AGUIEvent, seq?: number) => {
          if (closed) {
            return;
          }
          opts.debugEvents?.publish(event);
          try {
            controller.enqueue(encoder.encode(encodeAgUiSseEvent(event, seq)));
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
              // Advance `lastSeq` even when withheld: the echo still occupies a
              // seq in the log, and skipping the bookkeeping would re-deliver it
              // from the next source (buffer vs. persisted replay overlap).
              if (!isOwnUserTurnEcho(event)) {
                write(event, seq);
              }
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
