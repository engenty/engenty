/**
 * A text file, rendered as what it IS.
 *
 * An iframe on a signed URL showed markdown as its own source and a CSV as one
 * long line — the bytes, not the document. Both already have a renderer in this
 * codebase, so the pane hands the text to the right one: the markdown editor
 * for `.md`, the CSV grid for `.csv`/`.tsv`, monospace for the rest — and the
 * SAME components take the edit, so reading and writing a file never look like
 * two different documents.
 */
import {
  isFileStorageCsvMime,
  isFileStorageMarkdownMime,
  isFileStoragePdfMime,
} from "@engenty/file-storage";
import { useTranslation } from "@engenty/i18n/ui";
import { CsvTable } from "@engenty/import";
import { RichEditor } from "@engenty/tiptap-editor/rich";
import { Spinner } from "@engenty/ui-core";
import { useEffect, useMemo } from "react";
import { useFileSpacePreviewSrc } from "./file-preview-url";
import { csvTableLabels } from "./labels";
import { SpreadsheetFilePreview } from "./spreadsheet-preview";

function TextFilePreview({
  draft,
  mime,
  onDraftChange,
  oversized,
  query,
}: {
  draft: string | null;
  mime: string;
  onDraftChange: (next: string) => void;
  oversized: boolean;
  query: { data: string | undefined; error: unknown; isPending: boolean };
}) {
  const { t } = useTranslation("common");

  if (oversized) {
    return (
      <p className="p-6 text-muted-foreground text-sm">
        {t("spaces.data.tooLargeToPreview", {
          defaultValue: "Too large to preview here — download it to open it.",
        })}
      </p>
    );
  }
  if (query.isPending) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground text-sm">
        <Spinner className="size-4" />
        {t("spaces.data.loading")}
      </div>
    );
  }
  if (query.error || query.data === undefined) {
    return (
      <p className="p-6 text-destructive text-sm">
        {t("spaces.data.readFailed", {
          defaultValue: "This node could not be read.",
        })}
      </p>
    );
  }
  const editing = draft !== null;
  const value = draft ?? query.data;
  // Flush in every branch: the file IS the pane, so the pane's edges are its
  // edges. A bordered card inset from the window is a document pretending to be
  // a widget, and it costs the reader a line of text on every side.
  if (isFileStorageCsvMime(mime)) {
    return (
      <CsvTable
        className="rounded-none border-0"
        labels={csvTableLabels(t)}
        onChange={editing ? onDraftChange : undefined}
        readOnly={!editing}
        value={value}
      />
    );
  }
  if (isFileStorageMarkdownMime(mime)) {
    // The knowledge base's editor. Same component reading and writing, so a
    // `.md` file in a file space and a knowledge page behave the same way.
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <RichEditor
          editable={editing}
          // Keyed by mode: the editor takes `markdown` as its INITIAL document,
          // so without a remount, switching to editing would leave it showing
          // the read-only copy.
          key={editing ? "edit" : "read"}
          markdown={value}
          onChange={(_json, markdown) => onDraftChange(markdown)}
          showToolbar={editing}
        />
      </div>
    );
  }
  return (
    <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-6 py-4 font-mono text-xs">
      {value}
    </pre>
  );
}

function bytesFromMemberContent(
  content: string,
  encoding: "base64" | "utf8"
): Uint8Array<ArrayBuffer> {
  if (encoding === "utf8") {
    const encoded = new TextEncoder().encode(content);
    const copy = new Uint8Array(new ArrayBuffer(encoded.byteLength));
    copy.set(encoded);
    return copy;
  }
  const binary = atob(content);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * PDF / image members that arrived as Base64 (offer preview.pdf, etc.).
 *
 * Files in the Files tree do not come through here — they use a signed URL —
 * but other modules still embed bytes on the document, and dumping those into
 * a textarea freezes the pane.
 */
export function BlobFilePreview({
  content,
  encoding,
  label,
  mime,
}: {
  content: string;
  encoding: "base64" | "utf8";
  label: string;
  mime: string;
}) {
  const url = useMemo(() => {
    const blob = new Blob([bytesFromMemberContent(content, encoding)], {
      type: mime,
    });
    return URL.createObjectURL(blob);
  }, [content, encoding, mime]);
  useEffect(
    () => () => {
      URL.revokeObjectURL(url);
    },
    [url]
  );
  if (mime.startsWith("image/")) {
    return (
      // biome-ignore lint/correctness/useImageSize: member bytes carry no pixel dimensions.
      <img
        alt={label}
        className="max-h-full max-w-full object-contain p-6"
        src={url}
      />
    );
  }
  return (
    <iframe
      className="min-h-0 w-full flex-1 border-0"
      src={url}
      title={label}
    />
  );
}

/** Image, PDF, text, workbook, or the download-only fallback. */
export function FilePreviewBody({
  draft,
  error,
  label,
  mime,
  onDraftChange,
  oversized,
  sizeBytes,
  spreadsheet,
  text,
  textQuery,
  url,
  urlError,
  urlPending,
}: {
  draft: string | null;
  error: string | null;
  label: string;
  mime: string;
  onDraftChange: (next: string) => void;
  oversized: boolean;
  sizeBytes: number | null;
  spreadsheet: boolean;
  text: boolean;
  textQuery: { data: string | undefined; error: unknown; isPending: boolean };
  url: string | undefined;
  urlError: boolean;
  urlPending: boolean;
}) {
  const { t } = useTranslation("common");
  const pdf = isFileStoragePdfMime(mime, label);
  const image = mime.startsWith("image/");
  const flush = text || spreadsheet || pdf;
  const preview = useFileSpacePreviewSrc(url, mime, pdf || image);
  const previewUrl = preview.src;
  const previewPending = urlPending || preview.bytesPending;
  const previewError = urlError || preview.bytesError;
  return (
    <div
      className={
        flush
          ? "flex min-h-0 w-full flex-1 flex-col overflow-hidden"
          : "flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-6"
      }
    >
      {previewPending ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground text-sm">
          <Spinner className="size-4" />
          {t("spaces.data.loading")}
        </div>
      ) : null}
      {previewError && !previewPending ? (
        <p className="p-6 text-destructive text-sm">
          {t("spaces.data.readFailed", {
            defaultValue: "This node could not be read.",
          })}
        </p>
      ) : null}
      {previewUrl && image ? (
        // biome-ignore lint/correctness/useImageSize: the listing carries bytes, not pixels — an uploaded file has no intrinsic size we know here, and guessing one would distort the preview to avoid a reflow.
        <img
          alt={label}
          className="max-h-[70vh] max-w-full rounded-md border object-contain"
          src={previewUrl}
        />
      ) : null}
      {previewUrl && pdf ? (
        <iframe
          className="min-h-0 w-full flex-1 border-0"
          src={previewUrl}
          title={label}
        />
      ) : null}
      {error ? (
        <p className="border-destructive/30 border-b bg-destructive/5 px-6 py-2 text-destructive text-sm">
          {t("spaces.data.saveFailed", { defaultValue: "Save failed." })}{" "}
          {error}
        </p>
      ) : null}
      {url && text ? (
        <TextFilePreview
          draft={draft}
          mime={mime}
          onDraftChange={onDraftChange}
          oversized={oversized}
          query={textQuery}
        />
      ) : null}
      {url && spreadsheet ? (
        <SpreadsheetFilePreview name={label} sizeBytes={sizeBytes} url={url} />
      ) : null}
      {url && !(image || pdf || text || spreadsheet) ? (
        <p className="text-muted-foreground text-sm">
          {t("spaces.data.noPreview", {
            defaultValue:
              "No preview for this file type — download it to open it.",
          })}
        </p>
      ) : null}
    </div>
  );
}
