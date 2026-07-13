"use client";

import { cn } from "@engenty/ui-core";
import { Download, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type ChatAttachmentMeta,
  isImageMimeType,
  readChatAttachmentPart,
} from "../../../lib/chat-attachment-part.js";
import { getFileStorageSignedUrl } from "../../../lib/file-storage-signed-url.js";

type ResolvedAttachment = ChatAttachmentMeta & { url?: string };

/**
 * Resolve a durable, viewable URL for an attachment. Prefers a freshly-signed
 * read URL derived from the storage key (survives signed-URL expiry on thread
 * reload); falls back to the part's own `source` URL when there is no key.
 */
function useResolvedAttachmentUrl(
  attachment: ResolvedAttachment
): string | null {
  const [resolved, setResolved] = useState<string | null>(
    attachment.url ?? null
  );
  const storageKey = attachment.storageKey;

  useEffect(() => {
    if (!storageKey) {
      return;
    }
    let cancelled = false;
    getFileStorageSignedUrl(storageKey)
      .then((url) => {
        if (!cancelled) {
          setResolved(url);
        }
      })
      .catch(() => {
        // Keep the optimistic source URL (if any) on failure.
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  return resolved;
}

function AttachmentTile({ attachment }: { attachment: ResolvedAttachment }) {
  const url = useResolvedAttachmentUrl(attachment);
  const label = attachment.filename || "attachment";
  const image = isImageMimeType(attachment.mimeType);

  if (image) {
    const tile = (
      <img
        alt={label}
        className="max-h-48 w-auto max-w-full rounded-lg border border-border object-cover"
        height={192}
        src={url ?? undefined}
        width={256}
      />
    );
    return url ? (
      <a href={url} rel="noreferrer" target="_blank">
        {tile}
      </a>
    ) : (
      tile
    );
  }

  return (
    <a
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm",
        "hover:bg-muted/70"
      )}
      href={url ?? undefined}
      rel="noreferrer"
      target="_blank"
    >
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="max-w-56 truncate" title={label}>
        {label}
      </span>
      <Download className="size-3.5 shrink-0 text-muted-foreground" />
    </a>
  );
}

export interface CopilotAttachmentPreviewProps {
  /** AG-UI user-message content parts (image/document attachments are picked out). */
  parts: readonly unknown[];
}

/** Render the image/file attachments carried on a user message. */
export function CopilotAttachmentPreview({
  parts,
}: CopilotAttachmentPreviewProps) {
  const attachments = parts
    .map((part) => readChatAttachmentPart(part))
    .filter((value): value is ResolvedAttachment => value !== null);

  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="mb-1.5 flex flex-wrap gap-2">
      {attachments.map((attachment, index) => (
        <AttachmentTile
          attachment={attachment}
          key={`${attachment.storageKey || attachment.url || "att"}-${index}`}
        />
      ))}
    </div>
  );
}
