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
import { CsvTable } from "@engenty/import";
import { useQuery } from "@engenty/query-client";
import { Spinner } from "@engenty/ui-core";
import { File, FileImage, FileText } from "lucide-react";
import type { ReactNode } from "react";
import { MessageResponse } from "../components/presentation.js";
import { getFileStorageSignedUrl } from "../lib/file-storage-signed-url.js";
import { WorkFilePdfPreview } from "./work-file-pdf-preview.js";

const TEXT_PREVIEW_MAX_BYTES = 512 * 1024;

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

function PaddedPreview({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>;
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
    <div className="ui-card-panel">
      {isFileStorageCsvMime(mimeType) ? (
        // The shared grid from @engenty/import — the same parser the import
        // wizard reads with, so the preview and the importer cannot disagree
        // about the same bytes. Delimiter is detected, TSV included; the
        // grid's row window keeps large files cheap without a row cap.
        <div className="max-h-[min(60vh,640px)] overflow-auto">
          <CsvTable
            className="rounded-none border-0"
            readOnly
            value={query.data.text}
          />
        </div>
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
        <p className="border-border-soft border-t px-3 py-1.5 text-muted-foreground text-xs">
          {labels.truncated}
        </p>
      ) : null}
    </div>
  );
}

export interface WorkFilePreviewLabels {
  extractedTextLoading: string;
  loading: string;
  noExtractedText: string;
  noPreview: string;
  original: string;
  parsed: string;
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
      <PaddedPreview>
        <div className="flex min-h-[12rem] items-center justify-center">
          <Spinner />
        </div>
      </PaddedPreview>
    );
  }
  if (!urlQuery.data) {
    return (
      <PaddedPreview>
        <NoPreview label={labels.noPreview} />
      </PaddedPreview>
    );
  }
  const url = urlQuery.data;

  if (isFileStorageOfficePdfPreviewMime(mimeType)) {
    if (officeQuery.isPending) {
      return (
        <PaddedPreview>
          <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2">
            <Spinner />
            <p className="text-muted-foreground text-sm">{labels.loading}</p>
          </div>
        </PaddedPreview>
      );
    }
    if (!officeQuery.data?.url) {
      return (
        <PaddedPreview>
          <NoPreview label={labels.noPreview} />
        </PaddedPreview>
      );
    }
    return (
      <PaddedPreview>
        <iframe
          className="ui-card-panel h-full min-h-[20rem] w-full"
          src={officeQuery.data.url}
          title={filename}
        />
      </PaddedPreview>
    );
  }

  if (mimeType === "application/pdf") {
    return (
      <WorkFilePdfPreview
        filename={filename}
        labels={{
          extractedTextLoading: labels.extractedTextLoading,
          noExtractedText: labels.noExtractedText,
          original: labels.original,
          parsed: labels.parsed,
          truncated: labels.truncated,
        }}
        storageKey={entryKey}
        url={url}
      />
    );
  }

  if (mimeType.startsWith("image/")) {
    return (
      <PaddedPreview>
        <div className="ui-card-panel flex items-center justify-center p-4">
          <img
            alt={filename}
            className="max-h-[min(60vh,640px)] w-auto rounded object-contain"
            height={640}
            src={url}
            width={800}
          />
        </div>
      </PaddedPreview>
    );
  }

  if (isFileStorageTextPreviewMime(mimeType)) {
    return (
      <PaddedPreview>
        <TextPreview
          fileKey={entryKey}
          labels={labels}
          mimeType={mimeType}
          url={url}
        />
      </PaddedPreview>
    );
  }

  return (
    <PaddedPreview>
      <NoPreview label={labels.noPreview} />
    </PaddedPreview>
  );
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
