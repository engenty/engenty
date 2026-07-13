"use client";

import { useEffect, useState } from "react";
import {
  type ChatAttachmentMeta,
  isImageMimeType,
  readChatAttachmentPart,
} from "../../../lib/chat-attachment-part.js";
import { getFileStorageSignedUrl } from "../../../lib/file-storage-signed-url.js";
import {
  AttachmentFileBadge,
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

function ImageAttachment({ attachment }: { attachment: ResolvedAttachment }) {
  const url = useResolvedAttachmentUrl(attachment);
  return (
    <AttachmentImageTile
      href={url ?? undefined}
      label={attachment.filename || "image"}
      url={url ?? undefined}
    />
  );
}

function FileAttachment({ attachment }: { attachment: ResolvedAttachment }) {
  const url = useResolvedAttachmentUrl(attachment);
  return (
    <AttachmentFileBadge
      href={url ?? undefined}
      label={attachment.filename || "file"}
      mediaType={attachment.mimeType}
    />
  );
}

export interface CopilotAttachmentPreviewProps {
  /** AG-UI user-message content parts (image/document attachments are picked out). */
  parts: readonly unknown[];
}

/**
 * Render the attachments carried on a user message: images as square grid
 * thumbnails first, then files as inline badges, right-aligned to sit above the
 * user bubble.
 */
export function CopilotAttachmentPreview({
  parts,
}: CopilotAttachmentPreviewProps) {
  const attachments = parts
    .map((part) => readChatAttachmentPart(part))
    .filter((value): value is ResolvedAttachment => value !== null);

  if (attachments.length === 0) {
    return null;
  }

  const images = attachments.filter((a) => isImageMimeType(a.mimeType));
  const files = attachments.filter((a) => !isImageMimeType(a.mimeType));

  return (
    <div className="mb-1.5 flex flex-col items-end gap-2">
      {images.length > 0 ? (
        <div className="flex flex-wrap justify-end gap-2">
          {images.map((attachment, index) => (
            <ImageAttachment
              attachment={attachment}
              key={`${attachment.storageKey || attachment.url || "img"}-${index}`}
            />
          ))}
        </div>
      ) : null}
      {files.length > 0 ? (
        <div className="flex flex-wrap justify-end gap-2">
          {files.map((attachment, index) => (
            <FileAttachment
              attachment={attachment}
              key={`${attachment.storageKey || attachment.url || "file"}-${index}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
