"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { useEffect, useState } from "react";
import {
  type ChatAttachmentMeta,
  isImageMimeType,
  isPdfMimeType,
  readChatAttachmentPart,
} from "../../../lib/chat-attachment-part.js";
import { readChatReferencePart } from "../../../lib/chat-reference-part.js";
import { getFileStorageSignedUrl } from "../../../lib/file-storage-signed-url.js";
import {
  AttachmentFileTile,
  AttachmentImageTile,
} from "../../ai-elements/attachment/attachment-tiles.js";
import {
  CopilotAttachmentLightbox,
  type CopilotAttachmentLightboxTarget,
} from "./copilot-attachment-lightbox.js";

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

function AttachmentTile({
  attachment,
  imageClassName,
  onPreview,
}: {
  attachment: ResolvedAttachment;
  imageClassName?: string;
  onPreview: (target: CopilotAttachmentLightboxTarget) => void;
}) {
  const { t } = useTranslation("common");
  const url = useResolvedAttachmentUrl(attachment);
  const isImage = isImageMimeType(attachment.mimeType);
  const isPdf = isPdfMimeType(attachment.mimeType, attachment.filename);
  const label =
    attachment.filename.trim() ||
    t(
      isImage
        ? "copilot.attachments.untitledImage"
        : "copilot.attachments.untitledFile"
    );
  const previewAriaLabel = t("copilot.attachments.preview", { name: label });
  if (isImage) {
    return (
      <AttachmentImageTile
        className={imageClassName}
        fit="natural"
        label={label}
        onPreview={
          url
            ? () => onPreview({ filename: label, kind: "image", url })
            : undefined
        }
        previewAriaLabel={previewAriaLabel}
        url={url ?? undefined}
      />
    );
  }
  if (isPdf) {
    return (
      <AttachmentFileTile
        label={label}
        mediaType={attachment.mimeType}
        onPreview={
          url
            ? () => onPreview({ filename: label, kind: "pdf", url })
            : undefined
        }
        previewAriaLabel={previewAriaLabel}
        size="lg"
      />
    );
  }
  return (
    <AttachmentFileTile
      href={url ?? undefined}
      label={label}
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
 * Attachments on a user message, above the text bubble. Images keep their
 * aspect ratio (never upscaled, height-capped) in a separate grid from files.
 */
export function CopilotAttachmentPreview({
  parts,
}: CopilotAttachmentPreviewProps) {
  const [lightbox, setLightbox] =
    useState<CopilotAttachmentLightboxTarget | null>(null);
  // The reference carrier is a `document` part too — skip it so it never
  // renders as a broken file tile. Its mentions draw inline in the bubble.
  const attachments = parts
    .filter((part) => readChatReferencePart(part) === null)
    .map((part) => readChatAttachmentPart(part))
    .filter((value): value is ResolvedAttachment => value !== null);

  if (attachments.length === 0) {
    return null;
  }

  const images = attachments.filter((a) => isImageMimeType(a.mimeType));
  const files = attachments.filter((a) => !isImageMimeType(a.mimeType));
  const imageGrid =
    images.length === 1
      ? "flex w-full justify-center"
      : "grid w-full grid-cols-2 gap-2";
  const imageMaxHeight = images.length === 1 ? undefined : "max-h-52";

  return (
    <div className="flex w-full flex-col gap-2">
      <CopilotAttachmentLightbox
        onOpenChange={(open) => {
          if (!open) {
            setLightbox(null);
          }
        }}
        target={lightbox}
      />
      {images.length > 0 ? (
        <div className={imageGrid} data-testid="copilot-attachment-images">
          {images.map((attachment, index) => (
            <AttachmentTile
              attachment={attachment}
              imageClassName={imageMaxHeight}
              key={`${attachment.storageKey || attachment.url || "img"}-${index}`}
              onPreview={setLightbox}
            />
          ))}
        </div>
      ) : null}
      {files.length > 0 ? (
        <div
          className="flex flex-wrap justify-end gap-2"
          data-testid="copilot-attachment-files"
        >
          {files.map((attachment, index) => (
            <AttachmentTile
              attachment={attachment}
              key={`${attachment.storageKey || attachment.url || "file"}-${index}`}
              onPreview={setLightbox}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
