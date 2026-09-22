import { requestApiJson } from "@engenty/api-client";
import { guessFileStorageMimeFromFilename } from "@engenty/file-storage";
import {
  FILES_UPLOAD_MAX_BYTES,
  requestSignedUploadUrl,
  uploadViaSignedUrl,
} from "./api.js";

/* ── Types (mirror the server node schemas) ── */

export interface FileSpaceOwnerRef {
  id: string;
  type: string;
}

export interface FileSpaceFolder {
  /** Set on connector mount roots (a connected external folder). */
  connectionId?: string;
  createdAt: string;
  id: string;
  name: string;
  parentId: string | null;
  /** Virtual node inside a mount: browse/download only. */
  readOnly?: boolean;
  source: string;
  updatedAt: string;
}

export interface FileSpaceFile {
  createdAt: string;
  folderId: string | null;
  id: string;
  mimeType: string;
  name: string;
  /** Virtual node inside a mount: browse/download only. */
  readOnly?: boolean;
  sizeBytes: number;
  source: string;
  storageKey?: string;
  updatedAt: string;
}

export interface FileSpaceListing {
  cursor?: string;
  files: FileSpaceFile[];
  folders: FileSpaceFolder[];
  /** True when the listed level lives inside a read-only mount. */
  readOnly?: boolean;
}

/** A connection that can be mounted as a file source. */
export interface FileSourceSummary {
  allSpaces?: boolean;
  connectionId: string;
  connectorIcon: string | null;
  connectorId: string;
  connectorName: string;
  label: string;
  sharing: string;
}

export interface SourceBrowseEntry {
  kind: "file" | "folder";
  mimeType: string | null;
  modifiedAt: string | null;
  name: string;
  ref: string;
  size: number | null;
}

interface UploadTicket {
  bucket: string;
  entryId: string;
  storageKey: string;
}

function spaceBase(owner: FileSpaceOwnerRef): string {
  return `/api/files/spaces/${encodeURIComponent(owner.type)}/${encodeURIComponent(
    owner.id
  )}`;
}

/* ── Folder + file queries ── */

export async function listFileSpace(
  owner: FileSpaceOwnerRef,
  opts?: { folderId?: string | null; search?: string },
  signal?: AbortSignal
): Promise<FileSpaceListing> {
  const params = new URLSearchParams();
  if (opts?.folderId) {
    params.set("folderId", opts.folderId);
  }
  if (opts?.search) {
    params.set("search", opts.search);
  }
  const qs = params.toString();
  const url = `${spaceBase(owner)}/list${qs ? `?${qs}` : ""}`;
  return requestApiJson<FileSpaceListing>(url, { method: "GET", signal });
}

export async function createFolder(
  owner: FileSpaceOwnerRef,
  input: { name: string; parentId: string | null }
): Promise<FileSpaceFolder> {
  return requestApiJson<FileSpaceFolder>(`${spaceBase(owner)}/folders`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateFolder(
  owner: FileSpaceOwnerRef,
  id: string,
  patch: { name?: string; parentId?: string | null }
): Promise<FileSpaceFolder> {
  return requestApiJson<FileSpaceFolder>(`${spaceBase(owner)}/folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteFolder(
  owner: FileSpaceOwnerRef,
  id: string
): Promise<void> {
  await requestApiJson(`${spaceBase(owner)}/folders/${id}`, {
    method: "DELETE",
  });
}

export async function updateFile(
  owner: FileSpaceOwnerRef,
  id: string,
  patch: { name?: string; folderId?: string | null }
): Promise<FileSpaceFile> {
  return requestApiJson<FileSpaceFile>(`${spaceBase(owner)}/files/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteSpaceFile(
  owner: FileSpaceOwnerRef,
  id: string
): Promise<void> {
  await requestApiJson(`${spaceBase(owner)}/files/${id}`, { method: "DELETE" });
}

export async function getSpaceFileUrl(
  owner: FileSpaceOwnerRef,
  id: string
): Promise<string> {
  const res = await requestApiJson<{ url: string }>(
    `${spaceBase(owner)}/files/${id}/url`,
    { method: "GET" }
  );
  return res.url;
}

/* ── Connected sources (mounts) ── */

export async function listFileSources(
  signal?: AbortSignal
): Promise<{ sources: FileSourceSummary[] }> {
  return requestApiJson("/api/files/sources", { method: "GET", signal });
}

export async function browseFileSource(
  connectionId: string,
  opts?: { cursor?: string | null; folderRef?: string | null },
  signal?: AbortSignal
): Promise<{ cursor: string | null; entries: SourceBrowseEntry[] }> {
  const params = new URLSearchParams();
  if (opts?.folderRef) {
    params.set("folderRef", opts.folderRef);
  }
  if (opts?.cursor) {
    params.set("cursor", opts.cursor);
  }
  const qs = params.toString();
  return requestApiJson(
    `/api/files/sources/${encodeURIComponent(connectionId)}/browse${qs ? `?${qs}` : ""}`,
    { method: "GET", signal }
  );
}

export async function createMount(
  owner: FileSpaceOwnerRef,
  input: {
    connectionId: string;
    folderRef: string | null;
    name: string;
    parentId: string | null;
  }
): Promise<FileSpaceFolder> {
  return requestApiJson<FileSpaceFolder>(`${spaceBase(owner)}/mounts`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/* ── Upload (begin → signed PUT → finalize) ── */

function resolveContentType(file: File): string {
  const raw = file.type?.trim() ?? "";
  if (
    !raw ||
    raw === "application/octet-stream" ||
    raw === "application/x-download"
  ) {
    return guessFileStorageMimeFromFilename(file.name);
  }
  return raw;
}

/** Upload a file into a folder: register, signed-PUT the bytes, finalize. */
export async function uploadFileToSpace(
  owner: FileSpaceOwnerRef,
  file: File,
  folderId: string | null
): Promise<FileSpaceFile> {
  if (file.size > FILES_UPLOAD_MAX_BYTES) {
    throw new Error("upload_too_large");
  }
  const contentType = resolveContentType(file);

  const ticket = await requestApiJson<UploadTicket>(
    `${spaceBase(owner)}/uploads`,
    {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        folderId,
        mimeType: contentType,
        sizeBytes: file.size,
      }),
    }
  );

  const signed = await requestSignedUploadUrl({
    bucket: ticket.bucket,
    contentType,
    key: ticket.storageKey,
  });
  await uploadViaSignedUrl(signed, file, contentType);

  return requestApiJson<FileSpaceFile>(
    `${spaceBase(owner)}/uploads/${ticket.entryId}/finalize`,
    { method: "POST" }
  );
}
