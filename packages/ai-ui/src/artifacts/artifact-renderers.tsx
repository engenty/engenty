import { useTranslation } from "@engenty/i18n/ui";
import { Shapes } from "lucide-react";
import type { ComponentType } from "react";
import type { EngentyArtifact } from "./artifact-store";

/**
 * Renderer registry: artifact `type` → view component, same shape as the
 * tool-call UI registry. Real artifact types (mcp-app, generative-ui,
 * document) register here when the artifact backend lands.
 */
export interface ArtifactViewProps {
  artifact: EngentyArtifact;
}

const renderers = new Map<string, ComponentType<ArtifactViewProps>>();

export function registerArtifactRenderer(
  type: string,
  Component: ComponentType<ArtifactViewProps>
): () => void {
  renderers.set(type, Component);
  return () => {
    renderers.delete(type);
  };
}

export function resolveArtifactRenderer(
  type: string
): ComponentType<ArtifactViewProps> | null {
  return renderers.get(type) ?? null;
}

export const PLACEHOLDER_ARTIFACT_TYPE = "placeholder";

/** Dev/demo view for the placeholder artifact type. */
function PlaceholderArtifactView({ artifact }: ArtifactViewProps) {
  const { t } = useTranslation("ai-ui");
  const body = typeof artifact.payload === "string" ? artifact.payload : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-8 text-center">
      <Shapes className="h-8 w-8 text-muted-foreground/60" />
      <p className="font-medium text-base">{artifact.title}</p>
      {body ? (
        <p className="max-w-md text-muted-foreground text-sm">{body}</p>
      ) : null}
      <p className="max-w-md text-muted-foreground/70 text-xs">
        {t("artifacts.placeholderHint")}
      </p>
    </div>
  );
}

registerArtifactRenderer(PLACEHOLDER_ARTIFACT_TYPE, PlaceholderArtifactView);
