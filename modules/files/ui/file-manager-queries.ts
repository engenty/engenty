import { fileSpaceListingQueryKey } from "@engenty/file-storage";
import { queryOptions } from "@engenty/query-client";
import { type FileSpaceOwnerRef, listFileSpace } from "./file-manager-api.js";

export function fileSpaceKey(
  owner: FileSpaceOwnerRef,
  folderId: string | null,
  search?: string
) {
  return fileSpaceListingQueryKey(owner, folderId, search);
}

export function fileSpaceQueryOptions(
  owner: FileSpaceOwnerRef,
  opts?: { folderId?: string | null; search?: string }
) {
  const folderId = opts?.folderId ?? null;
  return queryOptions({
    queryFn: ({ signal }) =>
      listFileSpace(owner, { folderId, search: opts?.search }, signal),
    queryKey: fileSpaceKey(owner, folderId, opts?.search),
    staleTime: 0,
  });
}
