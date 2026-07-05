"use client";

/**
 * Backwards-compatible OpenAI-named surface over the provider-agnostic
 * realtime voice session. New code should use `useRealtimeVoiceSession`
 * (./use-realtime-voice-session.js) and the neutral `RealtimeVoice*` types;
 * this module exists so existing callers keep compiling while the rename
 * settles, and to adapt legacy `connect` injections (raw WebRTC connections
 * fed with raw OpenAI events) onto the normalized transport.
 */

import { useMemo } from "react";
import {
  openAiRealtimeVoiceSessionToolEvents,
  openAiRealtimeVoiceToolCallsFromOpenAiEvent,
  realtimeVoiceStatusFromOpenAiEvent,
  realtimeVoiceTranscriptFromOpenAiEvent,
} from "./openai-realtime-voice-mapping.js";
import type {
  ConnectOpenAiRealtimeWebRtcOptions,
  OpenAiRealtimeWebRtcConnection,
} from "./openai-realtime-webrtc.js";
import {
  type RealtimeVoiceToolCallRequest,
  type RealtimeVoiceToolDefinition,
  type RealtimeVoiceTranscript,
  type RealtimeVoiceTranscriptMessage,
  type RealtimeVoiceTranscriptSegment,
  realtimeVoiceTranscriptMessagesFromTranscript,
} from "./realtime-voice-events.js";
import {
  type ConnectRealtimeVoiceTransportOptions,
  openAiConnectionAsTransport,
  openAiRawEventHandler,
} from "./realtime-voice-transport.js";
import {
  type RealtimeVoiceSessionState,
  useRealtimeVoiceSession,
} from "./use-realtime-voice-session.js";

export {
  openAiRealtimeVoiceSessionToolEvents,
  openAiRealtimeVoiceToolCallsFromOpenAiEvent,
  realtimeVoiceStatusFromOpenAiEvent,
  realtimeVoiceTranscriptFromOpenAiEvent,
};

export type OpenAiRealtimeVoiceSessionState = RealtimeVoiceSessionState;
export type OpenAiRealtimeVoiceTranscript = RealtimeVoiceTranscript;
export type OpenAiRealtimeVoiceTranscriptSegment =
  RealtimeVoiceTranscriptSegment;
export type OpenAiRealtimeVoiceToolDefinition = RealtimeVoiceToolDefinition;
export type OpenAiRealtimeVoiceToolCallRequest = RealtimeVoiceToolCallRequest;
export type OpenAiRealtimeVoiceTranscriptMessage =
  RealtimeVoiceTranscriptMessage;

export const openAiRealtimeVoiceTranscriptMessagesFromTranscript =
  realtimeVoiceTranscriptMessagesFromTranscript;

export interface UseOpenAiRealtimeVoiceSessionOptions
  extends ConnectOpenAiRealtimeWebRtcOptions {
  connect?: (
    options: ConnectOpenAiRealtimeWebRtcOptions
  ) => Promise<OpenAiRealtimeWebRtcConnection>;
  enabled?: boolean;
  executeTool?: (
    request: OpenAiRealtimeVoiceToolCallRequest
  ) => Promise<unknown> | unknown;
  tools?: readonly OpenAiRealtimeVoiceToolDefinition[];
}

export function useOpenAiRealtimeVoiceSession({
  connect,
  ...options
}: UseOpenAiRealtimeVoiceSessionOptions = {}): OpenAiRealtimeVoiceSessionState {
  const connectTransport = useMemo(
    () => (connect ? legacyOpenAiConnectAsTransport(connect) : undefined),
    [connect]
  );
  return useRealtimeVoiceSession({ ...options, connectTransport });
}

function legacyOpenAiConnectAsTransport(
  connect: NonNullable<UseOpenAiRealtimeVoiceSessionOptions["connect"]>
) {
  return async ({
    onVoiceEvent,
    tools = [],
    ...options
  }: ConnectRealtimeVoiceTransportOptions) => {
    const connection = await connect({
      ...options,
      clientEvents: [
        ...(options.clientEvents ?? []),
        ...openAiRealtimeVoiceSessionToolEvents(tools),
      ],
      onEvent: openAiRawEventHandler(options.onEvent, onVoiceEvent),
    });
    return openAiConnectionAsTransport(connection);
  };
}
