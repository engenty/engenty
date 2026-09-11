import type { EngentyCoreFileStorageClient } from "../../ai/workspace/core-file-storage-client.js";

/** Keep in sync with `packages/ai-ui/src/lib/extracted-markdown-sidecar.ts`. */
export const EXTRACTED_MARKDOWN_SIDECAR_SUFFIX = ".extracted.md";

export function extractedMarkdownSidecarKey(storageKey: string): string {
  const key = storageKey.trim();
  if (!key || key.endsWith(EXTRACTED_MARKDOWN_SIDECAR_SUFFIX)) {
    return key;
  }
  return `${key}${EXTRACTED_MARKDOWN_SIDECAR_SUFFIX}`;
}

export async function readExtractedMarkdownSidecar(
  fileClient: EngentyCoreFileStorageClient,
  storageKey: string
): Promise<string | null> {
  const key = extractedMarkdownSidecarKey(storageKey);
  if (!key) {
    return null;
  }
  try {
    const bytes = await fileClient.download(key);
    if (!bytes || bytes.byteLength === 0) {
      return null;
    }
    const text = new TextDecoder("utf-8", { fatal: false })
      .decode(bytes)
      .trim();
    return text || null;
  } catch {
    return null;
  }
}

export async function writeExtractedMarkdownSidecar(
  fileClient: EngentyCoreFileStorageClient,
  originalStorageKey: string,
  markdown: string
): Promise<string | null> {
  const key = extractedMarkdownSidecarKey(originalStorageKey);
  if (!(key && markdown.trim())) {
    return null;
  }
  try {
    await fileClient.upload(key, new TextEncoder().encode(markdown), {
      contentType: "text/markdown",
      upsert: true,
    });
    return key;
  } catch {
    return null;
  }
}

export async function loadExtractedMarkdownForRef(
  fileClient: EngentyCoreFileStorageClient,
  ref: {
    extractedMarkdown?: string;
    extractedStorageKey?: string;
    storageKey: string;
  }
): Promise<string | null> {
  const inline = ref.extractedMarkdown?.trim();
  if (inline) {
    return inline;
  }
  return readExtractedMarkdownSidecar(
    fileClient,
    ref.extractedStorageKey || ref.storageKey
  );
}
