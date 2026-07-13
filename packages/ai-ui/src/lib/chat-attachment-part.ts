// Canonical shape for a chat attachment carried on an AG-UI user-message content
// part. We reuse AG-UI's native `image` / `document` input-content parts (see
// `@ag-ui/core` ImageInputContentSchema / DocumentInputContentSchema) so the
// part survives `RunAgentInputSchema.safeParse` on the backend untouched. Only
// the schema's own keys are allowed (`type`, `source`, `metadata`); all durable
// attachment info lives under `metadata.engenty_attachment` (`metadata` is
// `z.unknown().optional()`, so it is preserved verbatim).

export interface ChatAttachmentMeta {
  filename: string;
  mimeType: string;
  size: number;
  /** Durable tenant-scoped storage key in the `files` bucket. */
  storageKey: string;
}

export type ChatAttachmentPartType = "image" | "document";

export interface ChatAttachmentPart {
  metadata: { engenty_attachment: ChatAttachmentMeta };
  source: { type: "url"; value: string; mimeType: string };
  type: ChatAttachmentPartType;
}

const IMAGE_MIME_PREFIX = "image/";

export function isImageMimeType(mimeType: string | undefined | null): boolean {
  return typeof mimeType === "string" && mimeType.startsWith(IMAGE_MIME_PREFIX);
}

/** Build the AG-UI content part for a freshly uploaded chat attachment. */
export function buildChatAttachmentPart(input: {
  meta: ChatAttachmentMeta;
  /** Signed read URL for immediate optimistic render (may expire; re-derive from storageKey). */
  url: string;
}): ChatAttachmentPart {
  return {
    type: isImageMimeType(input.meta.mimeType) ? "image" : "document",
    source: { type: "url", value: input.url, mimeType: input.meta.mimeType },
    metadata: { engenty_attachment: input.meta },
  };
}

/** Read attachment metadata off a user-message content part, if present. */
export function readChatAttachmentPart(
  part: unknown
): (ChatAttachmentMeta & { url?: string }) | null {
  if (!part || typeof part !== "object") {
    return null;
  }
  const record = part as Record<string, unknown>;
  if (record.type !== "image" && record.type !== "document") {
    return null;
  }
  const source = record.source as
    | { mimeType?: string; value?: string }
    | undefined;
  const sourceUrl =
    typeof source?.value === "string" ? source.value : undefined;
  const meta = (record.metadata as { engenty_attachment?: unknown } | undefined)
    ?.engenty_attachment as ChatAttachmentMeta | undefined;

  if (meta && typeof meta.storageKey === "string") {
    return { ...meta, url: sourceUrl };
  }
  // Bare image/document part without engenty metadata — still renderable by URL.
  if (sourceUrl) {
    return {
      filename: "",
      mimeType: source?.mimeType ?? "",
      size: 0,
      storageKey: "",
      url: sourceUrl,
    };
  }
  return null;
}
