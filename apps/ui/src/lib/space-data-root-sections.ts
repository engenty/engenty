/**
 * Split the Data tree's top level into one section per root type.
 *
 * Adapter roots (Files, Contacts, Knowledge, …) and the synthetic Projects
 * folder each become a heading. All `ai.artifact` rows — markdown pages, html,
 * tables, apps, files, and artifact folders — gather under Artifacts. Knowledge
 * Base is a mounted-module root, not this section.
 */
import type { DriveNode } from "@engenty/file-storage";

export const ARTIFACTS_SECTION_ID = "artifacts";

export interface SpaceDataRootSection {
  /** Eager children (projects, artifacts). Empty when the root loads lazily. */
  children: DriveNode[];
  id: string;
  label: string;
  /** The adapter/projects folder this heading stands for; null for Artifacts. */
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

export function groupSpaceDataRootSections(
  nodes: readonly DriveNode[],
  labels: { artifacts: string }
): SpaceDataRootSection[] {
  const artifacts: DriveNode[] = [];
  const sections: SpaceDataRootSection[] = [];
  for (const node of nodes) {
    if (isArtifactTreeNode(node)) {
      artifacts.push(node);
      continue;
    }
    sections.push({
      children: node.children ?? [],
      id: node.id,
      label: node.name,
      root: node,
    });
  }
  sections.push({
    children: artifacts,
    id: ARTIFACTS_SECTION_ID,
    label: labels.artifacts,
    root: null,
  });
  return sections;
}

export function spaceDataSectionContainsSelection(
  section: SpaceDataRootSection,
  selection: {
    artifactsRoot?: boolean;
    selectedArtifactId?: string;
    selectedPath?: string;
  }
): boolean {
  if (section.root?.dataPath && selection.selectedPath) {
    const root = section.root.dataPath;
    return (
      selection.selectedPath === root ||
      selection.selectedPath.startsWith(`${root}/`)
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
