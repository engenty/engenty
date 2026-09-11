"use client";

import { formatObjectRef } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { activateArtifact } from "../../../artifacts/artifact-store.js";
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

  if (summary.isEmpty) {
    return null;
  }

  const sections: ContextBoxSectionModel[] = [
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
