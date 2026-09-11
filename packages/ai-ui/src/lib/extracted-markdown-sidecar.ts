/** Durable sibling of a chat PDF/office file: extracted markdown for preview + runs. */
export const EXTRACTED_MARKDOWN_SIDECAR_SUFFIX = ".extracted.md";

export function extractedMarkdownSidecarKey(storageKey: string): string {
  const key = storageKey.trim();
  if (!key || key.endsWith(EXTRACTED_MARKDOWN_SIDECAR_SUFFIX)) {
    return key;
  }
  return `${key}${EXTRACTED_MARKDOWN_SIDECAR_SUFFIX}`;
}
