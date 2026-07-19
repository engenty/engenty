"use client";

import { useEffect, useState } from "react";
import {
  type ChatAttachmentMeta,
  isImageMimeType,
  readChatAttachmentPart,
} from "../../../lib/chat-attachment-part.js";
import {
  type ChatReferenceItem,
  readChatReferencePart,
} from "../../../lib/chat-reference-part.js";
import { getFileStorageSignedUrl } from "../../../lib/file-storage-signed-url.js";
import {
  AttachmentFileTile,
  AttachmentImageTile,
} from "../../ai-elements/attachment/attachment-tiles.js";

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
  if (isImageMimeType(attachment.mimeType)) {
    return (
      <AttachmentImageTile
        href={url ?? undefined}
        label={attachment.filename || "image"}
        size="lg"
        url={url ?? undefined}
      />
    );
  }
  return (
    <AttachmentFileTile
      href={url ?? undefined}
      label={attachment.filename || "file"}
      mediaType={attachment.mimeType}
      size="lg"
    />
  );
}

export interface CopilotAttachmentPreviewProps {
  /** AG-UI user-message content parts (image/document attachments are picked out). */
  parts: readonly unknown[];
}

/**
 * Render the attachments carried on a user message: one right-aligned row of
 * separated square tiles above the user bubble — image thumbnails first, then
 * icon file tiles (AI SDK Elements grid variant).
 */
export function CopilotAttachmentPreview({
  parts,
}: CopilotAttachmentPreviewProps) {
  // The reference carrier is a `document` part too — pick it out first so it
  // never renders as a broken file tile.
  const refs: ChatReferenceItem[] = parts.flatMap(
    (part) => readChatReferencePart(part) ?? []
  );
  const attachments = parts
    .filter((part) => readChatReferencePart(part) === null)
    .map((part) => readChatAttachmentPart(part))
    .filter((value): value is ResolvedAttachment => value !== null);

  if (attachments.length === 0 && refs.length === 0) {
    return null;
  }

  const ordered = [
    ...attachments.filter((a) => isImageMimeType(a.mimeType)),
    ...attachments.filter((a) => !isImageMimeType(a.mimeType)),
  ];

  return (
    <div className="flex flex-col items-end gap-2">
      {ordered.length > 0 ? (
        <div className="flex flex-wrap justify-end gap-2">
          {ordered.map((attachment, index) => (
            <AttachmentTile
              attachment={attachment}
              key={`${attachment.storageKey || attachment.url || "att"}-${index}`}
            />
          ))}
        </div>
      ) : null}
      {refs.length > 0 ? (
        <div className="flex flex-wrap justify-end gap-1.5">
          {refs.map((ref) => (
            <span
              className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-2 py-0.5 text-secondary-foreground text-xs"
              key={ref.ref}
              title={ref.ref}
            >
              <span className="max-w-44 truncate">@{ref.label}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
