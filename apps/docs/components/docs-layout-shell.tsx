"use client";

import type { Folder, Node, Root } from "fumadocs-core/page-tree";
import type { DocsLayoutProps } from "fumadocs-ui/layouts/docs";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { LayoutTab } from "fumadocs-ui/layouts/shared";
import { usePathname } from "next/navigation";
import { type ReactNode, useMemo } from "react";
import { Mascot } from "@/components/brand/mascot";
import { sectionBrand } from "@/components/brand/section-tone";
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

    // The tab's mascot replaces the lucide icon from meta.json: each section is
    // a room with its own engenty, in the sidebar chooser as on the page title.
    const brand = sectionBrand(url);

    return [
      {
        url,
        title: folder.name,
        icon: <Mascot animated={false} kind={brand.kind} size={22} />,
        description: folder.description,
        urls,
        props: { "data-tone": brand.tone } as LayoutTab["props"],
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
  const brand = sectionBrand(pathname);
  const sectionName =
    tabs.find((tab) => tab.urls?.has(pathname))?.title ??
    rootFolders[0]?.name ??
    "Docs";
  const DocsLayoutWithChildren = DocsLayout as React.ComponentType<
    DocsLayoutProps & { children: ReactNode }
  >;

  return (
    <DocsLayoutWithChildren
      tree={activeTree}
      tabs={tabs}
      // `data-tone` drives the section colour (global.css): links, active rows,
      // heading markers, the hard block shadows.
      containerProps={
        { "data-tone": brand.tone } as DocsLayoutProps["containerProps"]
      }
      sidebar={{
        banner: (
          <div className="docs-sidebar-banner hb-window">
            <div className="hb-bar">
              <span className="hb-bar-title">navigator</span>
            </div>
            <div className="hb-body">
              <Mascot kind={brand.kind} size={44} />
              <span className="docs-sidebar-banner-text">
                <span className="docs-kicker">you are in</span>
                <span className="docs-sidebar-banner-name">{sectionName}</span>
              </span>
            </div>
          </div>
        ),
      }}
      {...baseOptions()}
    >
      {children}
    </DocsLayoutWithChildren>
  );
}
