// Files-module preview surface: renders a file's content inline on the detail
// page. Office docs convert to PDF via Gotenberg (on demand); PDFs/images/AV
// render natively; text-based files (CSV/TXT/MD/JSON) are fetched from the
// signed URL and rendered here so agent-written workspace files (e.g. CSV)
// stop showing "no preview". Preview generation is lazy (at view time), not an
// upload-time ingest step — so the file's origin (upload vs workspace sync)
// does not affect preview eligibility.
import { MessageResponse } from "@engenty/ai-ui";
import {
  isFileStorageCsvMime,
  isFileStorageMarkdownMime,
  isFileStorageOfficePdfPreviewMime,
  isFileStorageTextPreviewMime,
} from "@engenty/file-storage";
import { useQuery } from "@engenty/query-client";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { File, FileImage, FileText } from "lucide-react";
import { getFilesPreviewPdfUrl } from "../api.js";
import { useFilesPreviewAgentUiSlice } from "../hooks/use-files-agent-ui-slice.js";

/** Cap rendered text so very large files do not freeze the detail page. */
const TEXT_PREVIEW_MAX_BYTES = 512 * 1024;
const CSV_PREVIEW_MAX_ROWS = 200;

export function getFileIcon(mime: string) {
  if (mime.startsWith("image/")) {
    return FileImage;
  }
  if (mime === "application/pdf") {
    return FileText;
  }
  return File;
}

function NoPreview(props: { mimeType: string; label: string }) {
  const Icon = getFileIcon(props.mimeType);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-muted border-dashed p-8 text-center">
      <Icon className="h-16 w-16 text-muted-foreground/40" />
      <p className="text-muted-foreground text-sm">{props.label}</p>
    </div>
  );
}

/** Minimal RFC-4180-ish parser: handles quoted fields, escaped quotes, CRLF. */
export function parseDelimitedText(
  text: string,
  delimiter: string
): string[][] {
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

function CsvTable(props: { text: string; mimeType: string }) {
  const delimiter = props.mimeType === "text/tab-separated-values" ? "\t" : ",";
  const allRows = parseDelimitedText(props.text, delimiter);
  const rows = allRows.slice(0, CSV_PREVIEW_MAX_ROWS);
  if (rows.length === 0) {
    return null;
  }
  const [header, ...body] = rows;
  return (
    <div className="max-h-[min(70vh,800px)] overflow-auto overscroll-contain">
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

function TextFilePreview(props: {
  fileKey: string;
  loadingLabel: string;
  mimeType: string;
  noPreviewLabel: string;
  truncatedLabel: string;
  url: string;
}) {
  const query = useQuery({
    queryFn: async ({ signal }) => {
      const response = await fetch(props.url, { signal });
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
    queryKey: ["files", "text-preview", props.fileKey],
  });

  if (query.isPending) {
    return (
      <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center">
        <AnimatedLoaderIcon
          className="text-muted-foreground"
          play="always"
          size={40}
        />
        <p className="text-muted-foreground text-sm">{props.loadingLabel}</p>
      </div>
    );
  }
  if (query.isError || query.data === undefined) {
    return <NoPreview label={props.noPreviewLabel} mimeType={props.mimeType} />;
  }

  return (
    <div className="ui-canvas-panel rounded-lg border-0 bg-card">
      {isFileStorageCsvMime(props.mimeType) ? (
        <CsvTable mimeType={props.mimeType} text={query.data.text} />
      ) : isFileStorageMarkdownMime(props.mimeType) ? (
        <div className="max-h-[min(70vh,800px)] overflow-y-auto overscroll-contain p-3">
          <MessageResponse className="prose prose-sm dark:prose-invert max-w-none">
            {query.data.text}
          </MessageResponse>
        </div>
      ) : (
        <pre className="max-h-[min(70vh,800px)] overflow-auto overscroll-contain whitespace-pre-wrap break-words p-3 font-mono text-xs">
          {query.data.text}
        </pre>
      )}
      {query.data.truncated ? (
        <p className="border-border/60 border-t px-3 py-1.5 text-muted-foreground text-xs">
          {props.truncatedLabel}
        </p>
      ) : null}
    </div>
  );
}

export function FilePreviewBlock(props: {
  fileKey: string;
  filename: string;
  generatingLabel: string;
  loadingLabel: string;
  mimeType: string;
  noPreviewLabel: string;
  truncatedLabel: string;
  url: string;
}) {
  const {
    fileKey,
    filename,
    generatingLabel,
    loadingLabel,
    mimeType,
    noPreviewLabel,
    truncatedLabel,
    url,
  } = props;

  // Path + name only — never file contents.
  useFilesPreviewAgentUiSlice({ fileKey, filename });

  const officePreview = useQuery({
    queryFn: ({ signal }) =>
      getFilesPreviewPdfUrl(fileKey, undefined, { signal }),
    queryKey: ["files", "preview-pdf", fileKey],
    enabled: isFileStorageOfficePdfPreviewMime(mimeType),
  });

  if (isFileStorageOfficePdfPreviewMime(mimeType)) {
    if (officePreview.isPending) {
      return (
        <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center">
          <AnimatedLoaderIcon
            className="text-muted-foreground"
            play="always"
            size={40}
          />
          <p className="text-muted-foreground text-sm">{generatingLabel}</p>
        </div>
      );
    }
    if (officePreview.isError || !officePreview.data?.url) {
      return <NoPreview label={noPreviewLabel} mimeType={mimeType} />;
    }
    return (
      <iframe
        className="ui-canvas-panel h-full min-h-[600px] w-full rounded-lg border-0"
        src={officePreview.data.url}
        title={filename}
      />
    );
  }

  if (mimeType === "application/pdf") {
    return (
      <iframe
        className="ui-canvas-panel h-full min-h-[600px] w-full rounded-lg border-0"
        src={url}
        title={filename}
      />
    );
  }

  if (mimeType.startsWith("image/")) {
    return (
      <div className="ui-canvas-panel flex h-full items-center justify-center rounded-lg border-0 bg-card p-4">
        <img
          alt={filename}
          className="max-h-[600px] w-auto rounded object-contain"
          height={600}
          src={url}
          width={800}
        />
      </div>
    );
  }

  if (mimeType.startsWith("audio/")) {
    return (
      <div className="ui-canvas-panel flex h-full items-center justify-center rounded-lg border-0 bg-card p-8">
        <audio className="w-full max-w-md" controls src={url}>
          <track kind="captions" />
        </audio>
      </div>
    );
  }

  if (mimeType.startsWith("video/")) {
    return (
      <div className="ui-canvas-panel flex h-full items-center justify-center rounded-lg border-0 bg-card p-4">
        <video className="max-h-[500px] w-full rounded" controls src={url}>
          <track kind="captions" />
        </video>
      </div>
    );
  }

  // Text-like content (CSV/TXT/MD/JSON/…): fetch the bytes and render inline.
  if (isFileStorageTextPreviewMime(mimeType)) {
    return (
      <TextFilePreview
        fileKey={fileKey}
        loadingLabel={loadingLabel}
        mimeType={mimeType}
        noPreviewLabel={noPreviewLabel}
        truncatedLabel={truncatedLabel}
        url={url}
      />
    );
  }

  return <NoPreview label={noPreviewLabel} mimeType={mimeType} />;
}
