export interface FileDownloadOfferItem {
  key: string;
  mime_type?: string;
  name: string;
}

export const FILE_DOWNLOADS_OFFER_TYPE = "file_downloads" as const;

export interface FileDownloadsOfferOutput {
  __type: typeof FILE_DOWNLOADS_OFFER_TYPE;
  files: FileDownloadOfferItem[];
  ok?: boolean;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function fileNameFromStorageKey(key: string): string {
  const segments = key.split("/").filter(Boolean);
  return segments.at(-1) ?? key;
}

function parseFileDownloadOfferItem(
  value: unknown
): FileDownloadOfferItem | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }
  const key = typeof record.key === "string" ? record.key.trim() : "";
  if (!key) {
    return null;
  }
  const name =
    typeof record.name === "string" && record.name.trim()
      ? record.name.trim()
      : fileNameFromStorageKey(key);
  const mime_type =
    typeof record.mime_type === "string" && record.mime_type.trim()
      ? record.mime_type.trim()
      : undefined;
  return {
    key,
    name,
    ...(mime_type ? { mime_type } : {}),
  };
}

export function parseFileDownloadOfferItems(
  value: unknown
): FileDownloadOfferItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const files: FileDownloadOfferItem[] = [];
  for (const item of value) {
    const parsed = parseFileDownloadOfferItem(item);
    if (parsed) {
      files.push(parsed);
    }
  }
  return files;
}

export function isFileDownloadsOfferOutput(
  value: unknown
): value is FileDownloadsOfferOutput {
  const record = readRecord(value);
  if (!record || record.__type !== FILE_DOWNLOADS_OFFER_TYPE) {
    return false;
  }
  return parseFileDownloadOfferItems(record.files).length > 0;
}

export function resolveFileDownloadOfferFiles(
  input: unknown,
  output: unknown
): FileDownloadOfferItem[] {
  if (isFileDownloadsOfferOutput(output)) {
    return output.files;
  }
  const outputRecord = readRecord(output);
  if (outputRecord) {
    const fromOutput = parseFileDownloadOfferItems(outputRecord.files);
    if (fromOutput.length > 0) {
      return fromOutput;
    }
  }
  const inputRecord = readRecord(input);
  if (!inputRecord) {
    return [];
  }
  const nestedInput = readRecord(inputRecord.input);
  const fromNested = parseFileDownloadOfferItems(nestedInput?.files);
  if (fromNested.length > 0) {
    return fromNested;
  }
  return parseFileDownloadOfferItems(inputRecord.files);
}

export function matchesFileDownloadsToolCall(ctx: {
  output?: unknown;
  resolvedToolName?: string;
}): boolean {
  if (ctx.resolvedToolName === "offer_file_downloads") {
    return true;
  }
  return isFileDownloadsOfferOutput(ctx.output);
}
