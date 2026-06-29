"use client";

import type { Folder, Node, Root } from "fumadocs-core/page-tree";
import type { DocsLayoutProps } from "fumadocs-ui/layouts/docs";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { LayoutTab } from "fumadocs-ui/layouts/shared";
import { usePathname } from "next/navigation";
import { type ReactNode, useMemo } from "react";
import { baseOptions } from "@/lib/layout.shared";

const ROOT_HUB_PATHS = new Set(["/docs/README", "/docs/AGENTS"]);

function isFolder(node: Node): node is Folder {
  return node.type === "folder";
}

function collectPageUrls(folder: Folder, urls = new Set<string>()) {
  if (folder.index) {
    urls.add(folder.index.url);
  }

  for (const child of folder.children) {
    if (child.type === "page" && !child.external) {
      urls.add(child.url);
    }

    if (child.type === "folder") {
      collectPageUrls(child, urls);
    }
  }

  return urls;
}

function firstPageUrl(folder: Folder): string | undefined {
  if (folder.index) {
    return folder.index.url;
  }

  for (const child of folder.children) {
    if (child.type === "page" && !child.external) {
      return child.url;
    }
  }
}

function getRootFolders(tree: Root) {
  const roots: Folder[] = [];

  function scan(nodes: Node[]) {
    for (const node of nodes) {
      if (!isFolder(node)) {
        continue;
      }

      if (node.root) {
        roots.push(node);
      }

      scan(node.children);
    }
  }

  scan(tree.children);

  if (tree.fallback) {
    scan(tree.fallback.children);
  }

  return roots;
}

function createTabs(rootFolders: Folder[]): LayoutTab[] {
  const defaultRoot = rootFolders[0];

  return rootFolders.flatMap((folder) => {
    const url = firstPageUrl(folder);

    if (!url) {
      return [];
    }

    const urls = collectPageUrls(folder);

    if (folder === defaultRoot) {
      for (const rootHubPath of ROOT_HUB_PATHS) {
        urls.add(rootHubPath);
      }
    }

    return [
      {
        url,
        title: folder.name,
        icon: folder.icon,
        description: folder.description,
        urls,
      },
    ];
  });
}

function treeForPath(
  tree: Root,
  rootFolders: Folder[],
  pathname: string,
): Root {
  const defaultRoot = rootFolders[0];

  if (!defaultRoot || !ROOT_HUB_PATHS.has(pathname)) {
    return tree;
  }

  return {
    ...tree,
    $id: `${tree.$id ?? "root"}:default-root`,
    name: defaultRoot.name,
    children: defaultRoot.children,
  };
}

export function DocsLayoutShell({
  tree,
  internalTree,
  children,
}: {
  tree: Root;
  /** Page tree for docs/internal/* (local-only; empty in the published build). */
  internalTree?: Root;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // Internal docs live under /docs/internal and have their own sidebar tree.
  const isInternal = pathname.startsWith("/docs/internal");
  const baseTree = isInternal && internalTree ? internalTree : tree;
  const rootFolders = useMemo(() => getRootFolders(baseTree), [baseTree]);
  const tabs = useMemo(() => createTabs(rootFolders), [rootFolders]);
  const activeTree = useMemo(
    () => treeForPath(baseTree, rootFolders, pathname),
    [pathname, rootFolders, baseTree],
  );
  const DocsLayoutWithChildren = DocsLayout as React.ComponentType<
    DocsLayoutProps & { children: ReactNode }
  >;

  return (
    <DocsLayoutWithChildren tree={activeTree} tabs={tabs} {...baseOptions()}>
      {children}
    </DocsLayoutWithChildren>
  );
}
