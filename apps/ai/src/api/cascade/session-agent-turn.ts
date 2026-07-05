import { GENERAL_CHAT_AGENT_ID } from "@engenty/ai-core";
import type { CascadeAgentTurn } from "./orchestrator.js";

/**
 * Agent leg of the cascade: one voice session thread per WS connection,
 * append + generate per utterance — the same tenant agent (tools, memory,
 * usage limits) that powers the copilot, per the locked plan decision.
 *
 * v1 yields the completed turn text in one chunk; switching to Mastra's
 * streaming API is the known latency follow-up (TTS already streams).
 */

export interface CascadeSessionScope {
  tenantId: string;
  userId: string;
}

/** Structural slice of aiService.sessions the voice turn needs. */
export interface CascadeSessionsService {
  appendMessage(input: {
    parts: unknown;
    role: "user";
    scope: CascadeSessionScope;
    threadId: string;
  }): Promise<unknown>;
  createSession(input: {
    agentId: string;
    scope: CascadeSessionScope;
    title?: string | null;
  }): Promise<{ session: { id?: string; thread_id?: string } }>;
  generate(input: {
    scope: CascadeSessionScope;
    threadId: string;
  }): Promise<{ text: string }>;
}

export interface CreateSessionAgentTurnOptions {
  agentId?: string;
  instructions?: string;
  scope: CascadeSessionScope;
  sessions: CascadeSessionsService;
}

export function createSessionAgentTurn({
  agentId = GENERAL_CHAT_AGENT_ID,
  instructions,
  scope,
  sessions,
}: CreateSessionAgentTurnOptions): CascadeAgentTurn {
  let threadIdPromise: Promise<string> | null = null;

  const ensureThread = (): Promise<string> => {
    threadIdPromise ??= sessions
      .createSession({ agentId, scope, title: "Voice call" })
      .then(({ session }) => {
        const threadId = session.thread_id ?? session.id;
        if (!threadId) {
          throw new Error("Voice session thread could not be created");
        }
        return threadId;
      })
      .then(async (threadId) => {
        if (instructions) {
          await sessions.appendMessage({
            parts: [{ text: instructions, type: "text" }],
            role: "user",
            scope,
            threadId,
          });
        }
        return threadId;
      });
    return threadIdPromise;
  };

  return async function* runTurn({ signal, text }) {
    const threadId = await ensureThread();
    if (signal.aborted) {
      return;
    }
    await sessions.appendMessage({
      parts: [{ text, type: "text" }],
      role: "user",
      scope,
      threadId,
    });
    if (signal.aborted) {
      return;
    }
    const { text: reply } = await sessions.generate({ scope, threadId });
    if (!signal.aborted && reply) {
      yield reply;
    }
  };
}
