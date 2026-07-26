import type { CascadeServerMessage } from "@engenty/ai-core";

/**
 * STT → agent → TTS turn loop with barge-in. Pure orchestration: the vendor
 * legs and the agent are injected, so this is fully unit-testable. One
 * orchestrator instance per WS connection.
 */

export interface CascadeSttLeg {
  close: () => void;
  write: (audioBase64: string) => void;
}

export interface CascadeTtsLeg {
  /** Stop the in-flight synthesis immediately (barge-in). */
  cancel: () => void;
  close: () => void;
  /** Signal end of the assistant turn so trailing audio flushes. */
  flush: () => void;
  speak: (textDelta: string) => void;
}

export interface CascadeAgentTurnInput {
  signal: AbortSignal;
  text: string;
}

/** Streams assistant text deltas; resolves when the turn completes. */
export type CascadeAgentTurn = (
  input: CascadeAgentTurnInput
) => AsyncIterable<string>;

export interface CascadeOrchestratorOptions {
  runAgentTurn: CascadeAgentTurn;
  send: (message: CascadeServerMessage) => void;
  tts: CascadeTtsLeg;
}

export interface CascadeOrchestrator {
  close: () => void;
  /** Feed STT results (partial or final) into the turn loop. */
  onUserTranscript: (update: { final: boolean; text: string }) => void;
}

export function createCascadeOrchestrator({
  runAgentTurn,
  send,
  tts,
}: CascadeOrchestratorOptions): CascadeOrchestrator {
  let activeTurn: AbortController | null = null;
  let assistantSpeaking = false;
  let closed = false;

  const bargeIn = () => {
    if (activeTurn) {
      activeTurn.abort();
      activeTurn = null;
    }
    if (assistantSpeaking) {
      tts.cancel();
      assistantSpeaking = false;
      send({ type: "status", status: "listening" });
    }
  };

  const runTurn = async (text: string) => {
    const controller = new AbortController();
    activeTurn = controller;
    assistantSpeaking = true;
    send({ type: "status", status: "speaking" });
    try {
      for await (const delta of runAgentTurn({
        signal: controller.signal,
        text,
      })) {
        if (controller.signal.aborted || closed) {
          return;
        }
        send({
          type: "transcript",
          mode: "append",
          role: "assistant",
          text: delta,
        });
        tts.speak(delta);
      }
      if (!(controller.signal.aborted || closed)) {
        tts.flush();
      }
    } catch (error) {
      if (!(controller.signal.aborted || closed)) {
        send({
          type: "error",
          message:
            error instanceof Error ? error.message : "Voice agent turn failed",
        });
      }
    } finally {
      if (activeTurn === controller) {
        activeTurn = null;
        assistantSpeaking = false;
        if (!closed) {
          send({ type: "status", status: "listening" });
        }
      }
    }
  };

  return {
    close: () => {
      closed = true;
      activeTurn?.abort();
      activeTurn = null;
      tts.close();
    },
    onUserTranscript: ({ final, text }) => {
      if (closed) {
        return;
      }
      // Any user speech while the assistant is talking interrupts it — the
      // model must stop, exactly like OpenAI's server-side barge-in.
      if (assistantSpeaking || activeTurn) {
        bargeIn();
        send({ type: "speech-started" });
      }
      send({
        type: "transcript",
        done: final,
        mode: "replace",
        role: "user",
        text,
      });
      if (final && text.trim()) {
        void runTurn(text);
      }
    },
  };
}
