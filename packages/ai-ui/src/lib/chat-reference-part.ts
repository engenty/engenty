// Typed @-mention references carried on an AG-UI user-message content part.
// Mirrors `chat-attachment-part.ts`: text parts cannot carry metadata (AG-UI's
// TextInputContentSchema strips unknown keys), so references ride one schema-
// conformant `document` part whose MIME is never model-feedable. All durable
// info lives under `metadata.engenty_refs` (`metadata` is `z.unknown()` on
// document parts, preserved verbatim). The server persists the part alongside
// attachment parts so reference chips survive a thread reload.

export const CHAT_REFERENCE_MIME = "application/x-engenty-refs";
const CHAT_REFERENCE_SOURCE_URL = "engenty:refs";

export interface ChatReferenceItem {
  /** Entity key for chip rendering without resolution, e.g. "contacts:contact". */
  entity: string;
  /** Display label at mention time (title fallback when live resolve fails). */
  label: string;
  /** Canonical ObjectRef: "<module>:<entity>:<id>" | "core:user:<id>" | "artifact:<id>". */
  ref: string;
}

export interface ChatReferencePart {
  metadata: { engenty_refs: ChatReferenceItem[] };
  source: { type: "url"; value: string; mimeType: string };
  type: "document";
}

/** Build the single content part carrying this turn's references. */
export function buildChatReferencePart(
  refs: ChatReferenceItem[]
): ChatReferencePart {
  return {
    type: "document",
    source: {
      type: "url",
      value: CHAT_REFERENCE_SOURCE_URL,
      mimeType: CHAT_REFERENCE_MIME,
    },
    metadata: { engenty_refs: refs },
  };
}

/** Read the references off a user-message content part, if it is the carrier. */
export function readChatReferencePart(
  part: unknown
): ChatReferenceItem[] | null {
  if (!part || typeof part !== "object") {
    return null;
  }
  const record = part as Record<string, unknown>;
  if (record.type !== "document") {
    return null;
  }
  const refs = (record.metadata as { engenty_refs?: unknown } | undefined)
    ?.engenty_refs;
  if (!Array.isArray(refs)) {
    return null;
  }
  const items: ChatReferenceItem[] = [];
  for (const entry of refs) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const item = entry as Record<string, unknown>;
    if (typeof item.ref !== "string" || !item.ref) {
      continue;
    }
    items.push({
      entity: typeof item.entity === "string" ? item.entity : "",
      label: typeof item.label === "string" ? item.label : item.ref,
      ref: item.ref,
    });
  }
  return items;
}

/** True when `part` is the reference carrier (skip it in attachment renderers). */
export function isChatReferencePart(part: unknown): boolean {
  return readChatReferencePart(part) !== null;
}
