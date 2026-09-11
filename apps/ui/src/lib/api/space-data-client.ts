/**
 * The space Data tree's endpoints (PLAN-space-data.md D1–D3).
 *
 * Four thin calls over `/api/spaces/:spaceId/data/*`. Nothing is assembled
 * here: the server owns which roots a space shows (mount = grant) and which
 * members may be written, because a client that decided either would be a
 * second authority that can disagree with the first.
 */
import type { FileSpaceOwnerRef } from "@engenty/file-storage";
import { fileSpaceOwnerPath } from "@engenty/file-storage";
import type {
  SpaceDataDocument,
  SpaceDataImportResult,
  SpaceDataListing,
  SpaceDataNodeType,
  SpaceDataRecordScope,
  SpaceDataRef,
} from "@engenty/plugin-sdk";
import { parseSpaceDataRef } from "@engenty/plugin-sdk";
import { request } from "./client";

/**
 * What a root's module supports, so the UI gates BEFORE the click (P3.1).
 *
 * Not a permission check — whether THIS caller may do it is the operation's own
 * policy when they try. This is the prior question: does the gesture exist in
 * this module at all. An action offered where it does not exist teaches people
 * that the app is flaky.
 */
export interface SpaceDataCapabilities {
  canCreate: boolean;
  canDelete: boolean;
  /** Covers rename: in this protocol a rename is a move that kept its parent. */
  canMove: boolean;
  canWrite: boolean;
}

/** Absent capabilities read as "nothing is possible" — the safe default. */
export const NO_SPACE_DATA_CAPABILITIES: SpaceDataCapabilities = {
  canCreate: false,
  canDelete: false,
  canMove: false,
  canWrite: false,
};

export interface SpaceDataRoot {
  capabilities?: SpaceDataCapabilities;
  label: string;
  moduleId: string;
  nodeTypes: SpaceDataNodeType[];
  recordScope: SpaceDataRecordScope;
  root: string;
  /** The adapter's own type for its root folder, where it declared one. */
  rootNodeType?: string;
  /** The MODULE has a write mapping; whether this caller may use it is decided when they try. */
  writable: boolean;
}

/** A listing, plus what may be DONE at this level. */
export interface SpaceDataListingWithCapabilities extends SpaceDataListing {
  capabilities?: SpaceDataCapabilities;
}

export function getSpaceDataRoots(
  spaceId: string,
  signal?: AbortSignal
): Promise<SpaceDataRoot[]> {
  return request<SpaceDataRoot[]>(
    `/api/spaces/${encodeURIComponent(spaceId)}/data/roots`,
    { signal }
  );
}

export function listSpaceData(
  spaceId: string,
  path: string,
  signal?: AbortSignal
): Promise<SpaceDataListingWithCapabilities> {
  return request<SpaceDataListingWithCapabilities>(
    `/api/spaces/${encodeURIComponent(spaceId)}/data/list?path=${encodeURIComponent(path)}`,
    { signal }
  );
}

export function readSpaceData(
  spaceId: string,
  path: string,
  signal?: AbortSignal
): Promise<SpaceDataDocument> {
  return request<SpaceDataDocument>(
    `/api/spaces/${encodeURIComponent(spaceId)}/data/read?path=${encodeURIComponent(path)}`,
    { signal }
  );
}

/**
 * Save one node — or one member of a bundle.
 *
 * `baseVersion` is not optional and not a nicety: the server refuses a write
 * whose base version is stale with 409, which is the whole reason humans and
 * agents can edit the same records without one silently overwriting the other.
 */
export function writeSpaceData(input: {
  baseVersion: string;
  content: string;
  member?: string;
  path: string;
  spaceId: string;
}): Promise<SpaceDataDocument> {
  return request<SpaceDataDocument>(
    `/api/spaces/${encodeURIComponent(input.spaceId)}/data/write`,
    {
      body: {
        base_version: input.baseVersion,
        content: input.content,
        path: input.path,
        ...(input.member ? { member: input.member } : {}),
      },
      method: "PUT",
    }
  );
}

/**
 * Follow a `<name>.ref.json` shortcut to the record it points at (D5).
 *
 * Two hops on purpose: the file space hands out a signed URL, and the bytes
 * come from storage rather than through core. A reference whose bytes are not
 * a valid ref resolves to null and the caller shows the file as-is — a
 * hand-broken shortcut should look odd, not break the folder it sits in.
 */
export async function resolveSpaceDataReference(input: {
  fileId: string;
  owner: FileSpaceOwnerRef;
  signal?: AbortSignal;
}): Promise<SpaceDataRef | null> {
  const { url } = await request<{ url: string }>(
    `/api/files/spaces/${fileSpaceOwnerPath(input.owner)}/files/${encodeURIComponent(
      input.fileId
    )}/url`,
    input.signal ? { signal: input.signal } : {}
  );
  const response = await fetch(
    url,
    input.signal ? { signal: input.signal } : {}
  );
  if (!response.ok) {
    return null;
  }
  return parseSpaceDataRef(await response.text());
}

/**
 * Make a folder or a node (P1.2).
 *
 * `parentPath` is a FULL tree path, root segment included, because the tree
 * speaks one path language: the client sends back exactly what a listing handed
 * it. A root-relative variant here would make `Files` and `""` name the same
 * folder and neither look like what the component is holding.
 */
export function createSpaceDataNode(input: {
  content?: string;
  kind: "folder" | "node";
  name: string;
  nodeType?: string;
  parentPath: string;
  spaceId: string;
}): Promise<SpaceDataDocument> {
  return request<SpaceDataDocument>(
    `/api/spaces/${encodeURIComponent(input.spaceId)}/data/create`,
    {
      body: {
        kind: input.kind,
        name: input.name,
        parent_path: input.parentPath,
        ...(input.content === undefined ? {} : { content: input.content }),
        ...(input.nodeType ? { node_type: input.nodeType } : {}),
      },
      method: "POST",
    }
  );
}

/** Move and/or rename. Omitting both is refused by the server, not silently a no-op. */
export function moveSpaceDataNode(input: {
  baseVersion?: string;
  newName?: string;
  path: string;
  spaceId: string;
  toParentPath?: string;
}): Promise<SpaceDataDocument> {
  return request<SpaceDataDocument>(
    `/api/spaces/${encodeURIComponent(input.spaceId)}/data/move`,
    {
      body: {
        path: input.path,
        ...(input.baseVersion ? { base_version: input.baseVersion } : {}),
        ...(input.newName ? { new_name: input.newName } : {}),
        ...(input.toParentPath === undefined
          ? {}
          : { to_parent_path: input.toParentPath }),
      },
      method: "POST",
    }
  );
}

/**
 * Remove a node. `recursive` is the caller's explicit intent.
 *
 * Never defaulted true anywhere in this stack: a cascade takes children and,
 * for a file space, their stored bytes, and it happens because someone asked.
 */
export function deleteSpaceDataNode(input: {
  path: string;
  recursive?: boolean;
  spaceId: string;
}): Promise<{ deleted: true }> {
  return request<{ deleted: true }>(
    `/api/spaces/${encodeURIComponent(input.spaceId)}/data/delete`,
    {
      body: {
        path: input.path,
        ...(input.recursive === undefined
          ? {}
          : { recursive: input.recursive }),
      },
      method: "DELETE",
    }
  );
}

/** Bulk import of a collection view — counts, never a silent file save (D5). */
export function importSpaceData(input: {
  content: string;
  path: string;
  spaceId: string;
}): Promise<SpaceDataImportResult> {
  return request<SpaceDataImportResult>(
    `/api/spaces/${encodeURIComponent(input.spaceId)}/data/import`,
    {
      body: { content: input.content, path: input.path },
      method: "POST",
    }
  );
}
