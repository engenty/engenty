"use client";

import {
  useAgentUiFrontendToolExecutor,
  useAgentUiFrontendTools,
  useAgentUiStateSnapshot,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  executeOpenAiRealtimeVoiceBackendTool,
  executeOpenAiRealtimeVoiceFrontendTool,
  isOpenAiRealtimeVoiceBackendToolName,
  OPENAI_REALTIME_VOICE_ENGENTY_BACKEND_TOOLS,
  type OpenAiRealtimeVoiceComposerControls,
  type OpenAiRealtimeVoiceToolCallRequest,
  openAiRealtimeVoiceToolsFromFrontendTools,
  parseRealtimeVoiceToolApproval,
  postRealtimeVoiceFieldsApply,
  postRealtimeVoiceToolApprove,
  useOpenAiRealtimeVoiceComposerControls,
} from "../ag-ui/apps-ai/index.js";
import {
  normalizeRealtimeToolInput,
  openAiRealtimeVoiceToolsFromFrontendTools as voiceToolsFromDefs,
} from "../ag-ui/apps-ai/realtime-voice-frontend-tools.js";
import {
  resolvePendingVoiceConfirmation,
  setPendingVoiceConfirmation,
} from "../ag-ui/apps-ai/voice-pending-confirmation.js";
import {
  PROPOSE_UPDATES_VOICE_TOOL,
  parseVoiceProposeUpdatesArgs,
} from "../ag-ui/apps-ai/voice-propose-updates-tool.js";
import {
  RESOLVE_PENDING_CONFIRMATION_TOOL,
  VOICE_END_SESSION_TOOL,
  VOICE_MUTE_TOOL,
  VOICE_SESSION_CONTROL_TOOLS,
  VOICE_UNMUTE_TOOL,
} from "../ag-ui/apps-ai/voice-session-control-tools.js";
import {
  ACTIVE_COPILOT_AGENT_ID,
  ENGENTY_COPILOT_HOST_KEY,
  useAgentHost,
  useEngentyAIContext,
} from "../agent-provider/index.js";
import { VoiceConfirmationHost } from "../components/copilot/interrupts/voice-confirmation-host.js";
import { useCustomAgentDetailQuery } from "../lib/admin/ai-runtime-queries.js";
import { useCopilotRiver } from "./copilot-river.js";
import { formatCopilotVoiceUiStateInstructions } from "./copilot-voice-context.js";

interface CopilotVoiceContextValue {
  /** True while a RealtimeVoiceCallStrip (composer override) is mounted
   *  somewhere on screen — the voice FAB hides to avoid a duplicate surface. */
  callStripMounted: boolean;
  realtimeVoice: OpenAiRealtimeVoiceComposerControls;
}

const CopilotVoiceContext = createContext<CopilotVoiceContextValue | null>(
  null
);

/** Marks the call strip as mounted for the FAB's visibility check. */
function CallStripPresence({
  children,
  register,
}: {
  children: ReactNode;
  register: () => () => void;
}) {
  useEffect(register, [register]);
  return children;
}

export function CopilotVoiceProvider({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation("engenty-copilot");
  const river = useCopilotRiver();
  const host = useAgentHost(ENGENTY_COPILOT_HOST_KEY);
  const ai = useEngentyAIContext();
  const executeFrontendTool = useAgentUiFrontendToolExecutor();
  const frontendTools = useAgentUiFrontendTools();
  const uiState = useAgentUiStateSnapshot();
  const agentQuery = useCustomAgentDetailQuery(ACTIVE_COPILOT_AGENT_ID);

  const uiStatePrompt = useMemo(
    () => formatCopilotVoiceUiStateInstructions(uiState),
    [uiState]
  );

  const voiceInstructions = useMemo(() => {
    const rawBase =
      agentQuery.data?.agent?.instructions ||
      "You are Engenty Copilot in a realtime voice conversation. Help the authenticated workspace user directly. Use Engenty backend tools for workspace actions and safe frontend tools for browser/app actions when useful.";

    // Slice base to 6400 characters to reserve space for path and state prompts
    const base = rawBase.slice(0, 6400);

    const languageInstruction = `The user's preferred language is '${i18n.language}'. Always respond and speak in this language unless the user explicitly asks you to switch.`;

    const combined = [
      base,
      uiStatePrompt,
      languageInstruction,
      "You are in a live voice session. When the user asks to navigate, go to, show, or open a page, execute the 'navigate' tool using the matching canonical app path from the table above.",
      "You can control the voice session: use 'voice_end_session' when the user says goodbye or asks to stop; use 'voice_mute' / 'voice_unmute' to toggle the microphone. Say goodbye before ending the session.",
      "Some actions require the user's confirmation before they run. When you invoke such an action it returns 'awaiting_confirmation' and a confirmation dialog appears on screen. Ask the user to confirm; when they agree call 'resolve_pending_confirmation' with approved=true, or approved=false if they decline. If they ask to always allow this kind of action for the whole chat (e.g. 'immer erlauben'), call it with approved=true and always=true. Never assume approval and never retry the original action yourself — only 'resolve_pending_confirmation' carries out the decision.",
      "To suggest edits to the record the user is viewing, call 'propose_updates' with context_type and context_id from the current UI state and the fields you researched. It opens a review dialog and returns 'awaiting_confirmation'; ask the user to confirm and resolve it the same way with 'resolve_pending_confirmation'.",
    ]
      .filter(Boolean)
      .join("\n\n");

    // Enforce strict 8000 character limit for backend Zod schema
    return combined.slice(0, 8000);
  }, [agentQuery.data?.agent?.instructions, i18n.language, uiStatePrompt]);

  const serviceBaseUrl = ai.serviceBaseUrl;
  const isTransportReady = ai.isTransportReady;
  const status =
    host.pendingSend && host.status === "ready" ? "submitted" : host.status;
  const controlsDisabled =
    status !== "ready" || host.awaitingInterrupt || !isTransportReady;
  const userId = river.userId;

  // Ref to the session so the tool executor can access it without circular deps
  const sessionRef = useRef<
    | import("../ag-ui/apps-ai/use-openai-realtime-voice-session.js").OpenAiRealtimeVoiceSessionState
    | null
  >(null);

  // Single resolution path for both channels (voice resolve tool + dialog
  // buttons). Wires the backend approve + re-invoke injectors and the
  // field-update apply path.
  const resolveVoiceConfirmation = useCallback(
    (
      approved: boolean,
      always: boolean,
      approvedFields?: Array<{ field: string; value: string | null }>
    ) =>
      resolvePendingVoiceConfirmation({
        always,
        approved,
        approvedFields,
        applyFieldUpdates: ({ approved: fields, contextId, contextType }) =>
          postRealtimeVoiceFieldsApply({
            approved: fields,
            baseUrl: serviceBaseUrl,
            contextId,
            contextType,
          }),
        approveBackendTool: ({ decision, operationId, threadId }) =>
          postRealtimeVoiceToolApprove({
            baseUrl: serviceBaseUrl,
            decision,
            operationId,
            threadId,
          }),
        executeBackendTool: (req, opts) =>
          executeOpenAiRealtimeVoiceBackendTool({
            baseUrl: serviceBaseUrl,
            request: req,
            threadId: river.threadId,
            ...(opts?.approvalGrantOnce
              ? { approvalGrantOnce: opts.approvalGrantOnce }
              : {}),
          }),
        runId: river.threadId ?? `new-${host.threadResetKey}`,
      }),
    [river.threadId, host.threadResetKey, serviceBaseUrl]
  );

  const executeRealtimeVoiceTool = useCallback(
    async (request: OpenAiRealtimeVoiceToolCallRequest) => {
      const runId = river.threadId ?? `new-${host.threadResetKey}`;
      // ---- Voice session control tools (handled locally) ----
      const session = sessionRef.current;
      if (request.name === VOICE_END_SESSION_TOOL.name) {
        session?.end();
        return { success: true, action: "session_ended" };
      }
      if (request.name === VOICE_MUTE_TOOL.name) {
        if (session && !session.isMuted) {
          session.toggleMute();
        }
        return { success: true, action: "muted" };
      }
      if (request.name === VOICE_UNMUTE_TOOL.name) {
        if (session?.isMuted) {
          session.toggleMute();
        }
        return { success: true, action: "unmuted" };
      }

      // ---- Resolve a pending HITL confirmation (voice channel) ----
      if (request.name === RESOLVE_PENDING_CONFIRMATION_TOOL.name) {
        const args = request.arguments as {
          always?: unknown;
          approved?: unknown;
        } | null;
        const approved =
          typeof args === "object" && args !== null && args.approved === true;
        const always =
          typeof args === "object" && args !== null && args.always === true;
        return resolveVoiceConfirmation(approved, always);
      }

      // ---- Backend tools ----
      if (isOpenAiRealtimeVoiceBackendToolName(request.name)) {
        const result = await executeOpenAiRealtimeVoiceBackendTool({
          baseUrl: serviceBaseUrl,
          request,
          threadId: river.threadId,
        });
        // A gated backend op returns an approval decision artifact instead of
        // running. Park it for confirmation rather than handing the model the
        // raw artifact (which it can't act on). With a thread the decision
        // persists as a chat grant; a threadless session (fresh voice chat)
        // carries it on the re-invoke as a one-shot grant instead.
        const approval = parseRealtimeVoiceToolApproval(result);
        if (approval) {
          setPendingVoiceConfirmation({
            artifactId: approval.artifactId,
            body: approval.body,
            callId: request.callId,
            choices: approval.choices,
            input: normalizeRealtimeToolInput(request.arguments),
            interruptId: approval.interruptId,
            kind: "backend_approval",
            operationId: approval.operationId,
            request,
            threadId: river.threadId ?? null,
            title: approval.title,
          });
          return {
            message:
              "This action needs the user's approval before it runs. A confirmation dialog is now shown. Ask the user to confirm out loud (or note they can use the dialog). When they agree, call resolve_pending_confirmation with approved=true (set always=true only if they explicitly ask to always allow it for this chat); if they decline, call it with approved=false. Do not retry the action yourself.",
            status: "awaiting_confirmation",
            tool: approval.operationId,
          };
        }
        return result;
      }

      // ---- Propose field updates: park as a field-suggestions review ----
      if (request.name === PROPOSE_UPDATES_VOICE_TOOL.name) {
        const proposal = parseVoiceProposeUpdatesArgs(request.arguments);
        if (!proposal) {
          return {
            message:
              "propose_updates needs context_type, context_id and at least one suggestion with a field and value.",
            ok: false,
          };
        }
        setPendingVoiceConfirmation({
          callId: request.callId,
          contextId: proposal.contextId,
          contextType: proposal.contextType,
          input: normalizeRealtimeToolInput(request.arguments),
          kind: "field_suggestions",
          request,
          suggestions: proposal.suggestions,
          title: proposal.title ?? "Review suggested updates",
        });
        return {
          message:
            "A review dialog with the proposed updates is now shown to the user. Ask them to confirm; when they agree, call resolve_pending_confirmation with approved=true (this applies all proposed fields), or approved=false if they decline. They can also pick individual fields in the dialog. Do not assume the updates are applied until then.",
          status: "awaiting_confirmation",
          tool: PROPOSE_UPDATES_VOICE_TOOL.name,
        };
      }

      // ---- Frontend tools: run immediately (no confirmation gating) ----
      return executeOpenAiRealtimeVoiceFrontendTool({
        executeFrontendTool,
        request,
        runId,
        tools: frontendTools,
      });
    },
    [
      river.threadId,
      executeFrontendTool,
      frontendTools,
      host.threadResetKey,
      resolveVoiceConfirmation,
      serviceBaseUrl,
    ]
  );

  const voiceControlRealtimeTools = useMemo(
    () =>
      voiceToolsFromDefs([
        ...VOICE_SESSION_CONTROL_TOOLS,
        PROPOSE_UPDATES_VOICE_TOOL,
      ]),
    []
  );

  const realtimeVoiceTools = useMemo(
    () => [
      ...OPENAI_REALTIME_VOICE_ENGENTY_BACKEND_TOOLS,
      ...openAiRealtimeVoiceToolsFromFrontendTools(frontendTools),
      ...voiceControlRealtimeTools,
    ],
    [frontendTools, voiceControlRealtimeTools]
  );

  const realtimeVoice = useOpenAiRealtimeVoiceComposerControls({
    baseUrl: serviceBaseUrl,
    controlsDisabled,
    enabled: isTransportReady,
    executeTool: executeRealtimeVoiceTool,
    instructions: voiceInstructions,
    tools: realtimeVoiceTools,
    transcriptLabels: {
      assistant: t("chat.realtimeVoice.assistant"),
      user: t("chat.realtimeVoice.user"),
    },
    visitorId: userId,
  });

  // Keep sessionRef in sync for the tool executor
  sessionRef.current = realtimeVoice.session;

  const [callStripCount, setCallStripCount] = useState(0);
  const registerCallStrip = useCallback(() => {
    setCallStripCount((count) => count + 1);
    return () => setCallStripCount((count) => count - 1);
  }, []);

  const value = useMemo(
    () => ({
      callStripMounted: callStripCount > 0,
      realtimeVoice: {
        ...realtimeVoice,
        composerOverride:
          realtimeVoice.composerOverride === undefined ? undefined : (
            <CallStripPresence register={registerCallStrip}>
              {realtimeVoice.composerOverride}
            </CallStripPresence>
          ),
      },
    }),
    [callStripCount, realtimeVoice, registerCallStrip]
  );

  return (
    <CopilotVoiceContext.Provider value={value}>
      {children}
      <VoiceConfirmationHost
        resolve={resolveVoiceConfirmation}
        sendClientEvent={realtimeVoice.session.sendClientEvent}
      />
    </CopilotVoiceContext.Provider>
  );
}

export function useCopilotVoice(): OpenAiRealtimeVoiceComposerControls {
  const context = useContext(CopilotVoiceContext);
  if (!context) {
    throw new Error("useCopilotVoice must be used within CopilotVoiceProvider");
  }
  return context.realtimeVoice;
}

/** True while a voice call strip is mounted anywhere (composer override). */
export function useCopilotVoiceCallStripMounted(): boolean {
  const context = useContext(CopilotVoiceContext);
  if (!context) {
    throw new Error(
      "useCopilotVoiceCallStripMounted must be used within CopilotVoiceProvider"
    );
  }
  return context.callStripMounted;
}
