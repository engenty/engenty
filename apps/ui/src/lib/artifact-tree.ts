/**
 * Parent/child walks over space-scoped artifacts.
 *
 * The Data tree already nests these by `parent_id`; the pane needs the same
 * walk so breadcrumbs and a folder listing do not invent a second hierarchy.
 */
import type { SpaceDriveArtifact } from "@engenty/file-storage";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";

export type ArtifactTreeRow = Pick<
  SpaceDriveArtifact,
  "id" | "parentId" | "title" | "type" | "updatedAt"
>;

/**
 * Ancestors of `artifactId`, root-first, excluding the artifact itself.
 *
 * Missing or cyclic parents stop the walk rather than looping; an orphan
 * (parent gone) sits under the Artifacts root, matching the tree.
 */
export function artifactAncestors(
  artifactId: string,
  rows: readonly ArtifactTreeRow[]
): ArtifactTreeRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const chain: ArtifactTreeRow[] = [];
  const seen = new Set<string>([artifactId]);
  let cursor = byId.get(artifactId)?.parentId ?? null;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const row = byId.get(cursor);
    if (!row) {
      break;
    }
    chain.push(row);
    cursor = row.parentId ?? null;
  }
  return chain.reverse();
}

/** Direct children of a folder, folders first then name. */
export function artifactsInFolder(
  folderId: string,
  rows: readonly ArtifactTreeRow[]
): ArtifactTreeRow[] {
  return rows
    .filter((row) => (row.parentId ?? null) === folderId)
    .sort((left, right) => {
      const folderRank = (row: ArtifactTreeRow) =>
        row.type === "folder" ? 0 : 1;
      const rank = folderRank(left) - folderRank(right);
      if (rank !== 0) {
        return rank;
      }
      return left.title.localeCompare(right.title);
    });
}

export function buildArtifactBreadcrumbs(input: {
  artifactId: string;
  hrefFor: (id: string) => string;
  rows: readonly ArtifactTreeRow[];
  /**
   * Data tab root. Must be first: the shell replaces the first crumb with the
   * module icon, so putting Artifacts here made the trail read as `/ Aktien`.
   */
  rootHref: string;
  rootLabel: string;
  sectionHref: string;
  sectionLabel: string;
  title: string;
}): PageBreadcrumb[] {
  const ancestors = artifactAncestors(input.artifactId, input.rows);
  return [
    { label: input.rootLabel, to: input.rootHref },
    {
      compactKept: true,
      label: input.sectionLabel,
      to: input.sectionHref,
    },
    ...ancestors.map((row) => ({
      label: row.title,
      to: input.hrefFor(row.id),
    })),
    { label: input.title },
  ];
}
