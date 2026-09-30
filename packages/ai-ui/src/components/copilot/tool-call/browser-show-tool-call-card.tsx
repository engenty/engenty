"use client";

import { readAgUiBrowserPreview } from "@engenty/ag-ui-bridge";
import { BrowserChatWidget } from "../../../features/browser/browser-chat-widget.js";
import { DecisionArtifactToolCallCard } from "./decision-artifact-tool-call-card";
import type { ToolCallCardProps } from "./tool-call-card.types";
import { asRecord } from "./tool-call-card-utils";

export const BROWSER_SHOW_TOOL_NAME = "browser_show";

/**
 * `browser_show`: the agent's browser window as the tool's output — setup,
 * live view or a marked-up screenshot. Asked with a question, the call parks
 * on a decision instead and has no view in its output: the decision card
 * draws it (from the open interrupt), then the answer.
 */
export function BrowserShowToolCallCard(props: ToolCallCardProps) {
  const output = asRecord(props.output);
  const preview = readAgUiBrowserPreview(output?.browser_view);
  if (!preview || preview.kind === "browser_credentials") {
    return <DecisionArtifactToolCallCard {...props} />;
  }
  const caption =
    typeof output?.caption === "string" ? output.caption : undefined;
  return (
    <div className="my-1 w-full max-w-2xl">
      <BrowserChatWidget
        autoConnect={props.isLiveRun === true}
        caption={caption}
        preview={preview}
      />
    </div>
  );
}
