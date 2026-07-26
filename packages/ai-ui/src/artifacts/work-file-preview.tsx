// Inline preview for a workspace file (signed URL + mime guessed from name).
// Mirrors modules/files FilePreviewBlock for the cases agents write most often
// (json/md/txt/csv/images/pdf); office docs use the core preview-pdf route.
import { requestApiJson } from "@engenty/api-client";
import {
  guessFileStorageMimeFromFilename,
  isFileStorageCsvMime,
  isFileStorageMarkdownMime,
  isFileStorageOfficePdfPreviewMime,
  isFileStorageTextPreviewMime,
} from "@engenty/file-storage";
import { useQuery } from "@engenty/query-client";
import { Spinner } from "@engenty/ui-core";
import { File, FileImage, FileText } from "lucide-react";
import { MessageResponse } from "../components/presentation.js";
import { getFileStorageSignedUrl } from "../lib/file-storage-signed-url.js";

const TEXT_PREVIEW_MAX_BYTES = 512 * 1024;
const CSV_PREVIEW_MAX_ROWS = 200;

export function workFileMime(filename: string): string {
  const base = filename.split("/").pop() ?? filename;
  // Dotfiles like `.keep` have no useful extension; treat as plain text.
  if (base.startsWith(".") && !base.slice(1).includes(".")) {
    return "text/plain";
  }
  return guessFileStorageMimeFromFilename(filename);
}

export function workFileIcon(mime: string) {
  if (mime.startsWith("image/")) {
    return FileImage;
  }
  if (mime === "application/pdf" || isFileStorageTextPreviewMime(mime)) {
    return FileText;
  }
  return File;
}

function NoPreview({ label }: { label: string }) {
  return (
    <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center">
      <File className="size-10 text-muted-foreground/40" />
      <p className="text-muted-foreground text-sm">{label}</p>
    </div>
  );
}

function parseDelimitedText(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function CsvTable({ mimeType, text }: { mimeType: string; text: string }) {
  const delimiter = mimeType === "text/tab-separated-values" ? "\t" : ",";
  const rows = parseDelimitedText(text, delimiter).slice(
    0,
    CSV_PREVIEW_MAX_ROWS
  );
  if (rows.length === 0) {
    return null;
  }
  const [header, ...body] = rows;
  return (
    <div className="max-h-[min(60vh,640px)] overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-card">
          <tr>
            {header?.map((cell, i) => (
              <th
                className="border-border border-b px-2 py-1.5 text-left font-medium"
                key={`h-${i}`}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((cells, r) => (
            <tr className="odd:bg-muted/30" key={`r-${r}`}>
              {cells.map((cell, ci) => (
                <td
                  className="border-border/60 border-b px-2 py-1 align-top font-mono text-xs"
                  key={`c-${r}-${ci}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TextPreview({
  fileKey,
  labels,
  mimeType,
  url,
}: {
  fileKey: string;
  labels: WorkFilePreviewLabels;
  mimeType: string;
  url: string;
}) {
  const query = useQuery({
    queryFn: async ({ signal }) => {
      const response = await fetch(url, { signal });
      if (!response.ok) {
        throw new Error(`Failed to load file (${response.status})`);
      }
      const text = await response.text();
      const truncated = text.length > TEXT_PREVIEW_MAX_BYTES;
      return {
        text: truncated ? text.slice(0, TEXT_PREVIEW_MAX_BYTES) : text,
        truncated,
      };
    },
    queryKey: ["work-files", "text-preview", fileKey],
  });

  if (query.isPending) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <NoPreview label={labels.noPreview} />;
  }

  return (
    <div className="ui-canvas-panel rounded-lg bg-card">
      {isFileStorageCsvMime(mimeType) ? (
        <CsvTable mimeType={mimeType} text={query.data.text} />
      ) : isFileStorageMarkdownMime(mimeType) ? (
        <div className="max-h-[min(60vh,640px)] overflow-y-auto p-3">
          <MessageResponse className="prose prose-sm dark:prose-invert max-w-none">
            {query.data.text}
          </MessageResponse>
        </div>
      ) : (
        <pre className="max-h-[min(60vh,640px)] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs">
          {query.data.text}
        </pre>
      )}
      {query.data.truncated ? (
        <p className="border-border/60 border-t px-3 py-1.5 text-muted-foreground text-xs">
          {labels.truncated}
        </p>
      ) : null}
    </div>
  );
}

export interface WorkFilePreviewLabels {
  loading: string;
  noPreview: string;
  truncated: string;
}

export function WorkFilePreview({
  entryKey,
  filename,
  labels,
}: {
  entryKey: string;
  filename: string;
  labels: WorkFilePreviewLabels;
}) {
  const mimeType = workFileMime(filename);
  const urlQuery = useQuery({
    queryFn: () => getFileStorageSignedUrl(entryKey),
    queryKey: ["work-files", "signed-url", entryKey],
    staleTime: 30_000,
  });
  const officeQuery = useQuery({
    enabled: isFileStorageOfficePdfPreviewMime(mimeType),
    queryFn: () =>
      requestApiJson<{ url: string }>(
        `/api/file-storage/files/preview-pdf?${new URLSearchParams({
          key: entryKey,
        })}`
      ),
    queryKey: ["work-files", "preview-pdf", entryKey],
  });

  if (urlQuery.isPending) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!urlQuery.data) {
    return <NoPreview label={labels.noPreview} />;
  }
  const url = urlQuery.data;

  if (isFileStorageOfficePdfPreviewMime(mimeType)) {
    if (officeQuery.isPending) {
      return (
        <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2">
          <Spinner />
          <p className="text-muted-foreground text-sm">{labels.loading}</p>
        </div>
      );
    }
    if (!officeQuery.data?.url) {
      return <NoPreview label={labels.noPreview} />;
    }
    return (
      <iframe
        className="ui-canvas-panel h-full min-h-[20rem] w-full rounded-lg border-0"
        src={officeQuery.data.url}
        title={filename}
      />
    );
  }

  if (mimeType === "application/pdf") {
    return (
      <iframe
        className="ui-canvas-panel h-full min-h-[20rem] w-full rounded-lg border-0"
        src={url}
        title={filename}
      />
    );
  }

  if (mimeType.startsWith("image/")) {
    return (
      <div className="ui-canvas-panel flex items-center justify-center rounded-lg bg-card p-4">
        <img
          alt={filename}
          className="max-h-[min(60vh,640px)] w-auto rounded object-contain"
          height={640}
          src={url}
          width={800}
        />
      </div>
    );
  }

  if (isFileStorageTextPreviewMime(mimeType)) {
    return (
      <TextPreview
        fileKey={entryKey}
        labels={labels}
        mimeType={mimeType}
        url={url}
      />
    );
  }

  return <NoPreview label={labels.noPreview} />;
}

export async function downloadWorkFile(
  entryKey: string,
  filename: string
): Promise<void> {
  const url = await getFileStorageSignedUrl(entryKey);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}
