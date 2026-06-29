"use client";

import {
  FileDownloadsToolCallCard,
  matchesFileDownloadsToolCall,
  registerDefaultToolCallUiCards,
  registerToolCallUi,
} from "@engenty/ai-ui";
import {
  matchesGenerativeUiOutput,
  matchesSubAgentSessionOutput,
  SubAgentSessionToolCallCard,
  ToolCallGenerativeUiCard,
} from "./components/chat/tool-call-generative-ui-card.js";

let registered = false;

export function registerEngentyCopilotToolCallUi() {
  if (registered) {
    return;
  }
  registered = true;
  registerDefaultToolCallUiCards();

  registerToolCallUi({
    id: "engenty-copilot.sub-agent-session",
    priority: 40,
    match: (ctx) => matchesSubAgentSessionOutput(ctx.output),
    Card: SubAgentSessionToolCallCard,
  });

  registerToolCallUi({
    id: "engenty-copilot.generative-ui",
    priority: 40,
    match: (ctx) => matchesGenerativeUiOutput(ctx.output),
    Card: ToolCallGenerativeUiCard,
  });

  registerToolCallUi({
    id: "engenty-copilot.file-downloads",
    priority: 45,
    match: (ctx) => matchesFileDownloadsToolCall(ctx),
    Card: FileDownloadsToolCallCard,
  });
}
