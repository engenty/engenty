"use client";

import { cn } from "@engenty/ui-core";
import {
  AttachmentFileBadge,
  AttachmentImageTile,
  isImageMediaType,
} from "../attachment/attachment-tiles.js";
import { usePromptInputAttachments } from "./prompt-input-local-context.js";

export interface PromptInputAttachmentsProps {
  className?: string;
}

/**
 * Preview row for pending composer attachments. Images render as square grid
 * thumbnails (grid variant), files as inline badge pills (inline variant), with
 * images first. Each is removable. Renders nothing when there are no
 * attachments. Reads the shared attachment state (`usePromptInputAttachments`),
 * so it works in the global `PromptInputProvider` and local `PromptInput` alike.
 */
export function PromptInputAttachments({
  className,
}: PromptInputAttachmentsProps) {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) {
    return null;
  }

  const images = attachments.files.filter((f) => isImageMediaType(f.mediaType));
  const files = attachments.files.filter((f) => !isImageMediaType(f.mediaType));

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {images.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {images.map((file) => (
            <AttachmentImageTile
              key={file.id}
              label={file.filename ?? "image"}
              onRemove={() => attachments.remove(file.id)}
              url={file.url}
            />
          ))}
        </div>
      ) : null}
      {files.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {files.map((file) => (
            <AttachmentFileBadge
              key={file.id}
              label={file.filename ?? "file"}
              mediaType={file.mediaType}
              onRemove={() => attachments.remove(file.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
