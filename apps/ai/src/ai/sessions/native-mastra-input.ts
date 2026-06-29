import type { RunAgentInput } from "@engenty/ag-ui-bridge";
import type { ModelMessage, SystemModelMessage, UserModelMessage } from "ai";
import type { AgentSessionMessageRow } from "../../dal/agent-sessions/index.js";
import { AiSessionError } from "../errors.js";
import { resumePayloadToModelContent } from "./interrupts.js";

// Stage 3 slim prompt: runtime instructions + current turn (or resume nudge) only.
// Mastra Memory and MessageList own history recall and model-prompt assembly.
export function findCurrentUserTurn(
  rows: AgentSessionMessageRow[]
): AgentSessionMessageRow | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row?.role === "user") {
      return row;
    }
  }
  return null;
}

export function buildNativeMastraModelInput(params: {
  currentUserTurn?: AgentSessionMessageRow | null;
  resume?: NonNullable<RunAgentInput["resume"]>;
  runtimeContextInstructions?: string;
  // AG-UI submits the current turn in the request; Mastra Memory persists it.
  submittedUserParts?: unknown;
  threadId: string;
}): ModelMessage[] {
  const result: ModelMessage[] = [];
  const systemContent = params.runtimeContextInstructions?.trim();
  if (systemContent) {
    result.push({
      role: "system",
      content: systemContent,
    } satisfies SystemModelMessage);
  }

  if (params.resume?.length) {
    result.push({
      role: "user",
      content: resumePayloadToModelContent(params.resume[0]!),
    } satisfies UserModelMessage);
    return result;
  }

  const userParts =
    params.submittedUserParts ?? params.currentUserTurn?.parts ?? null;
  if (!userParts) {
    throw new AiSessionError(
      "agent_threads.missingUserInput",
      "Session runs require a current user message",
      { thread_id: params.threadId }
    );
  }

  result.push({
    role: "user",
    content: userParts as UserModelMessage["content"],
  } satisfies UserModelMessage);
  return result;
}
