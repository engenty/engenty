"use client";

import {
  activateArtifact,
  ENGENTY_COPILOT_HOST_KEY,
  type ToolCallCardProps,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { FileText } from "lucide-react";

function readArtifactId(output: unknown): string | null {
  if (output && typeof output === "object" && "artifact_id" in output) {
    const id = (output as { artifact_id?: unknown }).artifact_id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

// Only claim calls that produced an artifact — pending/failed calls fall
// through to the generic card so its spinner and error state still render.
export function matchesArtifactToolCall(ctx: {
  output?: unknown;
  toolName: string;
}): boolean {
  return (
    ctx.toolName === "artifact_write" && readArtifactId(ctx.output) !== null
  );
}

/** Compact card for a successful artifact_write: opens it in the pane. */
export function ArtifactToolCallCard(props: ToolCallCardProps) {
  const { t } = useTranslation("engenty-copilot");
  const artifactId = readArtifactId(props.output);
  if (!artifactId) {
    return null;
  }
  return (
    <div className="ui-canvas-raised flex items-center gap-2.5 rounded-md bg-card px-3 py-2">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm">
        {props.displayLabel ?? t("chat.artifactReady")}
      </span>
      <Button
        onClick={() => activateArtifact(ENGENTY_COPILOT_HOST_KEY, artifactId)}
        size="sm"
        variant="outline"
      >
        {t("chat.openArtifact")}
      </Button>
    </div>
  );
}
