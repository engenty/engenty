import type { BrowserParseProvider } from "@engenty/ai-core/browser";
import { resolveBrowserParse } from "@engenty/ai-core/browser";
import { requestApiJson } from "@engenty/api-client";
import type { FileUIPart } from "ai";
import { getAiConfig } from "./admin/ai-settings-api.js";
import { parseChatDocumentInBrowser } from "./browser-doc-parse/parse-chat-document.js";
import {
  buildChatAttachmentPart,
  type ChatAttachmentMeta,
  type ChatAttachmentPart,
} from "./chat-attachment-part.js";
import { extractedMarkdownSidecarKey } from "./extracted-markdown-sidecar.js";
import { getFileStorageSignedUrl } from "./file-storage-signed-url.js";

// Internal file-storage layout: `tenants/<tenant-id>/<module-folder>/…`.
// Inlined (rather than importing `@engenty/file-storage`, a server package) to
// keep this browser module self-contained.
function chatAttachmentStorageKey(
  tenantId: string,
  ...segments: string[]
): string {
  return ["tenants", tenantId, "chat", ...segments].join("/");
}

const EXTENSION_MIME: Record<string, string> = {
  csv: "text/csv",
  gif: "image/gif",
  heic: "image/heic",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  svg: "image/svg+xml",
  txt: "text/plain",
  webp: "image/webp",
};

function guessMimeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MIME[ext] ?? "application/octet-stream";
}

/** Largest single chat attachment accepted through the signed-PUT path. */
export const CHAT_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

/** Max attachments per message turn. */
export const CHAT_ATTACHMENT_MAX_FILES = 10;

export interface ChatAttachmentUpload {
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
}

interface SignedUploadPayload {
  bucket: string;
  headers?: Record<string, string>;
  key: string;
  url: string;
}

function safeAttachmentName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.length > 0 ? cleaned : "attachment";
}

function resolveContentType(file: File, safeName: string): string {
  const raw = file.type?.trim() ?? "";
  if (
    !raw ||
    raw === "application/octet-stream" ||
    raw === "application/x-download"
  ) {
    return guessMimeFromFilename(safeName);
  }
  return raw;
}

/**
 * Browser-direct upload of a chat attachment into the internal `files` bucket.
 * Requests a signed URL from core, PUTs the bytes, and returns the durable
 * tenant-scoped storage key the message will reference. Mirrors the Vault
 * upload flow (`modules/files/ui/api.ts::uploadFileViaSignedUrl`) but stays
 * self-contained so `@engenty/ai-ui` takes no module dependency.
 */
export async function uploadChatAttachment(input: {
  file: File;
  tenantId: string;
  /** Groups attachments under `tenants/<id>/chat/<threadId>/…`; falls back to `uploads`. */
  threadId?: string | null;
}): Promise<ChatAttachmentUpload> {
  const { file, tenantId } = input;
  if (!tenantId) {
    throw new Error("chat_attachment_tenant_required");
  }
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
    throw new Error("chat_attachment_too_large");
  }

  const safeName = safeAttachmentName(file.name);
  const contentType = resolveContentType(file, safeName);
  const key = chatAttachmentStorageKey(
    tenantId,
    input.threadId?.trim() || "uploads",
    `${Date.now()}_${safeName}`
  );

  const signed = await requestApiJson<SignedUploadPayload>(
    "/api/file-storage/files/signed-upload-url",
    {
      method: "POST",
      body: JSON.stringify({ key, content_type: contentType }),
    }
  );

  const headers = new Headers(signed.headers ?? {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", contentType);
  }
  const response = await fetch(signed.url, {
    body: file,
    headers,
    method: "PUT",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `chat_attachment_upload_failed_${response.status}`);
  }

  return {
    filename: file.name || safeName,
    mimeType: contentType,
    size: file.size,
    storageKey: signed.key ?? key,
  };
}

async function putChatAttachmentObject(input: {
  bytes: Blob;
  contentType: string;
  key: string;
}): Promise<string> {
  const signed = await requestApiJson<SignedUploadPayload>(
    "/api/file-storage/files/signed-upload-url",
    {
      method: "POST",
      body: JSON.stringify({
        key: input.key,
        content_type: input.contentType,
      }),
    }
  );
  const headers = new Headers(signed.headers ?? {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", input.contentType);
  }
  const response = await fetch(signed.url, {
    body: input.bytes,
    headers,
    method: "PUT",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `chat_attachment_upload_failed_${response.status}`);
  }
  return signed.key ?? input.key;
}

async function resolveChatBrowserParse(): Promise<BrowserParseProvider> {
  try {
    const config = await getAiConfig();
    return resolveBrowserParse(config.doc_converter);
  } catch {
    return "anydoc";
  }
}

async function extractChatDocumentMarkdown(
  file: File,
  mode: BrowserParseProvider
): Promise<{
  extractedBy: string;
  extractedMarkdown: string;
} | null> {
  if (mode === "off") {
    return null;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const parsed = await parseChatDocumentInBrowser({
    bytes,
    filename: file.name,
    mimeType: file.type || guessMimeFromFilename(file.name),
    mode,
  });
  if (!parsed) {
    return null;
  }
  return {
    extractedBy: parsed.provider,
    extractedMarkdown: parsed.markdown,
  };
}

async function filePartToFile(part: FileUIPart): Promise<File> {
  // The composer converts blob URLs to data URLs before submit; both are
  // fetchable back into bytes so we upload the real file, not base64 text.
  const response = await fetch(part.url);
  const blob = await response.blob();
  const filename = part.filename || "attachment";
  const mediaType = part.mediaType || blob.type || "application/octet-stream";
  return new File([blob], filename, { type: mediaType });
}

/**
 * Upload every composer attachment to the Vault and return the AG-UI content
 * parts to carry on the user turn. Each part references the durable storage key
 * (in `metadata`) plus a fresh signed read URL (in `source`) for optimistic
 * render. Throws on the first failure so the composer can keep the draft.
 */
export async function uploadChatAttachmentParts(input: {
  files: readonly FileUIPart[];
  tenantId: string;
  threadId?: string | null;
}): Promise<ChatAttachmentPart[]> {
  const parts: ChatAttachmentPart[] = [];
  const browserParse = await resolveChatBrowserParse();
  for (const filePart of input.files) {
    const file = await filePartToFile(filePart);
    const [meta, extracted] = await Promise.all([
      uploadChatAttachment({
        file,
        tenantId: input.tenantId,
        threadId: input.threadId,
      }),
      extractChatDocumentMarkdown(file, browserParse),
    ]);
    const attachmentMeta: ChatAttachmentMeta = { ...meta };
    if (extracted) {
      const sidecarKey = extractedMarkdownSidecarKey(meta.storageKey);
      try {
        attachmentMeta.extractedStorageKey = await putChatAttachmentObject({
          bytes: new Blob([extracted.extractedMarkdown], {
            type: "text/markdown",
          }),
          contentType: "text/markdown",
          key: sidecarKey,
        });
        attachmentMeta.extractedBy = extracted.extractedBy;
      } catch {
        // Sidecar failed — keep a clipped copy on the part so the run can
        // still inline text. Preview will miss the extract until retry.
        attachmentMeta.extractedBy = extracted.extractedBy;
        attachmentMeta.extractedMarkdown = extracted.extractedMarkdown;
      }
    }
    let url = "";
    try {
      url = await getFileStorageSignedUrl(attachmentMeta.storageKey);
    } catch {
      // Render re-derives a fresh signed URL from the storage key (Layer 3),
      // so an empty source URL is a safe fallback that keeps base64 out of the DB.
    }
    parts.push(buildChatAttachmentPart({ meta: attachmentMeta, url }));
  }
  return parts;
}
