// The desk agent's answer to a colleague, as the desk shows it: a quote of
// the first ~200 characters (apps/ai `desk-reply-preview.ts` writes the row)
// and a way into the pair thread where the whole exchange lives.
"use client";

import {
  conversationEngagement,
  resolveAgentEngenty,
} from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { DelegatedArtifactRow } from "../../../artifacts/delegated-artifact-row.js";
import { spaceAgentDeskPath } from "../../../features/agent-form/hire-spaces.js";
import { AgentNamePill } from "../agent-name-pill.js";

function textOfParts(parts: readonly unknown[] | undefined): string {
  return (parts ?? [])
    .filter(
      (part): part is { text: string; type: "text" } =>
        Boolean(part) &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string"
    )
    .map((part) => part.text)
    .join("")
    .trim();
}

export function AgentReplyPreview(props: {
  /** The desk's agent — the one that answered. */
  agentId: string;
  agentName?: string | null;
  className?: string;
  marker: { agentId: string; artifactIds?: string[]; threadId: string };
  parts: readonly unknown[] | undefined;
}) {
  const { t } = useTranslation("ai-ui");
  const { currentSpace } = useWorkspaceContext();
  const text = textOfParts(props.parts);
  if (!text) {
    return null;
  }
  const to = currentSpace?.key
    ? `${spaceAgentDeskPath(currentSpace.key, props.marker.agentId)}?engagement=${encodeURIComponent(conversationEngagement(props.marker.threadId))}`
    : null;
  return (
    <div className={cn("my-2 w-full max-w-full", props.className)}>
      <div className="flex items-center gap-1.5 px-1 text-muted-foreground text-xs">
        <AgentNamePill
          kind={resolveAgentEngenty(props.agentId)}
          name={props.agentName?.trim() || props.agentId}
        />
        <span>{t("agentMessage.replied")}</span>
      </div>
      <blockquote className="mt-1 border-border border-l-2 pl-3 text-foreground/90 text-sm leading-relaxed">
        {text}
      </blockquote>
      {props.marker.artifactIds?.length ? (
        // The deliverable the reply talks about, opened here: the agent's own
        // Write card is in the pair thread, one drill-in away.
        <div className="mt-2 flex max-w-md flex-col gap-1.5 pl-3">
          {props.marker.artifactIds.map((artifactId) => (
            <DelegatedArtifactRow artifactId={artifactId} key={artifactId} />
          ))}
        </div>
      ) : null}
      {to ? (
        <Link
          className="mt-1 inline-flex items-center gap-1 px-1 text-muted-foreground text-xs hover:text-foreground"
          to={to}
        >
          {t("agentMessage.openConversation")}
          <ArrowUpRight aria-hidden className="size-3" />
        </Link>
      ) : null}
    </div>
  );
}
