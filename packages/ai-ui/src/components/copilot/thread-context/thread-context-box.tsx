"use client";

import { formatObjectRef } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { Brain, FileText, Sparkles } from "lucide-react";
import { activateArtifact } from "../../../artifacts/artifact-store.js";
import { spaceAgentDeskPath } from "../../../features/agent-form/hire-spaces.js";
import { buildAgentFilesPath } from "../../../features/agents-workspace/agent-workspace-paths.js";
import { useDeveloperModeEnabled } from "../../ag-ui-inspector/ag-ui-inspector-hooks.js";
import {
  type ContextBoxSectionModel,
  ContextBoxView,
} from "./context-box-view.js";
import { ThreadContextAttachmentRows } from "./thread-context-attachment-section.js";
import {
  iconForArtifactType,
  iconForSourceUrl,
  iconForSubAgent,
} from "./thread-context-icons.js";
import type { ThreadContextSummary } from "./thread-context-types.js";
import {
  type AgentSkillSource,
  hasOwnedContext,
  useAgentOwnedContext,
} from "./use-agent-owned-context.js";
import { useContextObjectItems } from "./use-context-object-items.js";

export interface ThreadContextBoxProps {
  className?: string;
  hostKey: string;
  summary: ThreadContextSummary;
}

/**
 * Compact floating context card — sidebar-style group headings with
 * always-visible item rows (type icon when we can resolve one).
 */
export function ThreadContextBox({
  className,
  hostKey,
  summary,
}: ThreadContextBoxProps) {
  const { t } = useTranslation("ai-ui");
  const objectItems = useContextObjectItems(
    summary.objects.map((item) => ({
      ...(item.href === undefined ? {} : { href: item.href }),
      key: formatObjectRef(item.ref),
      ref: item.ref,
      title: item.title,
    }))
  );

  const owned = useAgentOwnedContext(hostKey);
  const { currentSpace } = useWorkspaceContext();
  // The files page lives in the /admin/engenty debugging area.
  const developerMode = useDeveloperModeEnabled();
  const skillSourceLabel: Record<AgentSkillSource, string> = {
    agent: t("threadContext.skillSource.agent"),
    default: t("threadContext.skillSource.default"),
    space: t("threadContext.skillSource.space"),
  };
  const manageHref =
    owned.agentId && currentSpace?.key
      ? `${spaceAgentDeskPath(currentSpace.key, owned.agentId)}?panel=manage`
      : null;

  if (summary.isEmpty && !hasOwnedContext(owned)) {
    return null;
  }

  // The agent's own context first: what it carries into every conversation
  // here, in the order it is told to prefer it — before what this thread
  // happened to touch.
  const sections: ContextBoxSectionModel[] = [
    {
      id: "skills",
      items: owned.skills.map((skill) => ({
        detail: (
          <span className="text-muted-foreground text-xxs">
            {skillSourceLabel[skill.source]}
          </span>
        ),
        icon: Sparkles,
        key: skill.id,
        label: skill.id,
      })),
      label: t("threadContext.skills"),
    },
    {
      id: "memory",
      items: owned.memory
        ? [
            {
              detail: (
                <span className="text-muted-foreground text-xxs">
                  {owned.memory.excerpt}
                </span>
              ),
              ...(manageHref ? { href: manageHref } : {}),
              icon: Brain,
              key: "memory",
              label: t("threadContext.memory"),
            },
          ]
        : [],
      label: t("threadContext.memory"),
    },
    {
      id: "files",
      items: owned.files.map((file) => ({
        ...(developerMode && owned.agentId
          ? { href: buildAgentFilesPath(owned.agentId) }
          : {}),
        icon: FileText,
        key: file.path,
        label: file.name,
        ...(file.path.includes("/")
          ? {
              detail: (
                <span className="text-muted-foreground text-xxs">
                  {file.path.slice(0, file.path.lastIndexOf("/"))}
                </span>
              ),
            }
          : {}),
      })),
      label: t("threadContext.files"),
    },
    {
      id: "agent-artefacts",
      items: owned.artefacts
        .filter((item) => !summary.artefacts.some((row) => row.id === item.id))
        .map((item) => ({
          icon: iconForArtifactType(item.type),
          key: item.id,
          label: item.title,
          onClick: () => activateArtifact(hostKey, item.id),
        })),
      label: t("threadContext.agentArtefacts"),
    },
    {
      id: "artefacts",
      items: summary.artefacts.map((item) => ({
        icon: iconForArtifactType(item.type),
        key: item.id,
        label: item.title,
        onClick: () => activateArtifact(hostKey, item.id),
      })),
      label: t("threadContext.artefacts"),
    },
    {
      id: "agents",
      items: summary.agents.map((item) => ({
        ...(item.href ? { href: item.href } : {}),
        icon: iconForSubAgent(),
        key: item.agentId,
        label: item.agentName,
      })),
      label: t("threadContext.agents"),
    },
    {
      id: "objects",
      items: objectItems,
      label: t("threadContext.objects"),
    },
    {
      content:
        summary.attachments.length > 0 ? (
          <ThreadContextAttachmentRows
            attachments={summary.attachments}
            hostKey={hostKey}
          />
        ) : null,
      id: "sources",
      items: summary.sources.map((item) => {
        const isInternal =
          item.url.startsWith("/") ||
          item.url.includes("/kb/") ||
          item.url.includes("/mdl/");
        return {
          ...(isInternal
            ? { href: item.url.replace(/^https?:\/\/[^/]+/, "") }
            : { externalUrl: item.url }),
          icon: iconForSourceUrl(item.url),
          key: item.url,
          label: item.title,
        };
      }),
      label: t("threadContext.sources"),
    },
  ];

  return (
    <ContextBoxView
      ariaLabel={t("threadContext.label")}
      className={className}
      sections={sections}
    />
  );
}
