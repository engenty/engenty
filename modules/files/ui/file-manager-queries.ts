import { queryOptions } from "@engenty/query-client";
import { type FileSpaceOwnerRef, listFileSpace } from "./file-manager-api.js";

export function fileSpaceKey(
  owner: FileSpaceOwnerRef,
  folderId: string | null,
  search?: string
) {
  return [
    "file-space",
    owner.type,
    owner.id,
    folderId ?? "root",
    search ?? "",
  ] as const;
}

export function fileSpaceQueryOptions(
  owner: FileSpaceOwnerRef,
  opts?: { folderId?: string | null; search?: string }
) {
  const folderId = opts?.folderId ?? null;
  return queryOptions({
    queryKey: fileSpaceKey(owner, folderId, opts?.search),
    queryFn: ({ signal }) =>
      listFileSpace(owner, { folderId, search: opts?.search }, signal),
    staleTime: 0,
  });
}

/** Invalidation prefix for an owner's whole file space. */
export function fileSpaceInvalidationKey(owner: FileSpaceOwnerRef) {
  return ["file-space", owner.type, owner.id] as const;
}
