"use client";

import {
  activateArtifact,
  ENGENTY_COPILOT_HOST_KEY,
  type ToolCallCardProps,
  useOptionalAgentHost,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { FileText } from "lucide-react";
import { useEffect } from "react";

function readArtifactId(output: unknown): string | null {
  if (output && typeof output === "object" && "artifact_id" in output) {
    const id = (output as { artifact_id?: unknown }).artifact_id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

function readArtifactTitle(output: unknown): string | null {
  if (output && typeof output === "object" && "title" in output) {
    const title = (output as { title?: unknown }).title;
    return typeof title === "string" && title.trim() ? title.trim() : null;
  }
  return null;
}

// `show_artifact` is a PRESENTATION tool: the server returns a handle and each
// surface renders it however it can (this pane, a link on a messaging channel,
// nothing headless). Only `show_artifact` opens the pane by itself — a fresh
// `artifact_write` already surfaces through useArtifactListSync, so auto-opening
// it here would fight that policy and steal focus mid-turn.
const PRESENT_ON_ARRIVAL = new Set(["show_artifact"]);

// One activation per tool call, even across remounts (transcript virtualization
// re-mounts rows). Mirrors the object-render card's executedDisplayHints.
const presented = new Set<string>();

function isArtifactToolName(name: string | undefined): boolean {
  return name === "artifact_write" || name === "show_artifact";
}

// Only claim calls that produced an artifact — pending/failed calls fall
// through to the generic card so its spinner and error state still render.
export function matchesArtifactToolCall(ctx: {
  output?: unknown;
  resolvedToolName?: string;
  toolName: string;
}): boolean {
  return (
    (isArtifactToolName(ctx.toolName) ||
      isArtifactToolName(ctx.resolvedToolName)) &&
    readArtifactId(ctx.output) !== null
  );
}

/**
 * Compact card for a successful artifact_write / show_artifact: opens it in the
 * pane of the host this transcript belongs to. The host comes from context, so
 * a specialist's Agent Desk opens its OWN pane — the previous frontend-tool
 * handler addressed the global copilot host and popped the wrong surface.
 */
export function ArtifactToolCallCard(props: ToolCallCardProps) {
  const { t } = useTranslation("engenty-copilot");
  const host = useOptionalAgentHost();
  const hostKey = host?.hostKey ?? ENGENTY_COPILOT_HOST_KEY;
  const artifactId = readArtifactId(props.output);
  const toolName = props.resolvedToolName ?? props.toolName;
  const isLiveRun = props.isLiveRun ?? false;
  const state = props.state ?? "completed";

  useEffect(() => {
    // A replayed transcript must not re-open panes on load, so gate on the run
    // having streamed in this session.
    if (
      !(artifactId && isLiveRun) ||
      state !== "completed" ||
      !PRESENT_ON_ARRIVAL.has(toolName)
    ) {
      return;
    }
    const onceKey = `${hostKey}:${props.toolCallId ?? artifactId}`;
    if (presented.has(onceKey)) {
      return;
    }
    presented.add(onceKey);
    activateArtifact(hostKey, artifactId);
  }, [artifactId, hostKey, isLiveRun, props.toolCallId, state, toolName]);

  if (!artifactId) {
    return null;
  }
  return (
    <div className="ui-canvas-raised flex items-center gap-2.5 rounded-md bg-card px-3 py-2">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm">
        {readArtifactTitle(props.output) ??
          props.displayLabel ??
          t("chat.artifactReady")}
      </span>
      <Button
        onClick={() => activateArtifact(hostKey, artifactId)}
        size="sm"
        variant="outline"
      >
        {t("chat.openArtifact")}
      </Button>
    </div>
  );
}
