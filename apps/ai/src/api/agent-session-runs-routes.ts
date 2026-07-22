import {
  type AGUIEvent,
  encodeAgUiSseEvent,
  isAgentUiStateSnapshotV1,
  isFrontendToolDefinition,
  isFrontendToolOpenInterrupt,
  type RunAgentInput,
  RunAgentInputSchema,
} from "@engenty/ag-ui-bridge";
import type {
  AiUsageStore,
  DynamicAiModuleCapabilityLoader,
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
import { resolveToolCallResultInHistory } from "../ai/sessions/resolve-tool-call-history.js";
import {
  isRunLiveInProcess,
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
import { readDecisionResumeChoice } from "../ai/sessions/transcript.js";
import type { AiSessionScope } from "../ai/sessions/types.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type {
  AgentRunStore,
  AgentSessionStore,
} from "../dal/agent-sessions/index.js";
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

export function registerAgentSessionRunRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    createRegistry?: (scope: AiSessionScope) => AiRegistry;
    /** Core service base URL — used to resolve chat attachment bytes for the model. */
    coreBaseUrl?: string;
    /** Module capabilities — used to resolve the chat slash-command catalog. */
    moduleLoader?: DynamicAiModuleCapabilityLoader;
    getRunStore?: () => AgentRunStore | null;
    getStore?: () => AgentSessionStore | null;
    getUsageStore?: () => AiUsageStore | null;
    aiService: AiService;
    onSessionPersisted?: (params: {
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
      const result = await opts.aiService.sessions.getSession({
        scope: scope.scope,
        threadId,
      });
      session = result.session;
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
        (tool) => tool.metadata?.engenty?.owner_module_id === "chatbot"
      );
    }

    const agentUi = runContext
      ? await filterAgentUiFrontendToolsForScope({
          agentUi: runContext,
          tenantId: scope.scope.tenantId,
          userAccessToken: scope.scope.userAccessToken,
        })
      : null;
    const modelIdOverride = resolveModelIdOverride(body.data);

    try {
      await opts.aiService.sessions.assertNativeMemoryAvailable({
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
        const choice = resumeEntries[0]
          ? readDecisionResumeChoice(resumeEntries[0])?.choiceId
          : undefined;
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
            await conversationStore.updateSessionForUser({
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
              userAccessToken: scope.scope.userAccessToken,
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
        newRunId: runId,
        resolvedToolCallId: openInterrupt?.tool_call_id ?? "",
        resumeData,
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
      if (isArtifactResume) {
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
          await conversationStore.updateSessionForUser({
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
            await conversationStore.updateSessionForUser({
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
      let hsWorkspaces: Awaited<
        ReturnType<typeof opts.aiService.sessions.resolveRunWorkspaces>
      > = {};
      try {
        hsWorkspaces = await opts.aiService.sessions.resolveRunWorkspaces({
          runId,
          scope: scope.scope,
          session,
          threadId,
        });
      } catch (err) {
        console.error("conversation workspace resolution failed", err);
      }
      let hsModelConfig: Awaited<
        ReturnType<typeof opts.aiService.sessions.resolveRunModelConfig>
      > | null = null;
      try {
        hsModelConfig = await opts.aiService.sessions.resolveRunModelConfig({
          agentId: session.agent_id,
          modelIdOverride,
          scope: scope.scope,
        });
      } catch (err) {
        console.error("conversation model config resolution failed", err);
      }
      // Durable connection-level "always allow" grants (Settings → Connections)
      // merge with this chat's session grants; both feed the same pre-gate.
      const hsConnectionGrants = await loadConnectionApprovalGrants({
        userAccessToken: scope.scope.userAccessToken,
      });
      // Tiered attachments: images/PDFs → multimodal files; small text/CSV →
      // run context (≤32KiB); larger/binary → manifest + agent-file_analyst.
      // Artifact resume carries no new user message, so there is nothing to resolve.
      const hsTieredAttachments = isArtifactResume
        ? { contextEntries: [], modelAttachments: [] }
        : await resolveTieredAttachments({
            coreBaseUrl: opts.coreBaseUrl,
            input: body.data,
            userAccessToken: scope.scope.userAccessToken,
          });
      // Durable transcript parts for this turn (persisted so attachments render
      // on reload); empty on an artifact resume (no new user message).
      const hsAttachmentParts = isArtifactResume
        ? []
        : latestUserAttachmentParts(body.data);
      // Slash-command expansion + typed @-mention references + attachment
      // manifest/inline text ride the run context — raw user text stays untouched.
      const hsChatContextEntries =
        isArtifactResume || isResumeRun
          ? []
          : [
              ...(await buildChatTurnContextEntries({
                agentId: session.agent_id,
                moduleLoader: opts.moduleLoader,
                prompt: hsPrompt,
                refs: latestUserReferenceItems(body.data),
              })),
              ...hsTieredAttachments.contextEntries,
            ];
      void startConversationRun({
        agentId: session.agent_id,
        agentUi: agentUi ?? null,
        attachments: hsTieredAttachments.modelAttachments,
        attachmentParts: hsAttachmentParts,
        approvalGrants: mergeApprovalGrants(
          hsApprovalGrants,
          hsConnectionGrants
        ),
        modelConfig: hsModelConfig?.modelConfig ?? null,
        modelId: hsModelConfig?.modelId ?? modelIdOverride,
        prompt: hsPrompt,
        registry: opts.createRegistry(scope.scope),
        // Phase 3 — child-run delegation: resolve each delegated agent's own
        // workspace + sandbox on demand (keyed by the child run's own thread).
        resolveChildWorkspace: (child) =>
          opts.aiService.sessions.resolveAgentWorkspaceForRun({
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
        scope: scope.scope,
        sessionMetadata: hsSessionMetadata,
        store: conversationStore,
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
          // Subscribe first (buffer), then replay persisted, then follow live.
          const buffered: Array<{ event: AGUIEvent; seq: number }> = [];
          const unsub = subscribeRunEvents(runId, (e) => {
            buffered.push(e);
          });
          try {
            const persisted = runStore
              ? await runStore.listRunEvents({
                  tenantId: scope.scope.tenantId,
                  runId,
                  sinceSeq: -1,
                })
              : [];
            let lastSeq = -1;
            for (const row of persisted) {
              write(row.payload as AGUIEvent);
              lastSeq = row.seq;
            }

            const stillLive = isRunLiveInProcess(runId);
            if (!stillLive) {
              // Run finished before we could attach (or no runStore) — replay only.
              close();
              return;
            }

            unsub();
            const directUnsub = subscribeRunEvents(runId, (e) => {
              if (e.seq > lastSeq) {
                write(e.event);
                lastSeq = e.seq;
              }
            });

            for (const e of buffered) {
              if (e.seq > lastSeq) {
                write(e.event);
                lastSeq = e.seq;
              }
            }

            const finishEvents = new Set(["RUN_FINISHED", "RUN_ERROR"]);
            const finalUnsub = subscribeRunEvents(runId, (e) => {
              if (finishEvents.has(e.event.type)) {
                directUnsub();
                finalUnsub();
                close();
              }
            });
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
