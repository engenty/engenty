/**
 * Tiered chat-attachment ingestion for conversation runs.
 *
 * - model_native — image/* → multimodal `files` (base64 data URLs).
 *   Images are downscaled/JPEG-compressed first; phone photos otherwise
 *   exceed provider body limits and the model never sees the pixels.
 * - inline_text  — small text-like files, or extracted markdown (≤32 KiB)
 * - tool_backed  — larger / binary / truncated extracts → manifest + file_analyst
 *
 * PDFs and office docs are never attached as native file bytes (that blows the
 * token limiter). Client anydoc writes `{storageKey}.extracted.md`; the run
 * inlines a clip and file_analyst can read the rest. Missing sidecar →
 * LiteParse on the original, then persist the sidecar.
 *
 * Context budget: 32 KiB ≈ ~8–10k tokens of UTF-8 text per attachment.
 */
import type { RunAgentInput } from "@engenty/ag-ui-bridge";
import { getEngentyCoreBaseUrlFromEnv } from "../../ai/core-http-client.js";
import { createEngentyCoreFileStorageClient } from "../../ai/workspace/core-file-storage-client.js";
import {
  extractedMarkdownSidecarKey,
  loadExtractedMarkdownForRef,
  writeExtractedMarkdownSidecar,
} from "./extracted-markdown-sidecar.js";
import { prepareModelNativeImage } from "./prepare-model-image.js";

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
  extractedBy?: string;
  extractedMarkdown?: string;
  extractedStorageKey?: string;
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
  return mimeType.startsWith("image/");
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
  extractedStorageKey?: string;
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
  if (input.extractedStorageKey) {
    lines.push(`- extracted_storage_key: ${input.extractedStorageKey}`);
  }
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
      input.body
        ? "- content: native multimodal file part, plus extracted text below."
        : "- content: provided to the model as a native multimodal file part."
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

function messageContentParts(message: {
  content?: unknown;
  parts?: unknown;
}): unknown[] {
  if (Array.isArray(message.content)) {
    return message.content;
  }
  if (Array.isArray(message.parts)) {
    return message.parts;
  }
  return [];
}

function readUserAttachmentRef(part: unknown): UserAttachmentRef | null {
  if (!part || typeof part !== "object") {
    return null;
  }
  const partType = (part as { type?: unknown }).type;
  if (partType !== "image" && partType !== "document") {
    return null;
  }
  const meta = (part as { metadata?: { engenty_attachment?: unknown } })
    .metadata?.engenty_attachment as
    | {
        extractedBy?: unknown;
        extractedMarkdown?: unknown;
        extractedStorageKey?: unknown;
        filename?: unknown;
        mimeType?: unknown;
        size?: unknown;
        storageKey?: unknown;
      }
    | undefined;
  if (!meta || typeof meta.storageKey !== "string" || !meta.storageKey) {
    return null;
  }
  return {
    filename: typeof meta.filename === "string" ? meta.filename : undefined,
    mimeType: typeof meta.mimeType === "string" ? meta.mimeType : "",
    sizeBytes: typeof meta.size === "number" ? meta.size : undefined,
    storageKey: meta.storageKey,
    ...(typeof meta.extractedMarkdown === "string" &&
    meta.extractedMarkdown.trim()
      ? { extractedMarkdown: meta.extractedMarkdown }
      : {}),
    ...(typeof meta.extractedStorageKey === "string" &&
    meta.extractedStorageKey.trim()
      ? { extractedStorageKey: meta.extractedStorageKey }
      : {}),
    ...(typeof meta.extractedBy === "string" && meta.extractedBy.trim()
      ? { extractedBy: meta.extractedBy }
      : {}),
  };
}

function attachmentRefsFromUserMessage(message: {
  content?: unknown;
  parts?: unknown;
  role?: string;
}): UserAttachmentRef[] {
  if (message.role !== "user") {
    return [];
  }
  const refs: UserAttachmentRef[] = [];
  for (const part of messageContentParts(message)) {
    const ref = readUserAttachmentRef(part);
    if (ref) {
      refs.push(ref);
    }
  }
  return refs;
}

export function latestUserAttachments(
  input: RunAgentInput
): UserAttachmentRef[] {
  const messages = Array.isArray(input.messages) ? input.messages : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as {
      content?: unknown;
      parts?: unknown;
      role?: string;
    };
    if (message.role === "user") {
      return attachmentRefsFromUserMessage(message);
    }
  }
  return [];
}

/** Unique attachments across the thread (later metadata wins, so extracted text is kept). */
export function collectThreadUserAttachments(
  input: RunAgentInput
): UserAttachmentRef[] {
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const byKey = new Map<string, UserAttachmentRef>();
  for (const raw of messages) {
    const message = raw as {
      content?: unknown;
      parts?: unknown;
      role?: string;
    };
    for (const ref of attachmentRefsFromUserMessage(message)) {
      const previous = byKey.get(ref.storageKey);
      byKey.set(ref.storageKey, {
        ...previous,
        ...ref,
        extractedMarkdown: ref.extractedMarkdown ?? previous?.extractedMarkdown,
        extractedStorageKey:
          ref.extractedStorageKey ?? previous?.extractedStorageKey,
        extractedBy: ref.extractedBy ?? previous?.extractedBy,
      });
    }
  }
  return [...byKey.values()];
}

async function extractMarkdownWithDocConverter(input: {
  bytes: Uint8Array;
  filename?: string;
  mimeType: string;
}): Promise<string | null> {
  if (input.mimeType.startsWith("image/")) {
    return null;
  }
  try {
    const { Converter } = await import("@engenty/doc-converter");
    const converter = new Converter({ provider: "liteparse" });
    if (!converter.canConvert(input.mimeType)) {
      return null;
    }
    const result = await converter.convert(
      input.bytes,
      input.filename?.trim() || "document",
      input.mimeType,
      { max_pages: 40 }
    );
    const markdown = result.markdown?.trim() ?? "";
    return markdown || null;
  } catch {
    return null;
  }
}

function clipManifestBody(text: string): {
  body: string;
  truncated: boolean;
} {
  const encoded = Buffer.from(text, "utf8");
  if (encoded.byteLength <= INLINE_TEXT_MAX_BYTES) {
    return { body: text, truncated: false };
  }
  return {
    body: `${encoded.subarray(0, INLINE_TEXT_MAX_BYTES).toString("utf8")}\n…(truncated)`,
    truncated: true,
  };
}

/**
 * Resolve chat attachments for the run: latest-turn native files plus
 * thread-wide extracted/converted text so follow-ups can still search a PDF.
 */
export async function resolveTieredAttachments(params: {
  accessToken?: string;
  coreBaseUrl?: string;
  /** Prior turns from the thread store — the AG-UI run only sends the current message. */
  historyMessages?: readonly { parts?: unknown; role?: string }[];
  input: RunAgentInput;
}): Promise<TieredAttachmentResolution> {
  const { accessToken } = params;
  const coreBaseUrl = params.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv();
  const latestRefs = latestUserAttachments(params.input);
  const threadRefs = collectThreadUserAttachments({
    ...params.input,
    messages: [
      ...(params.historyMessages ?? []),
      ...(Array.isArray(params.input.messages) ? params.input.messages : []),
    ],
  } as RunAgentInput).slice(-8);
  const latestKeys = new Set(latestRefs.map((ref) => ref.storageKey));
  const refs = threadRefs.length > 0 ? threadRefs : latestRefs;
  if (refs.length === 0) {
    return { contextEntries: [], modelAttachments: [] };
  }
  if (!(coreBaseUrl && accessToken)) {
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
    accessToken,
    bucket: "files",
    coreBaseUrl,
  });

  const modelAttachments: ModelAttachmentFile[] = [];
  const manifestBlocks: string[] = [];
  let serverConverts = 0;

  for (const ref of refs) {
    const onLatestTurn = latestKeys.has(ref.storageKey);
    try {
      let extracted =
        (await loadExtractedMarkdownForRef(fileClient, ref)) ?? null;
      let extractedKey = ref.extractedStorageKey?.trim() ?? "";
      if (extracted && !extractedKey && ref.extractedMarkdown?.trim()) {
        extractedKey =
          (await writeExtractedMarkdownSidecar(
            fileClient,
            ref.storageKey,
            extracted
          )) ?? "";
      }
      if (extracted && !extractedKey) {
        extractedKey = extractedMarkdownSidecarKey(ref.storageKey);
      }

      const needsNativeFile = onLatestTurn && isModelNativeMime(ref.mimeType);
      const needsConvert =
        !(
          extracted ||
          ref.mimeType.startsWith("image/") ||
          isTextLikeAttachment(ref.mimeType, ref.filename)
        ) && serverConverts < 4;

      if (!(extracted || needsNativeFile || needsConvert || onLatestTurn)) {
        continue;
      }

      let bytes: Uint8Array | null | undefined;
      const ensureBytes = async (): Promise<Uint8Array | null> => {
        if (bytes !== undefined) {
          return bytes;
        }
        bytes = await fileClient.download(ref.storageKey);
        return bytes;
      };

      if (needsConvert) {
        serverConverts += 1;
        const raw = await ensureBytes();
        if (raw) {
          const markdown = await extractMarkdownWithDocConverter({
            bytes: raw,
            filename: ref.filename,
            mimeType: ref.mimeType,
          });
          if (markdown) {
            extracted = markdown;
            extractedKey =
              (await writeExtractedMarkdownSidecar(
                fileClient,
                ref.storageKey,
                markdown
              )) ?? extractedMarkdownSidecarKey(ref.storageKey);
          }
        }
      }

      if (needsNativeFile) {
        const raw = await ensureBytes();
        if (raw) {
          const mime = ref.mimeType.toLowerCase().trim();
          if (mime.startsWith("image/")) {
            const prepared = await prepareModelNativeImage(raw);
            if (prepared) {
              modelAttachments.push({
                data: prepared.data,
                mediaType: prepared.mediaType,
                ...(ref.filename ? { filename: ref.filename } : {}),
              });
            }
          } else {
            modelAttachments.push({
              data: `data:${ref.mimeType};base64,${Buffer.from(raw).toString("base64")}`,
              mediaType: ref.mimeType,
              ...(ref.filename ? { filename: ref.filename } : {}),
            });
          }
        }
      }

      if (extracted) {
        const clipped = clipManifestBody(extracted);
        manifestBlocks.push(
          formatAttachmentManifestEntry({
            body: clipped.body,
            extractedStorageKey: extractedKey || undefined,
            filename: ref.filename,
            mimeType: ref.mimeType,
            sizeBytes: ref.sizeBytes ?? 0,
            storageKey: ref.storageKey,
            tier: clipped.truncated ? "tool_backed" : "inline_text",
            truncated: clipped.truncated,
          })
        );
        continue;
      }

      const raw = await ensureBytes();
      if (!raw) {
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
        byteLength: raw.byteLength,
        filename: ref.filename,
        mimeType: ref.mimeType,
      });

      let body: string | undefined;
      let truncated = false;
      if (tier === "inline_text") {
        const sample = truncateUtf8(raw, INLINE_TEXT_MAX_BYTES);
        body = sample.text;
        truncated = sample.truncated;
      } else if (
        tier === "tool_backed" &&
        isTextLikeAttachment(ref.mimeType, ref.filename)
      ) {
        const sample = truncateUtf8(raw, TOOL_BACKED_PREVIEW_BYTES);
        body = sample.text;
        truncated = true;
      }

      const feedTier =
        body && !truncated && tier !== "tool_backed"
          ? "inline_text"
          : tier === "inline_text" && truncated
            ? "tool_backed"
            : tier;

      manifestBlocks.push(
        formatAttachmentManifestEntry({
          body,
          filename: ref.filename,
          mimeType: ref.mimeType,
          sizeBytes: raw.byteLength,
          storageKey: ref.storageKey,
          tier: feedTier,
          truncated: body ? truncated : undefined,
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
    contextEntries: [
      {
        description: "user_attachments",
        value: [
          "The user attached these files in this thread:",
          "",
          ...manifestBlocks,
          "",
          'Rules: prefer inlined Content when present. For tool_backed / deeper work (summarize, ask questions, convert, extract), call agent-file_analyst with extracted_storage_key when listed (full markdown), otherwise storage_key, plus the user\'s goal. Extracted markdown may include <page-break number="N" total="T"></page-break> sentinels — use them for citations and page ranges; do not show the tags to the user.',
        ].join("\n"),
      },
    ],
    modelAttachments,
  };
}
