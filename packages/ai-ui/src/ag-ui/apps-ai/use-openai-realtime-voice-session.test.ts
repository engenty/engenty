/** @vitest-environment happy-dom */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConnectOpenAiRealtimeWebRtcOptions } from "./openai-realtime-webrtc.js";
import {
  executeOpenAiRealtimeVoiceFrontendTool,
  openAiRealtimeVoiceFrontendToolName,
  openAiRealtimeVoiceToolsFromFrontendTools,
} from "./realtime-voice-frontend-tools.js";
import {
  openAiRealtimeVoiceSessionToolEvents,
  openAiRealtimeVoiceToolCallsFromOpenAiEvent,
  openAiRealtimeVoiceTranscriptMessagesFromTranscript,
  realtimeVoiceStatusFromOpenAiEvent,
  realtimeVoiceTranscriptFromOpenAiEvent,
  useOpenAiRealtimeVoiceSession,
} from "./use-openai-realtime-voice-session.js";

describe("realtimeVoiceStatusFromOpenAiEvent", () => {
  it("maps OpenAI realtime events to voice UI statuses", () => {
    expect(
      realtimeVoiceStatusFromOpenAiEvent({ type: "response.audio.delta" })
    ).toBe("speaking");
    expect(
      realtimeVoiceStatusFromOpenAiEvent({
        type: "response.output_audio_transcript.delta",
      })
    ).toBe("speaking");
    expect(
      realtimeVoiceStatusFromOpenAiEvent({
        type: "input_audio_buffer.speech_started",
      })
    ).toBe("listening");
    expect(realtimeVoiceStatusFromOpenAiEvent({ type: "unknown" })).toBeNull();
  });
});

describe("realtimeVoiceTranscriptFromOpenAiEvent", () => {
  it("maps OpenAI realtime transcript events to role updates", () => {
    expect(
      realtimeVoiceTranscriptFromOpenAiEvent({
        item_id: "item-user-1",
        transcript: "Hello",
        type: "conversation.item.input_audio_transcription.completed",
      })
    ).toEqual({
      done: true,
      itemId: "item-user-1",
      mode: "replace",
      role: "user",
      text: "Hello",
    });
    expect(
      realtimeVoiceTranscriptFromOpenAiEvent({
        delta: "Hi",
        item_id: "item-assistant-1",
        type: "response.output_audio_transcript.delta",
      })
    ).toEqual({
      itemId: "item-assistant-1",
      mode: "append",
      role: "assistant",
      text: "Hi",
    });
  });
});

describe("openAiRealtimeVoiceTranscriptMessagesFromTranscript", () => {
  it("creates AG-UI compatible transcript messages for voice segments", () => {
    expect(
      openAiRealtimeVoiceTranscriptMessagesFromTranscript({
        segments: [
          {
            done: true,
            id: "realtime-voice-user-item-1",
            role: "user",
            text: "Find Ada",
          },
          {
            done: true,
            id: "realtime-voice-assistant-item-1",
            role: "assistant",
            text: "Working",
          },
        ],
      })
    ).toEqual([
      {
        id: "realtime-voice-user-item-1",
        parts: [{ text: "Find Ada", type: "text" }],
        role: "user",
      },
      {
        id: "realtime-voice-assistant-item-1",
        parts: [{ text: "Working", type: "text" }],
        role: "assistant",
      },
    ]);
  });
});

describe("useOpenAiRealtimeVoiceSession", () => {
  it("connects, mutes, and disconnects through the WebRTC adapter", async () => {
    const disconnect = vi.fn();
    const setMuted = vi.fn();
    const sendEvent = vi.fn();
    let onEvent: ((event: unknown) => void) | undefined;
    const connect = vi.fn(
      async (options: ConnectOpenAiRealtimeWebRtcOptions) => {
        onEvent = options.onEvent;
        return {
          dataChannel: {} as RTCDataChannel,
          disconnect,
          localStream: {} as MediaStream,
          peerConnection: {} as RTCPeerConnection,
          remoteAudio: {} as HTMLAudioElement,
          sendEvent,
          setMuted,
        };
      }
    );

    const { result } = renderHook(() =>
      useOpenAiRealtimeVoiceSession({ connect, visitorId: "visitor-1" })
    );

    await act(async () => {
      await result.current.start();
    });

    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({ visitorId: "visitor-1" })
    );
    expect(result.current.status).toBe("listening");

    act(() => onEvent?.({ type: "response.audio.delta" }));

    expect(result.current.status).toBe("speaking");

    act(() =>
      onEvent?.({
        item_id: "user-audio-1",
        transcript: "Find Ada",
        type: "conversation.item.input_audio_transcription.completed",
      })
    );
    act(() =>
      onEvent?.({
        delta: "Working",
        item_id: "assistant-audio-1",
        type: "response.output_audio_transcript.delta",
      })
    );

    expect(result.current.transcript).toEqual({
      segments: [
        {
          done: true,
          id: "realtime-voice-user-user-audio-1",
          role: "user",
          text: "Find Ada",
        },
        {
          done: undefined,
          id: "realtime-voice-assistant-assistant-audio-1",
          role: "assistant",
          text: "Working",
        },
      ],
    });
    expect(result.current.transcriptTurnId).toBe(1);

    act(() => result.current.toggleMute());

    expect(setMuted).toHaveBeenCalledWith(true);
    expect(result.current.status).toBe("muted");

    act(() => result.current.end());

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("ended");

    act(() => result.current.clearTranscript());

    expect(result.current.transcript).toEqual({ segments: [] });
  });

  it("disconnects immediately when OpenAI emits a realtime error event", async () => {
    const disconnect = vi.fn();
    const sendEvent = vi.fn();
    let onEvent: ((event: unknown) => void) | undefined;
    const connect = vi.fn(
      async (options: ConnectOpenAiRealtimeWebRtcOptions) => {
        onEvent = options.onEvent;
        return {
          dataChannel: {} as RTCDataChannel,
          disconnect,
          localStream: {} as MediaStream,
          peerConnection: {} as RTCPeerConnection,
          remoteAudio: {} as HTMLAudioElement,
          sendEvent,
          setMuted: vi.fn(),
        };
      }
    );

    const { result } = renderHook(() =>
      useOpenAiRealtimeVoiceSession({ connect })
    );

    await act(async () => {
      await result.current.start();
    });
    act(() =>
      onEvent?.({
        error: { message: "Invalid tool name: contacts_apply_draft_patch" },
        type: "error",
      })
    );

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe(
      "Invalid tool name: contacts_apply_draft_patch"
    );
    expect(result.current.status).toBe("error");
  });

  it("configures realtime tools and returns tool outputs to the model", async () => {
    const disconnect = vi.fn();
    const sendEvent = vi.fn();
    let onEvent: ((event: unknown) => void) | undefined;
    const executeTool = vi.fn(async () => ({ ok: true }));
    const connect = vi.fn(
      async (options: ConnectOpenAiRealtimeWebRtcOptions) => {
        onEvent = options.onEvent;
        return {
          dataChannel: {} as RTCDataChannel,
          disconnect,
          localStream: {} as MediaStream,
          peerConnection: {} as RTCPeerConnection,
          remoteAudio: {} as HTMLAudioElement,
          sendEvent,
          setMuted: vi.fn(),
        };
      }
    );

    const { result } = renderHook(() =>
      useOpenAiRealtimeVoiceSession({
        connect,
        executeTool,
        tools: [
          {
            description: "Navigate",
            name: "navigate",
            parameters: { type: "object" },
          },
        ],
      })
    );

    await act(async () => {
      await result.current.start();
    });

    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({
        clientEvents: [
          {
            session: {
              type: "realtime",
              tool_choice: "auto",
              tools: [
                {
                  description: "Navigate",
                  name: "navigate",
                  parameters: { type: "object" },
                  type: "function",
                },
              ],
            },
            type: "session.update",
          },
        ],
      })
    );

    act(() =>
      onEvent?.({
        response: {
          output: [
            {
              arguments: '{"to":"/mdl/tasks"}',
              call_id: "call-1",
              name: "navigate",
              type: "function_call",
            },
          ],
        },
        type: "response.done",
      })
    );

    await vi.waitFor(() =>
      expect(sendEvent).toHaveBeenCalledWith({
        item: {
          call_id: "call-1",
          output: '{"ok":true}',
          type: "function_call_output",
        },
        type: "conversation.item.create",
      })
    );
    expect(sendEvent).toHaveBeenCalledWith({ type: "response.create" });
  });
});

describe("realtime voice frontend tools", () => {
  it("aliases AG-UI frontend tool names that OpenAI function tools reject", async () => {
    const tool = {
      description: "Apply a contact draft patch",
      metadata: {
        engenty: {
          availability: "enabled",
          safety: "safe",
        },
      },
      name: "contacts.applyDraftPatch",
      parameters: { type: "object" },
    } as any;
    const alias = openAiRealtimeVoiceFrontendToolName(tool);

    expect(alias).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    expect(alias).not.toBe(tool.name);
    expect(openAiRealtimeVoiceToolsFromFrontendTools([tool])).toEqual([
      {
        description: tool.description,
        name: alias,
        parameters: tool.parameters,
      },
    ]);

    const executeFrontendTool = vi.fn(() => ({ ok: true }) as const);

    await expect(
      executeOpenAiRealtimeVoiceFrontendTool({
        executeFrontendTool,
        request: {
          arguments: { patch: [] },
          callId: "call-1",
          name: alias,
        },
        runId: "run-1",
        tools: [tool],
      })
    ).resolves.toEqual({ ok: true });

    expect(executeFrontendTool).toHaveBeenCalledWith({
      call_id: "call-1",
      input: { patch: [] },
      requires_confirmation: false,
      run_id: "run-1",
      tool_name: "contacts.applyDraftPatch",
    });
  });
});

describe("openAiRealtimeVoiceToolCallsFromOpenAiEvent", () => {
  it("extracts function calls from response.done", () => {
    expect(
      openAiRealtimeVoiceToolCallsFromOpenAiEvent({
        response: {
          output: [
            {
              arguments: '{"to":"/mdl/tasks"}',
              call_id: "call-1",
              name: "navigate",
              type: "function_call",
            },
          ],
        },
        type: "response.done",
      })
    ).toEqual([
      {
        arguments: { to: "/mdl/tasks" },
        callId: "call-1",
        name: "navigate",
      },
    ]);
  });
});

describe("openAiRealtimeVoiceSessionToolEvents", () => {
  it("creates a session.update event for callable tools", () => {
    expect(
      openAiRealtimeVoiceSessionToolEvents([
        { description: "Navigate", name: "navigate" },
      ])
    ).toEqual([
      {
        session: {
          type: "realtime",
          tool_choice: "auto",
          tools: [
            {
              description: "Navigate",
              name: "navigate",
              parameters: { type: "object" },
              type: "function",
            },
          ],
        },
        type: "session.update",
      },
    ]);
  });
});
