/**
 * The Work sidebar's Files section: a file space's most recent files and the
 * ones this person pinned. Served by the files module under the same prefix
 * the Data tree reads, so a row here and a row there are the same file.
 */
import type { FileSpaceOwnerRef, SpaceDriveFile } from "@engenty/file-storage";
import { fileSpaceOwnerPath } from "@engenty/file-storage";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { spaceKeys } from "../spaces-queries";
import { request } from "./client";

interface FileListResponse {
  files?: Array<{
    createdAt?: string;
    folderId: string | null;
    id: string;
    mimeType?: string;
    name: string;
    sizeBytes?: number;
    updatedAt?: string;
  }>;
}

/** What the sidebar shows besides the pins. */
export const SPACE_FILES_RECENT_LIMIT = 5;

function toDriveFiles(response: FileListResponse): SpaceDriveFile[] {
  return (response.files ?? []).map((file) => ({
    folderId: file.folderId ?? null,
    id: file.id,
    name: file.name,
    ...(file.createdAt ? { createdAt: file.createdAt } : {}),
    ...(file.mimeType ? { mimeType: file.mimeType } : {}),
    ...(typeof file.sizeBytes === "number"
      ? { sizeBytes: file.sizeBytes }
      : {}),
    ...(file.updatedAt ? { updatedAt: file.updatedAt } : {}),
  }));
}

function ownerBase(owner: FileSpaceOwnerRef): string {
  return `/api/files/spaces/${fileSpaceOwnerPath(owner)}`;
}

export async function getFileSpaceRecent(
  owner: FileSpaceOwnerRef,
  limit = SPACE_FILES_RECENT_LIMIT,
  signal?: AbortSignal
): Promise<SpaceDriveFile[]> {
  const response = await request<FileListResponse>(
    `${ownerBase(owner)}/recent?limit=${limit}`,
    { signal }
  );
  return toDriveFiles(response);
}

export async function getFileSpacePins(
  owner: FileSpaceOwnerRef,
  signal?: AbortSignal
): Promise<SpaceDriveFile[]> {
  const response = await request<FileListResponse>(`${ownerBase(owner)}/pins`, {
    signal,
  });
  return toDriveFiles(response);
}

export async function setFileSpacePin(
  owner: FileSpaceOwnerRef,
  fileId: string,
  pinned: boolean
): Promise<void> {
  await request(`${ownerBase(owner)}/pins/${encodeURIComponent(fileId)}`, {
    method: pinned ? "PUT" : "DELETE",
  });
}

export const spaceFilesShortcutKeys = {
  pins: (owner: FileSpaceOwnerRef) =>
    [...spaceKeys.all, "files", "pins", owner.type, owner.id] as const,
  recent: (owner: FileSpaceOwnerRef) =>
    [...spaceKeys.all, "files", "recent", owner.type, owner.id] as const,
};

/**
 * Pinned + recent for one file space, and the toggle that moves a file
 * between the two lists. `recent` already excludes what is pinned, so a
 * caller can render both lists back to back without a duplicate row.
 */
export function useSpaceFilesShortcuts(owner: FileSpaceOwnerRef | null) {
  const queryClient = useQueryClient();
  const enabled = Boolean(owner);
  const safeOwner: FileSpaceOwnerRef = owner ?? { id: "", type: "space" };

  const pinsQuery = useQuery({
    enabled,
    queryFn: ({ signal }) => getFileSpacePins(safeOwner, signal),
    queryKey: spaceFilesShortcutKeys.pins(safeOwner),
  });
  const recentQuery = useQuery({
    enabled,
    queryFn: ({ signal }) =>
      getFileSpaceRecent(safeOwner, SPACE_FILES_RECENT_LIMIT, signal),
    queryKey: spaceFilesShortcutKeys.recent(safeOwner),
  });

  const toggle = useMutation({
    mutationFn: (input: { fileId: string; pinned: boolean }) =>
      setFileSpacePin(safeOwner, input.fileId, input.pinned),
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: spaceFilesShortcutKeys.pins(safeOwner),
      });
    },
  });

  const pinned = pinsQuery.data ?? [];
  const pinnedIds = new Set(pinned.map((file) => file.id));
  const recent = (recentQuery.data ?? []).filter(
    (file) => !pinnedIds.has(file.id)
  );

  return {
    isError: pinsQuery.isError && recentQuery.isError,
    isPending: enabled && (pinsQuery.isPending || recentQuery.isPending),
    pinned,
    recent,
    setPinned: (fileId: string, next: boolean) =>
      toggle.mutate({ fileId, pinned: next }),
    toggling: toggle.isPending,
  };
}
