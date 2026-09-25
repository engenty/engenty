"use client";

import {
  FileDownloadsToolCallCard,
  matchesFileDownloadsToolCall,
  registerDefaultToolCallUiCards,
  registerToolCallUi,
} from "@engenty/ai-ui";
import {
  ArtifactToolCallCard,
  matchesArtifactToolCall,
} from "./components/chat/artifact-tool-call-card.js";
import {
  matchesSubAgentSessionOutput,
  SubAgentSessionToolCallCard,
} from "./components/chat/sub-agent-session-tool-call-card.js";

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

  // Legacy transcripts only — see file-download-offer.ts.
  registerToolCallUi({
    id: "engenty-copilot.file-downloads",
    priority: 45,
    match: (ctx) => matchesFileDownloadsToolCall(ctx),
    Card: FileDownloadsToolCallCard,
  });

  registerToolCallUi({
    id: "engenty-copilot.artifact",
    priority: 45,
    match: (ctx) => matchesArtifactToolCall(ctx),
    Card: ArtifactToolCallCard,
    standalone: true,
  });
}
