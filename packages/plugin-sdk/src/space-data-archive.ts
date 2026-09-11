/**
 * Space export and import (PLAN-space-data.md D5).
 *
 * Export is not a format — it is **the tree, written down**. A folder becomes a
 * directory with an `index.md`; a record becomes its own file; a bundle becomes
 * a directory of its members. That is the whole point of decision 3: because a
 * folder is `directory + index.md | index.json` everywhere, a native Data
 * folder, a local folder, an S3 prefix and a mounted Drive folder are the same
 * shape, and "export" is just writing the shape somewhere else.
 *
 * The archive here is a flat `path → content` map, deliberately transport-free.
 * A caller writes it to disk, zips it, or uploads it to a bucket; a caller
 * reading one back gets the same map. Keeping the SHAPE separate from the
 * transport is what makes the round trip testable without a filesystem — and
 * acceptance 5 is a round trip.
 *
 * Derived members are skipped. An offer's summary is a render, so exporting it
 * would put a stale copy in the archive and re-importing it would try to write
 * a member that refuses writes. What comes back in is what could go out.
 */

import type { SpaceDataDocument, SpaceDataFolder } from "./space-data.js";
import {
  type SpaceDataFolderIndex,
  serializeFolderIndexMarkdown,
} from "./space-data-format.js";

export interface SpaceDataArchiveEntry {
  content: string;
  encoding: "base64" | "utf8";
  /** Archive-relative, e.g. `Contacts/People/anna__1.contact.md`. */
  path: string;
}

export interface SpaceDataArchive {
  entries: SpaceDataArchiveEntry[];
  exportedAt: string;
  spaceId: string;
}

/** A folder's `index.md` inside the archive. */
export function archiveFolderEntry(input: {
  folder: SpaceDataFolder;
  /** Archive-relative path of the folder itself. */
  path: string;
}): SpaceDataArchiveEntry {
  const index: SpaceDataFolderIndex = {
    fields: {},
    title: input.folder.name,
    ...(input.folder.description
      ? { description: input.folder.description }
      : {}),
  };
  return {
    content: serializeFolderIndexMarkdown(index),
    encoding: "utf8",
    path: `${input.path}/index.md`,
  };
}

/**
 * A node's entries: one file for a record, one per source member for a bundle.
 *
 * A bundle keeps its directory — `relaunch__<id>.offer/offer.json` — because
 * that IS the bundle: one node to a human, a directory to everything that reads
 * files, and the archive is the second kind of reader.
 */
export function archiveDocumentEntries(input: {
  document: SpaceDataDocument;
  /** Archive-relative path of the node. */
  path: string;
}): SpaceDataArchiveEntry[] {
  const source = input.document.members.filter((member) => !member.derived);
  if (input.document.kind === "record") {
    const member = source[0];
    return member
      ? [
          {
            content: member.content,
            encoding: member.encoding,
            path: input.path,
          },
        ]
      : [];
  }
  return source.map((member) => ({
    content: member.content,
    encoding: member.encoding,
    path: `${input.path}/${member.name}`,
  }));
}

/**
 * The archive, read back apart into what an importer must do.
 *
 * `folders` are the index files (metadata to apply), `nodes` are everything
 * else grouped by the node they belong to — so a bundle's four members arrive
 * as ONE node with four members, which is the shape the write path takes.
 */
export interface SpaceDataArchivePlan {
  folders: Array<{ index: string; path: string }>;
  nodes: Array<{
    members: Array<{ content: string; encoding: string; name: string }>;
    path: string;
  }>;
}

/**
 * Group an archive's flat entries back into folders and nodes.
 *
 * A path is part of a BUNDLE when one of its ancestors carries a bundle
 * extension, which is decided by the extensions the caller passes in — the
 * archive itself stays format-agnostic, exactly like the tree it came from.
 */
export function planSpaceDataImport(input: {
  archive: SpaceDataArchive;
  /** Bundle extensions in play, e.g. `[".offer"]`. */
  bundleExtensions: readonly string[];
}): SpaceDataArchivePlan {
  const folders: SpaceDataArchivePlan["folders"] = [];
  const nodesByPath = new Map<
    string,
    Array<{ content: string; encoding: string; name: string }>
  >();
  for (const entry of input.archive.entries) {
    const segments = entry.path.split("/").filter(Boolean);
    const name = segments.at(-1) ?? "";
    if (name === "index.md" || name === "index.json") {
      folders.push({
        index: entry.content,
        path: segments.slice(0, -1).join("/"),
      });
      continue;
    }
    const bundleIndex = segments.findIndex((segment, position) =>
      position < segments.length - 1
        ? input.bundleExtensions.some((extension) =>
            segment.endsWith(extension)
          )
        : false
    );
    const nodePath =
      bundleIndex === -1
        ? entry.path
        : segments.slice(0, bundleIndex + 1).join("/");
    const memberName =
      bundleIndex === -1 ? name : segments.slice(bundleIndex + 1).join("/");
    const members = nodesByPath.get(nodePath) ?? [];
    members.push({
      content: entry.content,
      encoding: entry.encoding,
      name: memberName,
    });
    nodesByPath.set(nodePath, members);
  }
  return {
    folders: folders.sort((a, b) => a.path.localeCompare(b.path)),
    nodes: [...nodesByPath.entries()]
      .map(([path, members]) => ({ members, path }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  };
}
