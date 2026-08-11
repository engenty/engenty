import type { InboxAttachmentMeta } from "../schema/types.js";

/** Inline/tiny images below this size are decoration unless the model objects. */
export const DECORATION_IMAGE_MAX_BYTES = 32 * 1024;

/**
 * Deterministic pre-triage: obvious decoration never reaches the model or the
 * attachment strip.
 *
 * Signature logos, social icons and tracking pixels are small images the client
 * embedded inline (they carry a `content_id`); real pasted screenshots are
 * inline too but an order of magnitude larger — in observed mail 2–23 KB vs.
 * 55–250 KB. Matching the `cid:` reference in the body is not reliable (Gmail
 * rewrites ids), so inline + small is the rule.
 */
export function isLikelyDecorationAttachment(
  attachment: InboxAttachmentMeta
): boolean {
  const isImage = attachment.mime_type?.startsWith("image/") ?? false;
  if (!isImage) {
    return false;
  }
  const size = attachment.size ?? null;
  const small = size === null || size <= DECORATION_IMAGE_MAX_BYTES;
  if (attachment.content_id && small) {
    return true;
  }
  if (small) {
    const generatedName =
      /^(image\d*|logo\d*|icon\d*|banner\d*|qr[a-z0-9_-]*)\.\w+$/i;
    const socialName = /^(you|inst|face|link|news|twitter|x[_-]?icon)/i;
    const name = attachment.filename?.trim() ?? "";
    if (!name || generatedName.test(name) || socialName.test(name)) {
      return true;
    }
  }
  return false;
}

export function withoutDecorationAttachments(
  attachments: readonly InboxAttachmentMeta[]
): InboxAttachmentMeta[] {
  return attachments.filter(
    (attachment) => !isLikelyDecorationAttachment(attachment)
  );
}
