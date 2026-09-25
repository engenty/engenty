// The chat half of a stored result: an A2UI card whose Open button opens the
// whole artifact in the side pane. The asset stands in Artifacts; the chat
// carries a card of it — composed in result-card.ts.

import { randomUUID } from "node:crypto";
import { assembleSurface } from "@engenty/generative-a2ui/spec";
import { buildUiSurface } from "../../../ai/tools/show-ui-tool.js";
import { openButton, type ResultCard } from "./result-card.js";

export type { ResultCard } from "./result-card.js";

export interface ArtifactTeaser {
  /** The composed card; without it the card is the Open button alone. */
  card?: ResultCard | null;
  id: string;
  title: string;
}

/**
 * A stored `show_ui` result: the transcript renders it with the A2UI card,
 * the same one an agent's own teaser draws.
 */
export function artifactTeaserPart(teaser: ArtifactTeaser) {
  const card =
    teaser.card ??
    assembleSurface({ candidates: [openButton(teaser.id)], kept: [] });
  const surface = buildUiSurface({
    artifact_id: teaser.id,
    components: card.components,
    data: card.data,
    title: teaser.title,
  });
  return {
    toolInvocation: {
      args: { title: teaser.title },
      result: surface,
      state: "result",
      // One id per card: every run of a same-title page points at the same
      // artifact, and a shared id makes the chat show the newest card in
      // every one of them.
      toolCallId: `result-teaser-${randomUUID()}`,
      toolName: "show_ui",
    },
    type: "tool-invocation",
  };
}
