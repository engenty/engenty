/**
 * Split the Data tree's top level into one section per root type:
 *
 * 1. Documents — the AI-made documents: `ai.artifact` rows (pages, tables,
 *    databases, html, files, artifact folders).
 * 2. Apps — the Space's App artifacts.
 * 3. Files — the agents' folders (`/space/agent/<id>/`) first, listed
 *    directly, then the Files module's root. Present for the agents' folders
 *    alone when the Space does not mount Files.
 * 4. Shared — `/space/public/`.
 * 5. Every other adapter root (Contacts, Knowledge, …) and Projects.
 *
 * Which of them are EMPTY is not known here for a lazy root — the tree
 * filters those once their first level has loaded.
 */
import type { DriveNode } from "@engenty/file-storage";

export const ARTIFACTS_SECTION_ID = "artifacts";
export const APPS_SECTION_ID = "apps";
export const FILES_SECTION_ID = "files";

/** The core roots over the Space's folder (`apps/core` space-folder-adapter). */
const SPACE_AGENTS_MODULE_ID = "space-agents";
const SPACE_PUBLIC_MODULE_ID = "space-public";
const FILES_MODULE_ID = "files";

export interface SpaceDataRootSection {
  /** Eager children (projects, artifacts). Empty when the root loads lazily. */
  children: DriveNode[];
  /** Roots whose CHILDREN are listed before the root's own (the agents' folders in Files). */
  extra?: DriveNode[];
  id: string;
  label: string;
  /** The adapter/projects folder this heading stands for; null for Documents and Apps. */
  root: DriveNode | null;
}

/** An `ai.artifact` folder row — kind is `folder`, not `artifact`. */
export function isArtifactFolder(node: DriveNode): boolean {
  return node.kind === "folder" && node.nodeType === "folder" && !node.dataPath;
}

/** Artifact folders nest by parent_id; they are not module roots. */
export function isArtifactTreeNode(node: DriveNode): boolean {
  return node.kind === "artifact" || isArtifactFolder(node);
}

function rootSection(node: DriveNode): SpaceDataRootSection {
  return {
    children: node.children ?? [],
    id: node.id,
    label: node.name,
    root: node,
  };
}

export function groupSpaceDataRootSections(
  nodes: readonly DriveNode[],
  labels: { apps: string; artifacts: string; files: string }
): SpaceDataRootSection[] {
  const artifacts: DriveNode[] = [];
  const apps: DriveNode[] = [];
  let agents: DriveNode | null = null;
  let files: SpaceDataRootSection | null = null;
  let shared: SpaceDataRootSection | null = null;
  const sections: SpaceDataRootSection[] = [];
  for (const node of nodes) {
    if (isArtifactTreeNode(node)) {
      (node.kind === "artifact" && node.nodeType === "app"
        ? apps
        : artifacts
      ).push(node);
    } else if (node.moduleId === SPACE_AGENTS_MODULE_ID) {
      agents = node;
    } else if (node.moduleId === FILES_MODULE_ID) {
      files = rootSection(node);
    } else if (node.moduleId === SPACE_PUBLIC_MODULE_ID) {
      shared = rootSection(node);
    } else {
      sections.push(rootSection(node));
    }
  }
  if (agents) {
    files = files
      ? { ...files, extra: [agents] }
      : {
          children: [],
          extra: [agents],
          id: FILES_SECTION_ID,
          label: labels.files,
          root: null,
        };
  }
  return [
    {
      children: artifacts,
      id: ARTIFACTS_SECTION_ID,
      label: labels.artifacts,
      root: null,
    },
    { children: apps, id: APPS_SECTION_ID, label: labels.apps, root: null },
    ...(files ? [files] : []),
    ...(shared ? [shared] : []),
    ...sections,
  ];
}

export function spaceDataSectionContainsSelection(
  section: SpaceDataRootSection,
  selection: {
    artifactsRoot?: boolean;
    selectedArtifactId?: string;
    selectedPath?: string;
  }
): boolean {
  if (selection.selectedPath) {
    const selected = selection.selectedPath;
    const roots = [section.root, ...(section.extra ?? [])].flatMap((node) =>
      node?.dataPath ? [node.dataPath] : []
    );
    if (roots.length > 0) {
      return roots.some(
        (root) => selected === root || selected.startsWith(`${root}/`)
      );
    }
  }
  if (section.id === APPS_SECTION_ID && selection.selectedArtifactId) {
    return artifactSectionContainsId(
      section.children,
      selection.selectedArtifactId
    );
  }
  if (section.id !== ARTIFACTS_SECTION_ID) {
    return false;
  }
  if (selection.artifactsRoot) {
    return true;
  }
  if (selection.selectedArtifactId) {
    return artifactSectionContainsId(
      section.children,
      selection.selectedArtifactId
    );
  }
  return false;
}

function artifactSectionContainsId(
  nodes: readonly DriveNode[],
  artifactId: string
): boolean {
  return nodes.some(
    (node) =>
      node.sourceId === artifactId ||
      (node.children != null &&
        artifactSectionContainsId(node.children, artifactId))
  );
}
