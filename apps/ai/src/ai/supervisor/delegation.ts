import type {
  DelegationConfig,
  MastraDBMessage,
  MastraMessagePart,
} from "@mastra/core/agent";

const MAX_SUMMARY_MESSAGES = 8;
const MAX_SUMMARY_CHARS = 1800;

function textFromPart(part: MastraMessagePart): string {
  if (part.type === "text" && typeof part.text === "string") {
    return part.text;
  }
  return "";
}

function textFromMessage(message: MastraDBMessage): string {
  const parts = Array.isArray(message.content?.parts)
    ? message.content.parts
    : [];
  return parts
    .map(textFromPart)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function trimSummary(summary: string): string {
  if (summary.length <= MAX_SUMMARY_CHARS) {
    return summary;
  }
  return `${summary.slice(0, MAX_SUMMARY_CHARS - 3).trimEnd()}...`;
}

export function summarizeDelegationMessages(
  messages: readonly MastraDBMessage[]
): string {
  const lines = messages
    .filter(
      (message) => message.role === "user" || message.role === "assistant"
    )
    .slice(-MAX_SUMMARY_MESSAGES)
    .map((message) => {
      const text = textFromMessage(message);
      return text ? `${message.role}: ${text}` : "";
    })
    .filter(Boolean);

  return trimSummary(
    lines.length > 0
      ? lines.join("\n")
      : "No prior user-visible chat messages were available."
  );
}

export function createDelegationSummaryMessage(input: {
  parentAgentId: string;
  primitiveId: string;
  summary: string;
  threadId?: string;
  resourceId?: string;
}): MastraDBMessage {
  const text = [
    "Previous conversation summary for this handoff:",
    input.summary,
  ].join("\n");
  return {
    content: {
      format: 2,
      content: text,
      parts: [
        {
          text,
          type: "text",
        },
      ],
    },
    createdAt: new Date(0),
    id: `delegation-summary:${input.parentAgentId}:${input.primitiveId}`,
    ...(input.resourceId ? { resourceId: input.resourceId } : {}),
    role: "system",
    ...(input.threadId ? { threadId: input.threadId } : {}),
  };
}

export function createEngentySupervisorDelegationConfig(): DelegationConfig {
  return {
    messageFilter: (context) => [
      createDelegationSummaryMessage({
        parentAgentId: context.parentAgentId,
        primitiveId: context.primitiveId,
        resourceId: context.resourceId,
        summary: summarizeDelegationMessages(context.messages),
        threadId: context.threadId,
      }),
    ],
    // Do NOT bail on success: the supervisor must generate a follow-up turn
    // to present sub-agent results (e.g. CliExecutionReport summary, tool
    // output) to the user in natural language. Bailing here leaves the chat
    // stuck after background tasks complete because no summary is generated.
  };
}
