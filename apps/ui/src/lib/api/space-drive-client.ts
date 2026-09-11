/**
 * The space Drive's inputs (PLAN-spaces.md Phase 4).
 *
 * Four fetches against four stores that already exist, then one pure
 * `buildSpaceDrive` over the results. Nothing here writes, and there is no
 * "drive" table to read — §1c: if a space grows its own storage table, this
 * plan has failed its own test.
 *
 * They are separate requests on purpose. A core endpoint that assembled the
 * tree server-side would have to reach into three module schemas plus the AI
 * service, which is exactly the coupling the module boundary exists to prevent;
 * the tree-shaping rules that must not drift live in `@engenty/file-storage`,
 * where both this and the project Files tab read them.
 */
import type {
  FileSpaceOwnerRef,
  SpaceDriveArtifact,
  SpaceDriveFile,
  SpaceDriveFolder,
  SpaceDriveProject,
} from "@engenty/file-storage";
import { fileSpaceOwnerPath } from "@engenty/file-storage";
import { request, requestAiJson, requestBlob } from "./client";

interface FileSpaceListing {
  files: Array<{
    createdAt?: string;
    folderId: string | null;
    id: string;
    mimeType?: string;
    name: string;
    readOnly?: boolean;
    sizeBytes?: number;
    updatedAt?: string;
  }>;
  folders: Array<{
    connectionId?: string;
    createdAt?: string;
    id: string;
    name: string;
    parentId: string | null;
    readOnly?: boolean;
    source?: string;
    updatedAt?: string;
  }>;
}

/**
 * One level of a file space — the same endpoint, and the same rows, the Files
 * tab browses.
 *
 * `folderId` null is the root. The tree calls this again per opened folder
 * rather than walking the space up front: a file space can be a connector mount
 * over somebody's whole Google Drive, and eagerly reading that to draw a
 * sidebar would be a download, not a view.
 */
export async function getFileSpaceListing(
  owner: FileSpaceOwnerRef,
  folderId: string | null,
  signal?: AbortSignal
): Promise<{ files: SpaceDriveFile[]; folders: SpaceDriveFolder[] }> {
  const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
  const listing = await request<FileSpaceListing>(
    `/api/files/spaces/${fileSpaceOwnerPath(owner)}/list${query}`,
    { signal }
  );
  return {
    files: (listing.files ?? []).map((file) => ({
      folderId: file.folderId ?? null,
      id: file.id,
      name: file.name,
      ...(file.createdAt ? { createdAt: file.createdAt } : {}),
      ...(file.mimeType ? { mimeType: file.mimeType } : {}),
      ...(file.readOnly ? { readOnly: true } : {}),
      ...(typeof file.sizeBytes === "number"
        ? { sizeBytes: file.sizeBytes }
        : {}),
      ...(file.updatedAt ? { updatedAt: file.updatedAt } : {}),
    })),
    folders: (listing.folders ?? []).map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId ?? null,
      ...(folder.connectionId ? { connectionId: folder.connectionId } : {}),
      ...(folder.createdAt ? { createdAt: folder.createdAt } : {}),
      ...(folder.readOnly ? { readOnly: true } : {}),
      ...(folder.source ? { source: folder.source } : {}),
      ...(folder.updatedAt ? { updatedAt: folder.updatedAt } : {}),
    })),
  };
}

/** A signed URL for one file in a file space, for preview and download. */
export async function getFileSpaceDownloadUrl(
  owner: FileSpaceOwnerRef,
  fileId: string,
  signal?: AbortSignal
): Promise<string> {
  const result = await request<{ url: string }>(
    `/api/files/spaces/${fileSpaceOwnerPath(owner)}/files/${encodeURIComponent(fileId)}/url`,
    { signal }
  );
  return result.url;
}

/**
 * Connector / local-files downloads are same-origin `/api/.../download`
 * proxies. Native storage returns a signed `https://` URL that needs no app
 * auth. An iframe or `<a href>` only works for the second kind.
 */
export function isFileSpaceProxyUrl(url: string): boolean {
  if (url.startsWith("/")) {
    return true;
  }
  try {
    return new URL(url).pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function fileSpaceProxyPath(url: string): string {
  if (url.startsWith("/")) {
    return url;
  }
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

/** File bytes, with a Bearer token when the URL is an app download proxy. */
export async function fetchFileSpaceBytes(
  url: string,
  signal?: AbortSignal
): Promise<Blob> {
  if (!isFileSpaceProxyUrl(url)) {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Preview failed: ${response.status}`);
    }
    return response.blob();
  }
  return requestBlob(fileSpaceProxyPath(url), { signal });
}

/** Trigger a download that still works for authenticated proxy URLs. */
export async function downloadFileSpaceUrl(
  url: string,
  filename: string
): Promise<void> {
  if (!isFileSpaceProxyUrl(url)) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  const blob = await fetchFileSpaceBytes(url);
  const href = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.download = filename;
    anchor.href = href;
    anchor.rel = "noreferrer";
    anchor.click();
  } finally {
    URL.revokeObjectURL(href);
  }
}

/**
 * Save new bytes over a file in a file space.
 *
 * `expectedUpdatedAt` is the `updatedAt` the editor read, and the server
 * answers 409 when the row has moved on — the same rule the space-data write
 * path enforces with `base_version`, for the same reason: two people editing
 * one file is ordinary, and the loser of a race should be told rather than
 * silently overwritten.
 *
 * Text goes as text; `encoding: "base64"` is what a binary save would use.
 */
export async function saveFileSpaceContent(input: {
  content: string;
  expectedUpdatedAt: string;
  fileId: string;
  owner: FileSpaceOwnerRef;
}): Promise<{ sizeBytes: number; updatedAt: string }> {
  return await request<{ sizeBytes: number; updatedAt: string }>(
    `/api/files/spaces/${fileSpaceOwnerPath(input.owner)}/files/${encodeURIComponent(input.fileId)}/content`,
    {
      body: {
        content: input.content,
        encoding: "utf-8",
        expectedUpdatedAt: input.expectedUpdatedAt,
      },
      method: "PUT",
    }
  );
}

/**
 * Rows out of a list response, whatever the module wrapped them in.
 *
 * The `{ok,data}` envelope is already unwrapped by `request`, and what is left
 * underneath is NOT one shape: `/api/projects` hands back a bare array while
 * `/api/kb/articles` hands back `{data,total,page,page_size}`. Assuming one of
 * them is how the Phase 1 container walk silently resolved to empty for weeks
 * — the code was right about the documented shape and wrong about the shipped
 * one. Accept both, and let a genuinely unexpected shape be an empty list
 * rather than a crash in a tree that renders three other stores fine.
 */
export function readSpaceDriveRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }
  const data = (result as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? (data as T[]) : [];
}

interface ProjectRow {
  id: string;
  title: string;
  updated_at?: string;
}

export async function getSpaceProjects(
  spaceId: string,
  signal?: AbortSignal
): Promise<SpaceDriveProject[]> {
  const result = await request<unknown>(
    `/api/projects?space_id=${encodeURIComponent(spaceId)}&page_size=200`,
    { signal }
  );
  return readSpaceDriveRows<ProjectRow>(result).map((project) => ({
    href: `/mdl/projects/${project.id}`,
    id: project.id,
    title: project.title,
    ...(project.updated_at ? { updatedAt: project.updated_at } : {}),
  }));
}

export async function getSpaceArtifacts(
  spaceId: string,
  signal?: AbortSignal
): Promise<SpaceDriveArtifact[]> {
  const result = await requestAiJson<{
    artifacts?: Array<{
      id: string;
      parent_id?: string | null;
      title?: string;
      type?: string;
      updated_at?: string;
    }>;
  }>(`/ai/artifacts?scope_type=space&scope_id=${encodeURIComponent(spaceId)}`, {
    signal,
  });
  return (result.artifacts ?? []).map((artifact) => ({
    id: artifact.id,
    title: artifact.title || artifact.id,
    type: artifact.type ?? "markdown",
    ...(artifact.parent_id ? { parentId: artifact.parent_id } : {}),
    ...(artifact.updated_at ? { updatedAt: artifact.updated_at } : {}),
  }));
}
