/**
 * A file in the tree, previewed.
 *
 * Through a signed URL when storage can mint one, or an authenticated blob
 * URL when the file is a connector/local-files proxy — and only for the types
 * a browser renders natively. Everything else offers the download rather than
 * pretending to show it. This pane deliberately stays thin: the files module
 * owns file rendering, and the right seam for a richer preview is a surface it
 * contributes into (the same mechanism `spaces.detail` already uses), not a
 * second previewer growing here.
 *
 * The file's own row comes from the listing that addressed it — the folder the
 * tree just opened, so the cache is already warm — because there is no
 * fetch-one-file endpoint to ask instead.
 */
import { useRegisterAgentUiSlice } from "@engenty/app-shell";
import type { FileSpaceOwnerRef } from "@engenty/file-storage";
import {
  isFileStoragePdfMime,
  isFileStorageSpreadsheetMime,
  isFileStorageTextPreviewMime,
  resolveFileStoragePreviewMime,
} from "@engenty/file-storage";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Button } from "@engenty/ui-core";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { useCallback, useMemo } from "react";
import {
  downloadFileSpaceUrl,
  getFileSpaceDownloadUrl,
} from "@/lib/api/space-drive-client";
import {
  buildSpaceDataFileSlice,
  buildSpaceDataFileTextSlice,
} from "@/lib/space-data-agent-context";
import {
  spaceDriveKeys,
  useSpaceFolderChildren,
} from "@/lib/space-drive-queries";
import { isEditableFileText, useFileDraft, useFileText } from "./file-draft";
import { FilePreviewBody } from "./file-preview";
import { decodeConnectorNodeId } from "./file-space-node-facts";
import { PaneChrome } from "./pane-chrome";
import {
  SPACE_DATA_FILE_SLICE_ID,
  SPACE_DATA_FILE_TEXT_SLICE_ID,
} from "./surfaces";

/** Bytes as a person reads them; the tree shows sizes, not byte counts. */
function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  return `${(bytes / 1024 ** index).toFixed(index > 0 ? 1 : 0)} ${units[index]}`;
}

export function FileDetail({
  fileId,
  folderId,
  onClose,
  owner,
}: {
  fileId: string;
  folderId: string | null;
  onClose: () => void;
  owner: FileSpaceOwnerRef;
}) {
  const { t } = useTranslation("common");
  const listing = useSpaceFolderChildren(owner, folderId);
  const node = listing.nodes.find((entry) => entry.sourceId === fileId);
  const urlQuery = useQuery({
    enabled: listing.ready,
    queryFn: ({ signal }) => getFileSpaceDownloadUrl(owner, fileId, signal),
    queryKey: [...spaceDriveKeys.file(owner, fileId), "url"],
    // A signed URL expires; a minute of staleness is cheaper than a broken
    // image after lunch.
    staleTime: 60_000,
  });
  const originalName =
    decodeConnectorNodeId(fileId)?.ref.split("/").pop() ?? undefined;
  const label = node?.name ?? originalName ?? fileId;
  const mime = resolveFileStoragePreviewMime(
    node?.mimeType ?? "",
    node?.name ?? originalName ?? label
  );
  const sizeBytes = node?.sizeBytes ?? null;
  const url = urlQuery.data;

  // The pathname the shell publishes has no query string, so without this the
  // copilot could see that the Data page was open and nothing about WHICH file.
  useRegisterAgentUiSlice(
    SPACE_DATA_FILE_SLICE_ID,
    useMemo(
      () =>
        node
          ? buildSpaceDataFileSlice({
              fileId,
              mimeType: mime,
              name: label,
              sizeBytes,
            })
          : null,
      [fileId, label, mime, node, sizeBytes]
    )
  );
  // Text, workbooks and PDFs fill the pane. An image is an object ON the page
  // and keeps its margin.
  const spreadsheet = isFileStorageSpreadsheetMime(mime, label);
  const pdf = isFileStoragePdfMime(mime, label);
  const text = !(spreadsheet || pdf) && isFileStorageTextPreviewMime(mime);
  const onDownload = useCallback(() => {
    if (!url) {
      return;
    }
    void downloadFileSpaceUrl(url, label);
  }, [label, url]);

  const { oversized, query: textQuery } = useFileText(
    text ? url : undefined,
    sizeBytes
  );
  const fileDraft = useFileDraft({
    expectedUpdatedAt: node?.updatedAt,
    fileId,
    folderId,
    owner,
    text: textQuery.data,
  });
  // A file the pane can read AND write: text it has an editor for, a version
  // token to write against, and a node that is not a read-only mount.
  const editable =
    text &&
    isEditableFileText(mime) &&
    Boolean(node?.updatedAt) &&
    textQuery.data !== undefined;

  // The text the reader is looking at, bounded, so the copilot can answer a
  // question about this file without a round trip through storage.
  useRegisterAgentUiSlice(
    SPACE_DATA_FILE_TEXT_SLICE_ID,
    useMemo(
      () =>
        textQuery.data === undefined
          ? null
          : buildSpaceDataFileTextSlice({
              mimeType: mime,
              name: label,
              text: fileDraft.draft ?? textQuery.data,
            }),
      [fileDraft.draft, label, mime, textQuery.data]
    )
  );

  const breadcrumbs = useMemo<PageBreadcrumb[]>(() => [{ label }], [label]);
  const actions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        {/* Kind, type and size: the subtitle that used to sit under the name. */}
        <span className="hidden text-muted-foreground text-xs md:inline">
          {[
            t("spaces.data.kind.file", { defaultValue: "File" }),
            mime,
            typeof sizeBytes === "number" ? formatBytes(sizeBytes) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {fileDraft.editing ? (
          <>
            <Button
              disabled={fileDraft.saving}
              onClick={fileDraft.cancel}
              size="sm"
              variant="ghost"
            >
              {t("actions.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              disabled={!fileDraft.dirty || fileDraft.saving}
              onClick={() => void fileDraft.save()}
              size="sm"
            >
              {fileDraft.saving
                ? t("actions.saving", { defaultValue: "Saving…" })
                : t("actions.save", { defaultValue: "Save" })}
            </Button>
          </>
        ) : null}
        {editable && !fileDraft.editing ? (
          <Button onClick={fileDraft.start} size="sm" variant="outline">
            {t("actions.edit", { defaultValue: "Edit" })}
          </Button>
        ) : null}
        {url && !fileDraft.editing ? (
          <Button onClick={onDownload} size="sm" variant="outline">
            {t("spaces.data.download", { defaultValue: "Download" })}
          </Button>
        ) : null}
      </div>
    ),
    [
      editable,
      fileDraft.cancel,
      fileDraft.dirty,
      fileDraft.editing,
      fileDraft.save,
      fileDraft.saving,
      fileDraft.start,
      mime,
      onDownload,
      sizeBytes,
      t,
      url,
    ]
  );

  return (
    <PaneChrome actions={actions} breadcrumbs={breadcrumbs} onClose={onClose}>
      <FilePreviewBody
        draft={fileDraft.draft}
        error={fileDraft.error}
        label={label}
        mime={mime}
        onDraftChange={fileDraft.setDraft}
        oversized={oversized}
        sizeBytes={sizeBytes}
        spreadsheet={spreadsheet}
        text={text}
        textQuery={textQuery}
        url={url}
        urlError={Boolean(urlQuery.error)}
        urlPending={urlQuery.isPending}
      />
    </PaneChrome>
  );
}
