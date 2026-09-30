/**
 * The Data tab's search: the server searches the adapter roots, the rows the
 * tree already holds (Dokumente, Apps, Projects) are matched here.
 */
import { type DriveNode, spaceDataChildNodes } from "@engenty/file-storage";
import { spaceDataNameMatches } from "@engenty/plugin-sdk";
import { useQuery } from "@engenty/query-client";
import { useEffect, useState } from "react";
import { searchSpaceData } from "@/lib/api/space-data-client";
import type { SpaceDataRootSection } from "@/lib/space-data-root-sections";
import { spaceDriveKeys } from "@/lib/space-drive-queries";

/** Mirrors the server: shorter queries return nothing. */
export const SPACE_DATA_SEARCH_MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

export interface SpaceDataSearchGroup {
  id: string;
  /** The section heading for eager groups; the root for server groups. */
  moduleId?: string;
  nodes: DriveNode[];
  root?: string;
  section?: SpaceDataRootSection;
  truncated?: boolean;
}

/** Rows below `nodes` (already loaded) whose name matches, however deep. */
export function matchLoadedNodes(
  nodes: readonly DriveNode[],
  query: string
): DriveNode[] {
  const found: DriveNode[] = [];
  for (const node of nodes) {
    if (spaceDataNameMatches(node.name, query)) {
      found.push(node);
    }
    if (node.children) {
      found.push(...matchLoadedNodes(node.children, query));
    }
  }
  return found;
}

function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [value]);
  return debounced;
}

export function useSpaceDataSearch(
  spaceId: string | null,
  query: string,
  sections: readonly SpaceDataRootSection[]
): {
  active: boolean;
  groups: SpaceDataSearchGroup[];
  isPending: boolean;
  unavailable: string[];
} {
  const trimmed = query.trim();
  const debounced = useDebounced(trimmed);
  const active = trimmed.length >= SPACE_DATA_SEARCH_MIN_QUERY;
  const enabled =
    Boolean(spaceId) && debounced.length >= SPACE_DATA_SEARCH_MIN_QUERY;
  const search = useQuery({
    enabled,
    queryFn: ({ signal }) => searchSpaceData(spaceId ?? "", debounced, signal),
    queryKey: spaceDriveKeys.search(spaceId ?? "", debounced),
    staleTime: 10_000,
  });

  const loaded: SpaceDataSearchGroup[] = active
    ? sections.flatMap((section) => {
        const rows = section.root ? section.root.children : section.children;
        if (!rows) {
          return [];
        }
        const nodes = matchLoadedNodes(rows, trimmed);
        return nodes.length > 0 ? [{ id: section.id, nodes, section }] : [];
      })
    : [];
  const searched: SpaceDataSearchGroup[] =
    active && search.data
      ? search.data.roots.map((root) => ({
          id: `root:${root.root}`,
          moduleId: root.moduleId,
          nodes: spaceDataChildNodes({
            entries: root.entries,
            folders: root.folders,
            moduleId: root.moduleId,
            parentPath: root.root,
          }),
          root: root.root,
          ...(root.truncated ? { truncated: true } : {}),
        }))
      : [];

  return {
    active,
    groups: [...loaded, ...searched],
    isPending:
      active && (trimmed !== debounced || (enabled && search.isPending)),
    unavailable: search.data?.unavailable ?? [],
  };
}
