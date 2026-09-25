/** Flatten copilot transcript messages into pasteable plain text. */

export function extractCopilotMessageCopyText(
  parts: readonly unknown[] | undefined
): string {
  const chunks: string[] = [];
  for (const part of parts ?? []) {
    if (!part || typeof part !== "object") {
      continue;
    }
    const candidate = part as { text?: unknown; type?: unknown };
    if (
      (candidate.type === "text" || candidate.type === "reasoning") &&
      typeof candidate.text === "string"
    ) {
      const text = candidate.text.trim();
      if (text) {
        chunks.push(text);
      }
    }
  }
  return chunks.join("\n\n").trim();
}

export function formatCopilotThreadCopyText(
  messages: readonly { parts?: readonly unknown[]; role: string }[]
): string {
  const blocks: string[] = [];
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") {
      continue;
    }
    const text = extractCopilotMessageCopyText(message.parts);
    if (!text) {
      continue;
    }
    const label = message.role === "user" ? "User" : "Assistant";
    blocks.push(`${label}:\n${text}`);
  }
  return blocks.join("\n\n");
}

/** The thread as Markdown: one `## User` / `## Assistant` section per turn. */
export function formatCopilotThreadMarkdown(
  messages: readonly { parts?: readonly unknown[]; role: string }[]
): string {
  const sections: string[] = [];
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") {
      continue;
    }
    const text = extractCopilotMessageCopyText(message.parts);
    if (!text) {
      continue;
    }
    sections.push(
      `## ${message.role === "user" ? "User" : "Assistant"}\n\n${text}`
    );
  }
  return sections.join("\n\n");
}
