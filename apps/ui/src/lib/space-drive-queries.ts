import { useLocalFilesBridge } from "@engenty/connections-local-files/ui/local-files-bridge";
import {
  buildSpaceDrive,
  type DriveNode,
  type FileSpaceOwnerRef,
  fileSpaceDriveQueryKey,
  fileSpaceOwnerKey,
  spaceDataChildNodes,
  spaceFolderChildNodes,
} from "@engenty/file-storage";
import type { SpaceDataListing } from "@engenty/plugin-sdk";
import { useQuery } from "@engenty/query-client";
import { useMemo } from "react";
import {
  getSpaceDataRoots,
  listSpaceData,
  NO_SPACE_DATA_CAPABILITIES,
  readSpaceData,
  type SpaceDataCapabilities,
} from "@/lib/api/space-data-client";
import {
  getFileSpaceListing,
  getSpaceArtifacts,
  getSpaceProjects,
} from "@/lib/api/space-drive-client";
import { spaceKeys, useSpaceSurfaceQuery } from "@/lib/spaces-queries";

export const spaceDriveKeys = {
  artifacts: (spaceId: string) =>
    [...spaceKeys.all, "drive", "artifacts", spaceId] as const,
  dataChildren: (spaceId: string, path: string) =>
    [...spaceKeys.all, "drive", "data", spaceId, path] as const,
  dataDocument: (spaceId: string, path: string) =>
    [...spaceKeys.all, "drive", "document", spaceId, path] as const,
  dataRoots: (spaceId: string) =>
    [...spaceKeys.all, "drive", "data-roots", spaceId] as const,
  /**
   * One opened folder, keyed by file space AND folder.
   *
   * Not by folder id alone: two file spaces can hand out the same folder id,
   * and a cache hit across them would show a project's files inside the space's
   * own tree.
   */
  folder: (owner: FileSpaceOwnerRef, folderId: string | null) =>
    fileSpaceDriveQueryKey(owner, folderId),
  /** One file, for the things asked about a file rather than about a folder. */
  file: (owner: FileSpaceOwnerRef, fileId: string) =>
    [
      ...spaceKeys.all,
      "drive",
      "file",
      fileSpaceOwnerKey(owner),
      fileId,
    ] as const,
  projects: (spaceId: string) =>
    [...spaceKeys.all, "drive", "projects", spaceId] as const,
};

export interface SpaceDriveResult {
  /**
   * What each ROOT's module supports, keyed by its root segment (P3.1).
   *
   * Keyed by root rather than by node because a capability belongs to the
   * adapter, not to a folder: whether `Contacts` can make a folder is the same
   * answer at every depth inside it. A path's first segment names its root, so
   * this is all a caller needs to gate an action anywhere in the tree.
   */
  capabilitiesByRoot: Record<string, SpaceDataCapabilities>;
  /** True while any source is still loading; the tree renders what it has. */
  isPending: boolean;
  nodes: DriveNode[];
  /** Sources that failed, by name — a partial Drive says so rather than lying. */
  unavailable: string[];
}

/**
 * The space's Drive: three independent reads, one pure projection.
 *
 * Independent on purpose. A project store the caller cannot read, or an AI
 * service that is down, must not blank the whole tree — the Drive is a view
 * over stores that fail separately, so it degrades the same way and NAMES what
 * is missing instead of quietly showing a shorter list.
 *
 * The last read is the module data roots (PLAN-space-data.md D2). Only the
 * ROOTS load here: a module's records arrive when its folder is opened, because
 * a tree that read every mounted module's rows to draw its first screen would
 * be the store this projection promises not to be. Two lanes have folded into
 * those roots rather than staying bespoke reads: the knowledge base in Phase K,
 * and the space's own file space in P1.3.
 */
export function useSpaceDrive(
  spaceId: string | null,
  projectsFolderLabel?: string
): SpaceDriveResult {
  const enabled = Boolean(spaceId);
  const id = spaceId ?? "";

  // The space's own FILE SPACE is no longer read here: since P1.3 it is the
  // `files` module's adapter root, and it arrives with the other data roots
  // already mount-filtered by the server (decision 1, 2026-08-17 — superseding
  // the 2026-08-15 "the space's own content is not mount-gated" for this lane,
  // which held only while there was no module to mount for it). Artifacts are
  // still the space's own content and still not mount-gated (decision 2).
  //
  // Adapter roots arrive pre-filtered; the Projects folder is the one module
  // surface assembled client-side, so it takes the same gate here: no projects
  // mount, no Projects folder. An unreadable surface DEGRADES to fetching
  // (same rule as the agent-side narrowing, C3a): a core hiccup must not
  // silently shorten the tree; only a surface that answered "not mounted"
  // hides the folder.
  const surfaceQuery = useSpaceSurfaceQuery(spaceId);
  const projectsMounted = surfaceQuery.data
    ? surfaceQuery.data.modules.some((m) => m.moduleId === "projects")
    : surfaceQuery.isError;
  const projectsQuery = useQuery({
    enabled: enabled && projectsMounted,
    queryFn: ({ signal }) => getSpaceProjects(id, signal),
    queryKey: spaceDriveKeys.projects(id),
  });
  const artifactsQuery = useQuery({
    enabled,
    queryFn: ({ signal }) => getSpaceArtifacts(id, signal),
    queryKey: spaceDriveKeys.artifacts(id),
  });
  const dataRootsQuery = useQuery({
    enabled,
    queryFn: ({ signal }) => getSpaceDataRoots(id, signal),
    queryKey: spaceDriveKeys.dataRoots(id),
  });

  const projects = projectsQuery.data;
  const artifacts = artifactsQuery.data;
  const dataRoots = dataRootsQuery.data;

  const capabilitiesByRoot = useMemo(() => {
    const map: Record<string, SpaceDataCapabilities> = {};
    for (const root of dataRoots ?? []) {
      map[root.root] = root.capabilities ?? NO_SPACE_DATA_CAPABILITIES;
    }
    return map;
  }, [dataRoots]);

  const nodes = useMemo(
    () =>
      buildSpaceDrive({
        artifacts: artifacts ?? [],
        dataRoots: dataRoots ?? [],
        projects: projects ?? [],
        spaceId: id,
        ...(projectsFolderLabel ? { projectsFolderLabel } : {}),
      }),
    [artifacts, dataRoots, id, projects, projectsFolderLabel]
  );

  const unavailable = [
    projectsQuery.error ? "projects" : null,
    artifactsQuery.error ? "artifacts" : null,
    dataRootsQuery.error ? "modules" : null,
  ].filter((name): name is string => name !== null);

  return {
    capabilitiesByRoot,
    isPending:
      projectsQuery.isPending ||
      artifactsQuery.isPending ||
      dataRootsQuery.isPending,
    nodes,
    unavailable,
  };
}

/**
 * One level inside a module's data folder, fetched when it is opened.
 *
 * Keyed by path, so opening the same folder twice in a session is free and
 * opening a different one never invalidates the first.
 */
export function useSpaceDataChildren(
  spaceId: string | null,
  moduleId: string | undefined,
  path: string | undefined
) {
  const enabled = Boolean(spaceId && moduleId && path);
  const query = useQuery({
    enabled,
    queryFn: ({ signal }) => listSpaceData(spaceId ?? "", path ?? "", signal),
    queryKey: spaceDriveKeys.dataChildren(spaceId ?? "", path ?? ""),
  });
  const nodes = useMemo(
    () =>
      query.data && moduleId && path
        ? spaceDataChildNodes({
            entries: query.data.entries,
            folders: query.data.folders,
            moduleId,
            parentPath: path,
          })
        : [],
    [moduleId, path, query.data]
  );
  return {
    error: query.error,
    isPending: enabled && query.isPending,
    nodes,
    truncated: Boolean(query.data?.truncated),
  };
}

/**
 * One level inside a file space, fetched when its folder is opened.
 *
 * The `owner` travels on the node rather than being inferred from where the
 * tree is, which is what lets a project's folder — a file space of its own,
 * three levels down someone else's tree — open like any other.
 */
export function useSpaceFolderChildren(
  owner: FileSpaceOwnerRef | undefined,
  folderId: string | null
) {
  const { ready: localFilesReady } = useLocalFilesBridge(Boolean(owner));
  const enabled = Boolean(owner) && localFilesReady;
  const query = useQuery({
    enabled,
    queryFn: ({ signal }) =>
      getFileSpaceListing(owner ?? { id: "", type: "space" }, folderId, signal),
    queryKey: spaceDriveKeys.folder(
      owner ?? { id: "", type: "space" },
      folderId
    ),
  });
  const nodes = useMemo(
    () =>
      query.data && owner
        ? spaceFolderChildNodes({
            files: query.data.files,
            folders: query.data.folders,
            owner,
          })
        : [],
    [owner, query.data]
  );
  return {
    error: query.error,
    isPending: Boolean(owner) && (!localFilesReady || query.isPending),
    nodes,
    ready: localFilesReady,
  };
}

/**
 * One data folder, as its own page: what is in it, and what it IS.
 *
 * The same fetch `useSpaceDataChildren` makes and the SAME query key, so
 * opening a folder the tree already expanded costs nothing. It differs in what
 * it hands back: the tree wants rows, and the pane wants the folder's own
 * identity (`self`) as well — its type is what decides whether a module
 * renders it.
 */
export function useSpaceDataFolder(
  spaceId: string | null,
  path: string | undefined
) {
  const enabled = Boolean(spaceId && path);
  const query = useQuery({
    enabled,
    queryFn: ({ signal }) => listSpaceData(spaceId ?? "", path ?? "", signal),
    queryKey: spaceDriveKeys.dataChildren(spaceId ?? "", path ?? ""),
  });
  return {
    entries: query.data?.entries ?? EMPTY_ENTRIES,
    error: query.error,
    folders: query.data?.folders ?? EMPTY_FOLDERS,
    isPending: enabled && query.isPending,
    self: query.data?.self,
    truncated: Boolean(query.data?.truncated),
  };
}

/** Stable empties, so a pending listing does not re-render its consumers. */
const EMPTY_ENTRIES: SpaceDataListing["entries"] = [];
const EMPTY_FOLDERS: SpaceDataListing["folders"] = [];

/** One node, read in full — the detail pane's content. */
export function useSpaceDataDocument(
  spaceId: string | null,
  path: string | undefined
) {
  const enabled = Boolean(spaceId && path);
  return useQuery({
    enabled,
    queryFn: ({ signal }) => readSpaceData(spaceId ?? "", path ?? "", signal),
    queryKey: spaceDriveKeys.dataDocument(spaceId ?? "", path ?? ""),
  });
}
