import { OFFER_FILE_DOWNLOADS_SPEC } from "./definition.js";

export interface OfferFileDownloadItem {
  key: string;
  mime_type?: string;
  name: string;
}

export const FILE_DOWNLOADS_OFFER_TYPE = "file_downloads" as const;

export interface OfferFileDownloadsToolOutput {
  __type: typeof FILE_DOWNLOADS_OFFER_TYPE;
  files: OfferFileDownloadItem[];
  ok: true;
}

export function fileNameFromStorageKey(key: string): string {
  const segments = key.split("/").filter(Boolean);
  return segments.at(-1) ?? key;
}

// Runtime authority for both the typed register handler and the untyped executor
// path (input: unknown), so it validates against the tool's single-source zod
// schema instead of re-parsing by hand. Filename derivation + the output
// envelope are domain logic beyond the schema and are kept.
export function runOfferFileDownloadsFrontendTool(
  input: unknown
): OfferFileDownloadsToolOutput {
  const parsed = OFFER_FILE_DOWNLOADS_SPEC.schema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      'offer_file_downloads requires input {"files":[{"key":"tenants/..."}]} with at least one file.'
    );
  }

  const files: OfferFileDownloadItem[] = [];
  for (const item of parsed.data.files) {
    const key = item.key.trim();
    if (!key) {
      throw new Error("Each file entry requires a non-empty key.");
    }
    const name = item.name?.trim()
      ? item.name.trim()
      : fileNameFromStorageKey(key);
    const mime_type = item.mime_type?.trim()
      ? item.mime_type.trim()
      : undefined;
    files.push({
      key,
      name,
      ...(mime_type ? { mime_type } : {}),
    });
  }

  return {
    ok: true,
    __type: FILE_DOWNLOADS_OFFER_TYPE,
    files,
  };
}
