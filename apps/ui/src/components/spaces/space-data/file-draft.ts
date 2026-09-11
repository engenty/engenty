import type { FileSpaceOwnerRef } from "@engenty/file-storage";
import {
  isFileStorageCsvMime,
  isFileStorageMarkdownMime,
} from "@engenty/file-storage";
import { useQuery, useQueryClient } from "@engenty/query-client";
import { useCallback, useState } from "react";
import {
  fetchFileSpaceBytes,
  saveFileSpaceContent,
} from "@/lib/api/space-drive-client";
import { preserveTrailingNewline } from "@/lib/file-text";
import { spaceDriveKeys } from "@/lib/space-drive-queries";

/** How much of a text file the pane will pull down before offering Download. */
const TEXT_PREVIEW_MAX_BYTES = 512 * 1024;

/**
 * A text file's bytes, as text.
 *
 * Lives here rather than inside the preview because the TOPBAR has to know
 * whether there is anything to edit before it can offer Save, and the topbar
 * belongs to `FileDetail`. Same reason the member draft moved up in D7g:
 * `usePageConfig` is last-writer-wins and the parent writes last, so a child
 * cannot publish actions of its own.
 */
export function useFileText(url: string | undefined, sizeBytes: number | null) {
  const oversized =
    typeof sizeBytes === "number" && sizeBytes > TEXT_PREVIEW_MAX_BYTES;
  const query = useQuery({
    // Signed storage URLs need no session. Same-origin `/download` proxies do.
    enabled: Boolean(url) && !oversized,
    queryFn: async ({ signal }) => {
      const blob = await fetchFileSpaceBytes(url as string, signal);
      return blob.text();
    },
    queryKey: ["space-drive", "file-text", url],
    staleTime: 60_000,
  });
  return { oversized, query };
}

/** Text a browser can edit in place and this pane knows how to save. */
export function isEditableFileText(mime: string): boolean {
  return isFileStorageCsvMime(mime) || isFileStorageMarkdownMime(mime);
}

/**
 * The edit/save cycle for one file.
 *
 * `expectedUpdatedAt` is the row's `updatedAt` as the editor read it, so a save
 * whose base has moved comes back 409 and is SHOWN rather than merged by
 * accident — the same contract the data write path has, now that files have a
 * version token that moves.
 *
 * The folder listing is invalidated after a save because `updatedAt` comes from
 * it: without that, the token on screen stays stale and the SECOND save of a
 * session would conflict with the reader's own first one.
 */
export function useFileDraft(options: {
  expectedUpdatedAt: string | undefined;
  fileId: string;
  folderId: string | null;
  owner: FileSpaceOwnerRef;
  text: string | undefined;
}) {
  const { expectedUpdatedAt, fileId, folderId, owner, text } = options;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editing = draft !== null;
  const dirty = editing && draft !== text;

  const start = useCallback(() => {
    setDraft(text ?? "");
    setError(null);
  }, [text]);

  const cancel = useCallback(() => {
    setDraft(null);
    setError(null);
  }, []);

  const save = useCallback(async () => {
    if (draft === null || !expectedUpdatedAt) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveFileSpaceContent({
        // The rich editor re-serializes the whole document and emits no final
        // newline, so without this every save of a POSIX-normal file is a
        // one-byte diff nobody asked for.
        content: preserveTrailingNewline(text ?? "", draft),
        expectedUpdatedAt,
        fileId,
        owner,
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: spaceDriveKeys.folder(owner, folderId),
        }),
        queryClient.invalidateQueries({
          queryKey: ["space-drive", "file-text"],
        }),
      ]);
      setDraft(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }, [draft, expectedUpdatedAt, fileId, folderId, owner, queryClient, text]);

  return {
    cancel,
    dirty,
    draft,
    editing,
    error,
    save,
    saving,
    setDraft,
    start,
  };
}
