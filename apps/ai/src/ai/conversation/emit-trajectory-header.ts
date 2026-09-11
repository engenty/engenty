// Snapshot the SYSTEM + CONTEXT header for a run — one CUSTOM event the
// Trajectory projector already folds. Recalled thread *bodies* stay on
// `thread_message`; this turn stores pointers + a short preview so a later
// compaction still shows what the model actually recalled.
import {
  type AGUIEvent,
  ENGENTY_DEBUG_INITIAL_PROMPT_EVENT,
  EventType,
  type RecalledMessagePointer,
} from "@engenty/ag-ui-bridge";
import { logAiPromptInput } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { MastraMemory } from "@mastra/core/memory";
import {
  describePromptMessage,
  resolveAgentInstructions,
} from "../sessions/prompt-preview.js";
import { readMastraAuthorUserId } from "../sessions/speaker-turn-processor.js";

const logger = createLogger({ name: "apps/ai/trajectory" });
const PREVIEW_CHARS = 100;
const SPEAKER_TURN_OPEN = /^<turn\b[^>]*>\s*/i;
const SPEAKER_TURN_CLOSE = /\s*<\/turn>\s*$/i;

function stripSpeakerTurnPreview(preview: string): string {
  return preview
    .replace(SPEAKER_TURN_OPEN, "")
    .replace(SPEAKER_TURN_CLOSE, "")
    .trim();
}

function authorUserIdForPointer(message: unknown): string | null {
  const authorId = readMastraAuthorUserId(message);
  return authorId ?? null;
}

export async function listKnownToolNames(
  agent: object,
  extraTools: object = {}
): Promise<string[]> {
  const fromAgent: string[] = [];
  try {
    // Call it ON the agent: Mastra's listTools reads the private `#tools`
    // field, so an extracted, unbound reference throws. Same trap
    // `resolveAgentInstructions` documents for getInstructions.
    const withListTools = agent as {
      listTools?: (args?: unknown) => unknown;
    };
    if (typeof withListTools.listTools === "function") {
      const tools = await Promise.resolve(withListTools.listTools({}));
      if (tools && typeof tools === "object") {
        fromAgent.push(...Object.keys(tools));
      }
    }
  } catch (err) {
    // An empty set degrades the correction rather than failing the turn.
    console.error("[trajectory] listTools failed:", err);
  }
  return [...new Set([...fromAgent, ...Object.keys(extraTools)])];
}

export function toRecalledMessagePointers(
  messages: readonly unknown[]
): RecalledMessagePointer[] {
  return messages.map((message) => {
    const described = describePromptMessage(message);
    return {
      authorUserId: authorUserIdForPointer(message),
      chars: described.chars,
      id: described.id,
      preview: stripSpeakerTurnPreview(described.text)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, PREVIEW_CHARS),
      role: described.role,
    };
  });
}

export async function recallTrajectoryMessagePointers(input: {
  memory: Pick<MastraMemory, "recall"> | null;
  resourceId: string;
  threadId: string;
}): Promise<RecalledMessagePointer[]> {
  if (!input.memory) {
    return [];
  }
  try {
    const recalled = await input.memory.recall({
      resourceId: input.resourceId,
      threadId: input.threadId,
    });
    return toRecalledMessagePointers(recalled?.messages ?? []);
  } catch (err) {
    console.error("[trajectory] recall for message pointers failed:", err);
    return [];
  }
}

export async function emitTrajectoryHeader(input: {
  agent: object;
  emit: (event: AGUIEvent) => void;
  extraSystemNote?: string;
  modelId?: string | null;
  recalledMessages?: readonly RecalledMessagePointer[];
  runtimeInstructions: string;
  toolNames: readonly string[];
  userMessage?: string;
}): Promise<void> {
  try {
    let assembled = "";
    try {
      assembled = await resolveAgentInstructions(input.agent);
    } catch (err) {
      console.error("[trajectory] getInstructions failed:", err);
    }
    const extra = input.extraSystemNote?.trim() ?? "";
    const systemInstructions = [assembled, extra].filter(Boolean).join("\n\n");
    const runtimeContextInstructions = input.runtimeInstructions.trim();
    const toolNames = input.toolNames.filter(
      (name) => typeof name === "string" && name.trim() !== ""
    );
    const recalledMessages = [...(input.recalledMessages ?? [])];
    if (
      !(
        systemInstructions ||
        runtimeContextInstructions ||
        toolNames.length > 0 ||
        recalledMessages.length > 0
      )
    ) {
      return;
    }
    input.emit({
      name: ENGENTY_DEBUG_INITIAL_PROMPT_EVENT,
      type: EventType.CUSTOM,
      value: {
        runtimeContextInstructions,
        systemInstructions,
        toolNames,
        ...(recalledMessages.length > 0 ? { recalledMessages } : {}),
      },
    } as AGUIEvent);
    logAiPromptInput(logger, {
      event: "trajectory.initial_prompt",
      message: "Trajectory header",
      modelId: input.modelId ?? undefined,
      recalled_message_count: recalledMessages.length,
      runtime_context: runtimeContextInstructions,
      systemPrompt: systemInstructions,
      tool_names: toolNames,
      userMessage: input.userMessage,
    });
  } catch (err) {
    console.error("[trajectory] emitTrajectoryHeader failed:", err);
  }
}
