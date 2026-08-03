"use client";

import { useQuery } from "@engenty/query-client";
import { AppArtifactView } from "./app-artifact-view.js";
import {
  getArtifact,
  resolveEngentyAiServiceBaseUrlSafe,
} from "./artifacts-api.js";

/**
 * A built App, rendered inline in the chat transcript. The artifact pane
 * remains the full-size home; this is the Executor-style "the deliverable
 * appears in the conversation" rendering. Same renderer as the pane
 * (AppArtifactView), so the review banner — the consent surface — shows up
 * right in the chat when the version is still proposed.
 */
export function InlineAppArtifact({ artifactId }: { artifactId: string }) {
  const query = useQuery({
    enabled: Boolean(artifactId),
    queryFn: () =>
      getArtifact({
        artifactId,
        serviceBaseUrl: resolveEngentyAiServiceBaseUrlSafe(),
      }),
    queryKey: ["artifact-inline", artifactId],
    staleTime: 60_000,
  });

  const data = query.data;
  // Anything that is not a loadable app artifact renders nothing — the tool
  // card's normal summary is already on screen, so failing quiet beats a
  // broken frame in the middle of the conversation.
  if (data?.artifact.type !== "app") {
    return null;
  }
  return (
    <div className="mt-2 flex h-105 flex-col overflow-hidden rounded-lg border bg-background">
      <AppArtifactView
        artifact={data.artifact}
        content={data.version.content}
      />
    </div>
  );
}

/** The delegate tool's marker for "the child built an App". */
export function readDelegatedAppArtifactId(output: unknown): string | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  const id = (output as { app_artifact_id?: unknown }).app_artifact_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** A direct app_build tool result that published a preview artifact. */
export function readAppBuildArtifactId(output: unknown): string | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  const record = output as {
    app_id?: unknown;
    artifact_id?: unknown;
    status?: unknown;
  };
  if (
    typeof record.app_id === "string" &&
    typeof record.artifact_id === "string" &&
    (record.status === "built" || record.status === "published")
  ) {
    return record.artifact_id;
  }
  return null;
}
