const TEXT_LIKE_EXTENSIONS = new Set([
  "cfg",
  "conf",
  "css",
  "env",
  "htm",
  "html",
  "ini",
  "js",
  "json",
  "jsonl",
  "jsx",
  "log",
  "md",
  "markdown",
  "py",
  "sql",
  "toml",
  "ts",
  "tsv",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
]);

export function isTextLikeMime(mimeType: string, filename?: string): boolean {
  const mime = mimeType.toLowerCase().trim();
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/javascript" ||
    mime === "application/typescript" ||
    mime === "application/x-yaml" ||
    mime === "application/toml"
  ) {
    return true;
  }
  const ext = filename?.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_LIKE_EXTENSIONS.has(ext);
}
