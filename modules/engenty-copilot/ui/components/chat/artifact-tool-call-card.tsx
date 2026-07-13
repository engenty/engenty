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

export function matchesArtifactToolCall(toolName: string): boolean {
  return toolName === "artifact_create" || toolName === "artifact_update";
}

/** Compact card for artifact_create / artifact_update: opens it in the pane. */
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
