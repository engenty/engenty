"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Button, cn } from "@engenty/ui-core";
import { FileText } from "lucide-react";
import { useOptionalAgentHost } from "../agent-provider/engenty-agent.js";
import { activateArtifact } from "./artifact-store.js";
import {
  getArtifact,
  resolveEngentyAiServiceBaseUrlSafe,
} from "./artifacts-api.js";

/**
 * A delegated colleague's deliverable, offered where the person reads: the
 * hand-off row in the parent's chat and the reply quote on the colleague's
 * desk. The colleague's own `artifact_write` card sits in the pair thread,
 * one drill-in away — this puts the title and an Open beside the reply.
 *
 * Title comes from the artifact itself (the tool result carries only ids);
 * until it loads, or when it cannot (archived, gone), the row stays out of
 * the way rather than drawing a broken chip.
 */
export function DelegatedArtifactRow({
  artifactId,
  className,
}: {
  artifactId: string;
  className?: string;
}) {
  const { t } = useTranslation("ai-ui");
  const host = useOptionalAgentHost();
  const query = useQuery({
    enabled: Boolean(artifactId),
    queryFn: () =>
      getArtifact({
        artifactId,
        serviceBaseUrl: resolveEngentyAiServiceBaseUrlSafe(),
      }),
    // Same key as InlineAppArtifact: one fetch serves both renderings.
    queryKey: ["artifact-inline", artifactId],
    staleTime: 60_000,
  });
  const artifact = query.data?.artifact;
  if (!artifact) {
    return null;
  }
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm",
        className
      )}
      data-testid="delegated-artifact-row"
    >
      <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate" title={artifact.title}>
        {artifact.title}
      </span>
      {host ? (
        <Button
          className="h-6 shrink-0 px-2 text-xs"
          onClick={() => activateArtifact(host.hostKey, artifactId)}
          size="sm"
          type="button"
          variant="outline"
        >
          {t("agentMessage.openArtifact")}
        </Button>
      ) : null}
    </div>
  );
}

/** `artifact_ids` off a delegate / message_agent result: strings only. */
export function readDelegatedArtifactIds(output: unknown): string[] {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return [];
  }
  const ids = (output as { artifact_ids?: unknown }).artifact_ids;
  return Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string" && id !== "")
    : [];
}
