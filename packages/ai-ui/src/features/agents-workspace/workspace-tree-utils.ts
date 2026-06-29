// Build a nested folder/file tree from the flat recursive file list returned by
// the workspace `/tree` endpoint. Directories sort before files, then by name.

import type { WorkspaceFileEntry } from "../../lib/runtime/workspace-api";

export interface WorkspaceTreeNode {
  children: WorkspaceTreeNode[];
  isDir: boolean;
  name: string;
  /** Full path relative to the mount root. */
  path: string;
  size: number | null;
}

interface MutableNode {
  children: Map<string, MutableNode>;
  isDir: boolean;
  name: string;
  path: string;
  size: number | null;
}

function sortNodes(nodes: WorkspaceTreeNode[]): WorkspaceTreeNode[] {
  return nodes.sort((a, b) => {
    if (a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

function finalize(node: MutableNode): WorkspaceTreeNode {
  return {
    name: node.name,
    path: node.path,
    isDir: node.isDir,
    size: node.size,
    children: sortNodes([...node.children.values()].map(finalize)),
  };
}

/** All folder paths in the tree (depth-first), for the new-file parent picker. */
export function collectFolderPaths(nodes: WorkspaceTreeNode[]): string[] {
  const out: string[] = [];
  const walk = (list: WorkspaceTreeNode[]) => {
    for (const node of list) {
      if (node.isDir) {
        out.push(node.path);
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return out;
}

export function buildWorkspaceTree(
  files: WorkspaceFileEntry[]
): WorkspaceTreeNode[] {
  const roots = new Map<string, MutableNode>();
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let level = roots;
    let acc = "";
    parts.forEach((part, index) => {
      acc = acc ? `${acc}/${part}` : part;
      const isLeaf = index === parts.length - 1;
      let node = level.get(part);
      if (!node) {
        node = {
          name: part,
          path: acc,
          isDir: !isLeaf,
          size: isLeaf ? file.size : null,
          children: new Map(),
        };
        level.set(part, node);
      }
      level = node.children;
    });
  }
  return sortNodes([...roots.values()].map(finalize));
}
