/**
 * Tiered chat-attachment ingestion for conversation runs.
 *
 * - model_native — image/* + PDF → multimodal `files` (base64 data URLs)
 * - inline_text  — small text-like files (≤ INLINE_TEXT_MAX_BYTES) → run context
 * - tool_backed  — larger / binary files → manifest + preview; use file_analyst
 *
 * Context budget: 32 KiB ≈ ~8–10k tokens of UTF-8 text.
 */
import type { RunAgentInput } from "@engenty/ag-ui-bridge";
import { getEngentyCoreBaseUrlFromEnv } from "../../ai/core-http-client.js";
import { createEngentyCoreFileStorageClient } from "../../ai/workspace/core-file-storage-client.js";

/** Max UTF-8 bytes inlined into run context per attachment (~10k tokens). */
export const INLINE_TEXT_MAX_BYTES = 32 * 1024;

/** Head sample included in the manifest when a text file is too large to inline. */
export const TOOL_BACKED_PREVIEW_BYTES = 2 * 1024;

export type AttachmentFeedTier =
  | "model_native"
  | "inline_text"
  | "tool_backed"
  | "unavailable";

export interface UserAttachmentRef {
  filename?: string;
  mimeType: string;
  sizeBytes?: number;
  storageKey: string;
}

export interface ModelAttachmentFile {
  data: string;
  filename?: string;
  mediaType: string;
}

export interface AttachmentContextEntry {
  description: string;
  value: string;
}

export interface TieredAttachmentResolution {
  contextEntries: AttachmentContextEntry[];
  modelAttachments: ModelAttachmentFile[];
}

const TEXT_LIKE_EXTENSIONS = new Set([
  "csv",
  "tsv",
  "txt",
  "md",
  "markdown",
  "json",
  "jsonl",
  "xml",
  "yaml",
  "yml",
  "log",
  "html",
  "htm",
  "css",
  "js",
  "ts",
  "tsx",
  "jsx",
  "py",
  "sql",
  "env",
  "toml",
  "ini",
  "cfg",
  "conf",
]);

export function isModelNativeMime(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType === "application/pdf";
}

/** @deprecated Prefer isModelNativeMime — kept for existing tests/imports. */
export function isModelFeedableMime(mimeType: string): boolean {
  return isModelNativeMime(mimeType);
}

export function isTextLikeAttachment(
  mimeType: string,
  filename?: string
): boolean {
  const mime = mimeType.toLowerCase().trim();
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/csv" ||
    mime === "application/x-csv" ||
    mime === "application/javascript" ||
    mime === "application/typescript" ||
    mime === "application/x-yaml" ||
    mime === "application/toml"
  ) {
    return true;
  }
  if (!filename) {
    return false;
  }
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_LIKE_EXTENSIONS.has(ext);
}

export function classifyAttachmentTier(input: {
  byteLength: number;
  filename?: string;
  mimeType: string;
}): AttachmentFeedTier {
  if (isModelNativeMime(input.mimeType)) {
    return "model_native";
  }
  if (!isTextLikeAttachment(input.mimeType, input.filename)) {
    return "tool_backed";
  }
  if (input.byteLength <= INLINE_TEXT_MAX_BYTES) {
    return "inline_text";
  }
  return "tool_backed";
}

function decodeUtf8Sample(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function truncateUtf8(
  bytes: Uint8Array,
  maxBytes: number
): {
  text: string;
  truncated: boolean;
} {
  if (bytes.byteLength <= maxBytes) {
    return { text: decodeUtf8Sample(bytes), truncated: false };
  }
  // Prefer cutting on a newline near the budget so CSV rows stay intact.
  let end = maxBytes;
  const slice = bytes.slice(0, maxBytes);
  for (let i = slice.byteLength - 1; i >= Math.floor(maxBytes * 0.75); i--) {
    if (slice[i] === 0x0a) {
      end = i + 1;
      break;
    }
  }
  return {
    text: decodeUtf8Sample(bytes.slice(0, end)),
    truncated: true,
  };
}

export function formatAttachmentManifestEntry(input: {
  filename?: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  tier: AttachmentFeedTier;
  body?: string;
  truncated?: boolean;
}): string {
  const name = input.filename?.trim() || "attachment";
  const lines = [
    `### ${name}`,
    `- storage_key: ${input.storageKey}`,
    `- mime_type: ${input.mimeType || "application/octet-stream"}`,
    `- size_bytes: ${input.sizeBytes}`,
    `- feed: ${input.tier}`,
  ];
  if (input.tier === "inline_text") {
    lines.push(
      "- content: fully inlined below. Use it directly; call agent-file_analyst only for deeper analysis."
    );
  } else if (input.tier === "tool_backed") {
    lines.push(
      "- content: not fully inlined (too large or non-text). Delegate to agent-file_analyst with this storage_key for read / summarize / ask / convert / extract, or use vault_download_file."
    );
  } else if (input.tier === "model_native") {
    lines.push(
      "- content: provided to the model as a native multimodal file part."
    );
  } else {
    lines.push("- content: unavailable (download failed).");
  }
  if (input.body != null && input.body.length > 0) {
    lines.push("");
    if (input.truncated) {
      lines.push("Preview (truncated):");
    } else {
      lines.push("Content:");
    }
    lines.push("```");
    lines.push(input.body);
    lines.push("```");
  }
  return lines.join("\n");
}

/** Raw image/document parts for durable transcript persistence. */
export function latestUserAttachmentParts(input: RunAgentInput): unknown[] {
  const messages = Array.isArray(input.messages) ? input.messages : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as { content?: unknown; role?: string };
    if (message?.role !== "user") {
      continue;
    }
    const content = message.content;
    if (!Array.isArray(content)) {
      return [];
    }
    return content.filter((part) => {
      if (!part || typeof part !== "object") {
        return false;
      }
      const partType = (part as { type?: unknown }).type;
      if (partType !== "image" && partType !== "document") {
        return false;
      }
      const metadata = (
        part as {
          metadata?: {
            engenty_attachment?: { storageKey?: unknown };
            engenty_refs?: unknown;
          };
        }
      ).metadata;
      if (Array.isArray(metadata?.engenty_refs)) {
        return true;
      }
      const key = metadata?.engenty_attachment?.storageKey;
      return typeof key === "string" && key.length > 0;
    });
  }
  return [];
}

export function latestUserAttachments(
  input: RunAgentInput
): UserAttachmentRef[] {
  const messages = Array.isArray(input.messages) ? input.messages : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as { content?: unknown; role?: string };
    if (message?.role !== "user") {
      continue;
    }
    const content = message.content;
    if (!Array.isArray(content)) {
      return [];
    }
    const refs: UserAttachmentRef[] = [];
    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }
      const partType = (part as { type?: unknown }).type;
      if (partType !== "image" && partType !== "document") {
        continue;
      }
      const meta = (part as { metadata?: { engenty_attachment?: unknown } })
        .metadata?.engenty_attachment as
        | {
            filename?: unknown;
            mimeType?: unknown;
            size?: unknown;
            storageKey?: unknown;
          }
        | undefined;
      if (!meta || typeof meta.storageKey !== "string" || !meta.storageKey) {
        continue;
      }
      refs.push({
        filename: typeof meta.filename === "string" ? meta.filename : undefined,
        mimeType: typeof meta.mimeType === "string" ? meta.mimeType : "",
        sizeBytes: typeof meta.size === "number" ? meta.size : undefined,
        storageKey: meta.storageKey,
      });
    }
    return refs;
  }
  return [];
}

/**
 * Download + classify attachments for the latest user turn.
 * Best-effort: failed downloads become `unavailable` manifest rows.
 */
export async function resolveTieredAttachments(params: {
  coreBaseUrl?: string;
  input: RunAgentInput;
  accessToken?: string;
}): Promise<TieredAttachmentResolution> {
  const { accessToken } = params;
  const coreBaseUrl = params.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv();
  const refs = latestUserAttachments(params.input);
  if (refs.length === 0) {
    return { contextEntries: [], modelAttachments: [] };
  }
  if (!(coreBaseUrl && accessToken)) {
    // Cannot download — still tell the model the files exist.
    const value = [
      "The user attached these files, but bytes could not be loaded in this run (missing core URL or auth). Storage keys:",
      ...refs.map(
        (ref) =>
          `- ${ref.filename ?? "attachment"} (${ref.mimeType || "unknown"}) → ${ref.storageKey}`
      ),
      "Ask the user to re-send the file, or retry once auth is available.",
    ].join("\n");
    return {
      contextEntries: [{ description: "user_attachments", value }],
      modelAttachments: [],
    };
  }

  const fileClient = createEngentyCoreFileStorageClient({
    bucket: "files",
    coreBaseUrl,
    accessToken,
  });

  const modelAttachments: ModelAttachmentFile[] = [];
  const manifestBlocks: string[] = [];

  for (const ref of refs) {
    try {
      const bytes = await fileClient.download(ref.storageKey);
      if (!bytes) {
        manifestBlocks.push(
          formatAttachmentManifestEntry({
            filename: ref.filename,
            mimeType: ref.mimeType,
            sizeBytes: ref.sizeBytes ?? 0,
            storageKey: ref.storageKey,
            tier: "unavailable",
          })
        );
        continue;
      }

      const tier = classifyAttachmentTier({
        byteLength: bytes.byteLength,
        filename: ref.filename,
        mimeType: ref.mimeType,
      });

      if (tier === "model_native") {
        modelAttachments.push({
          data: `data:${ref.mimeType};base64,${Buffer.from(bytes).toString("base64")}`,
          mediaType: ref.mimeType,
          ...(ref.filename ? { filename: ref.filename } : {}),
        });
        manifestBlocks.push(
          formatAttachmentManifestEntry({
            filename: ref.filename,
            mimeType: ref.mimeType,
            sizeBytes: bytes.byteLength,
            storageKey: ref.storageKey,
            tier,
          })
        );
        continue;
      }

      if (tier === "inline_text") {
        const { text, truncated } = truncateUtf8(bytes, INLINE_TEXT_MAX_BYTES);
        manifestBlocks.push(
          formatAttachmentManifestEntry({
            filename: ref.filename,
            mimeType: ref.mimeType,
            sizeBytes: bytes.byteLength,
            storageKey: ref.storageKey,
            tier: truncated ? "tool_backed" : "inline_text",
            body: text,
            truncated,
          })
        );
        continue;
      }

      // tool_backed — optional text preview for text-like large files
      let body: string | undefined;
      let truncated = false;
      if (isTextLikeAttachment(ref.mimeType, ref.filename)) {
        const sample = truncateUtf8(bytes, TOOL_BACKED_PREVIEW_BYTES);
        body = sample.text;
        truncated = true;
      }
      manifestBlocks.push(
        formatAttachmentManifestEntry({
          filename: ref.filename,
          mimeType: ref.mimeType,
          sizeBytes: bytes.byteLength,
          storageKey: ref.storageKey,
          tier: "tool_backed",
          body,
          truncated,
        })
      );
    } catch (err) {
      console.error("tiered attachment resolve failed", err);
      manifestBlocks.push(
        formatAttachmentManifestEntry({
          filename: ref.filename,
          mimeType: ref.mimeType,
          sizeBytes: ref.sizeBytes ?? 0,
          storageKey: ref.storageKey,
          tier: "unavailable",
        })
      );
    }
  }

  if (manifestBlocks.length === 0) {
    return { contextEntries: [], modelAttachments };
  }

  return {
    modelAttachments,
    contextEntries: [
      {
        description: "user_attachments",
        value: [
          "The user attached these files to their message:",
          "",
          ...manifestBlocks,
          "",
          "Rules: prefer inlined Content when present. For tool_backed / deeper work (summarize, ask questions, convert, extract), call agent-file_analyst with a brief that includes the storage_key and the user's goal.",
        ].join("\n"),
      },
    ],
  };
}
