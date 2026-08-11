// Per-run runtime context, injected at the TAIL of the message list instead of
// into the system prompt.
//
// Why it cannot live in the instructions: the block is the most volatile text
// in the request — pathname, selection, list filters/search/total, row
// previews, the core-fetched workspace context and module list. Mastra folds
// controller instructions (and `instructionExtras.appendBodies`) into the run's
// system prompt, which is the HEAD of the provider's cacheable prefix. Every
// navigation, row selection or filter change therefore rewrote the prefix and
// invalidated everything behind it — including the ~8k of recalled history and,
// depending on how the provider serializes tools, the ~9k tool block.
//
// Placed here, the prefix (system + tools + history) is byte-identical from
// turn to turn and only the tail is new. This mirrors what the generate lane
// has always done in `buildNativeMastraModelInput`: a system message directly
// before the current user turn.
import type { MastraDBMessage } from "@mastra/core/agent";
import type { Processor } from "@mastra/core/processors";

export const RUNTIME_CONTEXT_PROCESSOR_NAME = "engenty-runtime-context";

function buildRuntimeContextMessage(text: string): MastraDBMessage {
  return {
    content: {
      format: 2,
      parts: [{ type: "text", text }],
    },
    createdAt: new Date(),
    id: `runtime-context-${crypto.randomUUID()}`,
    role: "system",
  } as MastraDBMessage;
}

/**
 * Append the run's runtime context immediately before the current user turn.
 *
 * Never persisted: processors run on the model input, so the block does not
 * enter memory and a thread does not accumulate one stale snapshot per turn.
 */
export function createRuntimeContextProcessor(instructions: string): Processor {
  const text = instructions.trim();
  return {
    id: RUNTIME_CONTEXT_PROCESSOR_NAME,
    name: RUNTIME_CONTEXT_PROCESSOR_NAME,
    processInput: ({ messages }) => {
      if (!text) {
        return messages;
      }
      const message = buildRuntimeContextMessage(text);
      // Before the trailing user turn, not after it: the model reads the last
      // message as the thing to answer, and that must stay the user's words.
      const lastIndex = messages.length - 1;
      if (lastIndex >= 0 && messages[lastIndex]?.role === "user") {
        return [...messages.slice(0, lastIndex), message, messages[lastIndex]];
      }
      return [...messages, message];
    },
  };
}
