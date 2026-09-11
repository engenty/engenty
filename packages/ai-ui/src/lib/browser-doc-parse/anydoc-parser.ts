import type { BrowserDocParseResult, BrowserDocParser } from "./types.js";

type AnydocFormat =
  | "csv"
  | "doc"
  | "docx"
  | "epub"
  | "odp"
  | "ods"
  | "odt"
  | "pdf"
  | "ppt"
  | "pptx"
  | "rtf"
  | "xlsx";

const MIME_TO_FORMAT: Record<string, AnydocFormat> = {
  "application/epub+zip": "epub",
  "application/msword": "doc",
  "application/pdf": "pdf",
  "application/rtf": "rtf",
  "application/vnd.ms-excel": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.oasis.opendocument.presentation": "odp",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "text/csv": "csv",
  "text/rtf": "rtf",
};

const EXT_TO_FORMAT: Record<string, AnydocFormat> = {
  csv: "csv",
  doc: "doc",
  docx: "docx",
  epub: "epub",
  odp: "odp",
  ods: "ods",
  odt: "odt",
  pdf: "pdf",
  ppt: "ppt",
  pptx: "pptx",
  rtf: "rtf",
  xlsx: "xlsx",
};

let initPromise: Promise<void> | null = null;

async function ensureAnydoc(): Promise<
  typeof import("@firecrawl/anydoc-wasm")
> {
  const mod = await import("@firecrawl/anydoc-wasm");
  initPromise ??= (async () => {
    await mod.default();
  })();
  await initPromise;
  return mod;
}

export function anydocFormatFor(
  mimeType: string,
  filename?: string
): AnydocFormat | null {
  const mime = mimeType.toLowerCase().trim();
  if (MIME_TO_FORMAT[mime]) {
    return MIME_TO_FORMAT[mime];
  }
  const ext = filename?.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_FORMAT[ext] ?? null;
}

export const anydocBrowserParser: BrowserDocParser = {
  id: "anydoc",
  canParse(mimeType, filename) {
    return anydocFormatFor(mimeType, filename) != null;
  },
  async parse(input): Promise<BrowserDocParseResult | null> {
    const format = anydocFormatFor(input.mimeType, input.filename);
    if (!format) {
      return null;
    }
    const mod = await ensureAnydoc();
    const markdown = mod.toMarkdownBytes(input.bytes, format).trim();
    if (!markdown) {
      return null;
    }
    return { markdown, provider: "anydoc" };
  },
};
