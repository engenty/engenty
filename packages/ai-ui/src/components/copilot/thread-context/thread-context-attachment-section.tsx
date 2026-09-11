"use client";

import { useTranslation } from "@engenty/i18n/ui";
import type { LucideIcon } from "lucide-react";
import { openWorkFilePaneTab } from "../../../artifacts/artifact-store.js";
import { iconForAttachment } from "./thread-context-icons.js";
import type { ThreadContextAttachmentItem } from "./thread-context-types.js";

const rowClassName =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground/90 transition-colors hover:bg-muted/70";

const rowIconClassName = "size-3.5 shrink-0 text-muted-foreground/70";

function AttachmentLabel({ Icon, label }: { Icon: LucideIcon; label: string }) {
  return (
    <>
      <Icon aria-hidden className={rowIconClassName} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </>
  );
}

function AttachmentRow({
  hostKey,
  item,
}: {
  hostKey: string;
  item: ThreadContextAttachmentItem;
}) {
  const { t } = useTranslation("ai-ui");
  const Icon = iconForAttachment(item.mimeType, item.filename);
  const label = item.filename.trim() || t("threadContext.untitledAttachment");
  const storageKey = item.storageKey.trim();

  // Full-screen chat mounts WorkspaceArtifactPane — same split as Work files.
  if (storageKey) {
    return (
      <button
        className={rowClassName}
        onClick={() =>
          openWorkFilePaneTab(hostKey, {
            entryKey: storageKey,
            filename: label,
          })
        }
        type="button"
      >
        <AttachmentLabel Icon={Icon} label={label} />
      </button>
    );
  }

  if (item.url) {
    return (
      <a
        className={rowClassName}
        href={item.url}
        rel="noopener noreferrer"
        target="_blank"
      >
        <AttachmentLabel Icon={Icon} label={label} />
      </a>
    );
  }

  return (
    <div className={rowClassName}>
      <AttachmentLabel Icon={Icon} label={label} />
    </div>
  );
}

export function ThreadContextAttachmentRows({
  attachments,
  hostKey,
}: {
  attachments: readonly ThreadContextAttachmentItem[];
  hostKey: string;
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <>
      {attachments.map((item, index) => (
        <AttachmentRow
          hostKey={hostKey}
          item={item}
          key={`${item.storageKey || item.url || "att"}-${index}`}
        />
      ))}
    </>
  );
}
