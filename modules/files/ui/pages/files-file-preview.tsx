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
import { CsvTable } from "@engenty/import";
import { useQuery } from "@engenty/query-client";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { File, FileImage, FileText } from "lucide-react";
import { getFilesPreviewPdfUrl } from "../api.js";
import { useFilesPreviewAgentUiSlice } from "../hooks/use-files-agent-ui-slice.js";

/** Cap rendered text so very large files do not freeze the detail page. */
const TEXT_PREVIEW_MAX_BYTES = 512 * 1024;

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
    <div className="ui-card-panel">
      {isFileStorageCsvMime(props.mimeType) ? (
        // The shared grid from @engenty/import — the same parser the import
        // wizard reads with, so preview and importer cannot disagree about
        // the same bytes. Delimiter detected, TSV included; the grid's row
        // window keeps large files cheap without a row cap.
        <div className="max-h-[min(70vh,800px)] overflow-auto overscroll-contain">
          <CsvTable
            className="rounded-none border-0"
            readOnly
            value={query.data.text}
          />
        </div>
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
        <p className="border-border-soft border-t px-3 py-1.5 text-muted-foreground text-xs">
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
        className="ui-card-panel h-full min-h-[600px] w-full"
        src={officePreview.data.url}
        title={filename}
      />
    );
  }

  if (mimeType === "application/pdf") {
    return (
      <iframe
        className="ui-card-panel h-full min-h-[600px] w-full"
        src={url}
        title={filename}
      />
    );
  }

  if (mimeType.startsWith("image/")) {
    return (
      <div className="ui-card-panel flex h-full items-center justify-center p-4">
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
      <div className="ui-card-panel flex h-full items-center justify-center p-8">
        <audio className="w-full max-w-md" controls src={url}>
          <track kind="captions" />
        </audio>
      </div>
    );
  }

  if (mimeType.startsWith("video/")) {
    return (
      <div className="ui-card-panel flex h-full items-center justify-center p-4">
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
