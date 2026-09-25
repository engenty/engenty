"use client";

import { type ReactNode, useEffect, useMemo, useRef } from "react";
import {
  RealtimeVoiceCallStrip,
  type RealtimeVoiceUiLabels,
} from "../../components/realtime-voice/realtime-voice.js";
import {
  type OpenAiRealtimeVoiceSessionState,
  type OpenAiRealtimeVoiceToolCallRequest,
  type OpenAiRealtimeVoiceToolDefinition,
  type OpenAiRealtimeVoiceTranscriptMessage,
  openAiRealtimeVoiceTranscriptMessagesFromTranscript,
  useOpenAiRealtimeVoiceSession,
} from "./use-openai-realtime-voice-session.js";

export interface UseOpenAiRealtimeVoiceComposerControlsOptions {
  auth?: "apps-ai" | "none";
  baseUrl?: string;
  enabled?: boolean;
  executeTool?: (
    request: OpenAiRealtimeVoiceToolCallRequest
  ) => Promise<unknown> | unknown;
  instructions?: string;
  labels?: RealtimeVoiceUiLabels;
  onTranscriptReady?: (
    messages: readonly OpenAiRealtimeVoiceTranscriptMessage[]
  ) => Promise<void> | void;
  sessionPath?: string;
  sessionUrl?: string;
  tools?: readonly OpenAiRealtimeVoiceToolDefinition[];
  transcriptLabels?: {
    assistant?: string;
    user?: string;
  };
  visitorId?: string;
}

export interface OpenAiRealtimeVoiceComposerControls {
  composerOverride: ReactNode | undefined;
  session: OpenAiRealtimeVoiceSessionState;
  transcriptMessages: OpenAiRealtimeVoiceTranscriptMessage[];
}

export function useOpenAiRealtimeVoiceComposerControls({
  baseUrl,
  auth,
  enabled = false,
  executeTool,
  instructions,
  labels,
  onTranscriptReady,
  transcriptLabels,
  sessionPath,
  sessionUrl,
  tools,
  visitorId,
}: UseOpenAiRealtimeVoiceComposerControlsOptions): OpenAiRealtimeVoiceComposerControls {
  const persistedTranscriptKeyRef = useRef<string | null>(null);
  const session = useOpenAiRealtimeVoiceSession({
    auth,
    baseUrl,
    enabled,
    executeTool,
    instructions,
    sessionPath,
    sessionUrl,
    tools,
    visitorId,
  });

  const composerOverride = useMemo(() => {
    if (!(session.isActive || session.status === "error")) {
      return;
    }

    return (
      <RealtimeVoiceCallStrip
        caption={formatRealtimeVoiceCaption(
          session.transcript,
          transcriptLabels ?? labels
        )}
        disabled={session.status === "error"}
        error={session.error}
        labels={labels}
        onEnd={session.end}
        onToggleMute={session.toggleMute}
        status={session.status}
      />
    );
  }, [
    labels,
    session.end,
    session.error,
    session.isActive,
    session.status,
    session.toggleMute,
    session.transcript,
    transcriptLabels,
  ]);

  const transcriptMessages = useMemo(
    () =>
      openAiRealtimeVoiceTranscriptMessagesFromTranscript(
        session.transcript,
        session.transcriptTurnId
      ),
    [session.transcript, session.transcriptTurnId]
  );

  useEffect(() => {
    if (!(onTranscriptReady && session.status === "ended")) {
      return;
    }
    if (transcriptMessages.length === 0) {
      return;
    }
    const key = transcriptMessages
      .map((message) => `${message.id}:${JSON.stringify(message.parts)}`)
      .join("|");
    if (persistedTranscriptKeyRef.current === key) {
      return;
    }
    persistedTranscriptKeyRef.current = key;
    Promise.resolve(onTranscriptReady(transcriptMessages))
      .then(() => {
        session.clearTranscript();
      })
      .catch(() => {
        persistedTranscriptKeyRef.current = null;
      });
  }, [onTranscriptReady, session, session.status, transcriptMessages]);

  return useMemo(
    () => ({
      composerOverride,
      session,
      transcriptMessages,
    }),
    [composerOverride, session, transcriptMessages]
  );
}

function formatRealtimeVoiceCaption(
  transcript: OpenAiRealtimeVoiceSessionState["transcript"],
  labels?: UseOpenAiRealtimeVoiceComposerControlsOptions["transcriptLabels"]
): string | null {
  const segment = [...transcript.segments]
    .reverse()
    .find((candidate) => candidate.text.trim());
  if (!segment) {
    return null;
  }
  const label =
    segment.role === "assistant"
      ? (labels?.assistant ?? "Assistant")
      : (labels?.user ?? "You");
  return `${label}: ${segment.text.trim()}`;
}
