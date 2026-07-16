import type { InboxAttachmentMeta } from "../api.js";

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|bmp|svg)$/i;

export function isImageAttachment(attachment: InboxAttachmentMeta): boolean {
  if (attachment.mime_type?.toLowerCase().startsWith("image/")) {
    return true;
  }
  const filename = attachment.filename?.trim().toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.test(filename);
}
