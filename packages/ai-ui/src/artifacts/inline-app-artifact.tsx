"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Button } from "@engenty/ui-core";
import { SquareArrowOutUpRight } from "lucide-react";
import { useOptionalAgentHost } from "../agent-provider/engenty-agent.js";
import { AppArtifactView } from "./app-artifact-view.js";
import { activateArtifact } from "./artifact-store.js";
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
  const { t } = useTranslation("ai-ui");
  // Sends the App to the thread's artifact panel — beside the conversation,
  // not over it, which is why the control is a panel and not a fullscreen
  // expand. Outside an agent boundary (a preview, a story) there is no panel
  // to send it to, so it simply is not there.
  const host = useOptionalAgentHost();
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
    // Tall enough that the consent banner and the running App both fit: the
    // banner grew from a row of chips into a read-through of what the App may
    // do, and at the old 420px it pushed the preview out of the box entirely.
    <div className="relative mt-2 flex h-[34rem] flex-col overflow-hidden rounded-lg border bg-background">
      {host ? (
        <Button
          aria-label={t("artifacts.openInPane", {
            defaultValue: "Open in the artifact panel",
          })}
          className="absolute top-1.5 right-1.5 z-10 bg-background/80 backdrop-blur"
          onClick={() => activateArtifact(host.hostKey, artifactId)}
          size="icon-sm"
          title={t("artifacts.openInPane", {
            defaultValue: "Open in the artifact panel",
          })}
          variant="ghost"
        >
          <SquareArrowOutUpRight aria-hidden className="size-3.5" />
        </Button>
      ) : null}
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
