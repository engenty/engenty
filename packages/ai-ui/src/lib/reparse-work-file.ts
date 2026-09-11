import { requestApiJson } from "@engenty/api-client";
import { guessFileStorageMimeFromFilename } from "@engenty/file-storage";
import { parseChatDocumentInBrowser } from "./browser-doc-parse/parse-chat-document.js";
import { extractedMarkdownSidecarKey } from "./extracted-markdown-sidecar.js";
import { getFileStorageSignedUrl } from "./file-storage-signed-url.js";

export type BrowserReparseEngine = "anydoc" | "liteparse-wasm";
export type ServerReparseEngine =
  | "local"
  | "liteparse"
  | "llamaparse"
  | "mistral"
  | "gemini";
export type ReparseEngine = BrowserReparseEngine | ServerReparseEngine;

interface SignedUploadPayload {
  headers?: Record<string, string>;
  key: string;
  url: string;
}

interface ServerExtractPayload {
  markdown?: string;
}

export function isBrowserReparseEngine(
  engine: ReparseEngine
): engine is BrowserReparseEngine {
  return engine === "anydoc" || engine === "liteparse-wasm";
}

async function putFileStorageObject(input: {
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
    throw new Error(text || `reparse_upload_failed_${response.status}`);
  }
  return signed.key ?? input.key;
}

async function parseInBrowser(input: {
  engine: BrowserReparseEngine;
  filename: string;
  storageKey: string;
}): Promise<string> {
  const url = await getFileStorageSignedUrl(input.storageKey);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`reparse_download_failed_${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const parsed = await parseChatDocumentInBrowser({
    bytes,
    filename: input.filename,
    mimeType: guessFileStorageMimeFromFilename(input.filename),
    mode: input.engine === "liteparse-wasm" ? "liteparse" : "anydoc",
  });
  const markdown = parsed?.markdown.trim() ?? "";
  if (!markdown) {
    throw new Error("reparse_empty");
  }
  return markdown;
}

async function parseOnServer(input: {
  engine: ServerReparseEngine;
  storageKey: string;
}): Promise<string> {
  const result = await requestApiJson<ServerExtractPayload>(
    "/api/file-storage/files/extract",
    {
      method: "POST",
      body: JSON.stringify({
        key: input.storageKey,
        provider: input.engine,
      }),
      signal: AbortSignal.timeout(300_000),
    }
  );
  const markdown = result.markdown?.trim() ?? "";
  if (!markdown) {
    throw new Error("reparse_empty");
  }
  return markdown;
}

/** Re-extract markdown for a vault file and overwrite the `.extracted.md` sidecar. */
export async function reparseWorkFile(input: {
  engine: ReparseEngine;
  filename: string;
  storageKey: string;
}): Promise<string> {
  const markdown = isBrowserReparseEngine(input.engine)
    ? await parseInBrowser({
        engine: input.engine,
        filename: input.filename,
        storageKey: input.storageKey,
      })
    : await parseOnServer({
        engine: input.engine,
        storageKey: input.storageKey,
      });
  const sidecarKey = extractedMarkdownSidecarKey(input.storageKey);
  await putFileStorageObject({
    bytes: new Blob([markdown], { type: "text/markdown" }),
    contentType: "text/markdown",
    key: sidecarKey,
  });
  return sidecarKey;
}
