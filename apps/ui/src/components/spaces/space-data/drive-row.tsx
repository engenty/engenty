/**
 * One row in the Data tree, and the children that open under it.
 *
 * Lives beside the tree orchestrator so SpaceDriveTree.tsx stays the list of
 * sections rather than also being the row renderer, the lazy fetchers, and
 * the keyboard behaviour.
 */
import type { DriveNode } from "@engenty/file-storage";
import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { ChevronRight } from "lucide-react";
import type { DragEvent, ReactNode } from "react";
import { useState } from "react";
import { isConnectedFolder } from "@/components/spaces/space-data/connected-folder";
import { driveNodeIcon } from "@/components/spaces/space-data/drive-kind-icon";
import {
  canDragDriveNode,
  canDropDriveNode,
  writeDriveNodeDrag,
} from "@/components/spaces/space-data/drive-row-nest";
import { DriveRowTitle } from "@/components/spaces/space-data/drive-row-title";
import { isArtifactFolder } from "@/lib/space-data-root-sections";
import {
  useSpaceDataChildren,
  useSpaceFolderChildren,
} from "@/lib/space-drive-queries";

/** Indent per level. One value, so every row's icons line up in a column. */
const INDENT_PX = 14;
const BASE_PAD_PX = 8;

export interface DriveRowContext {
  canRename?: (node: DriveNode) => boolean;
  draggingNode?: DriveNode | null;
  onDragEnd?: () => void;
  onDragStart?: (node: DriveNode) => void;
  onMoveInto?: (source: DriveNode, target: DriveNode) => void;
  onRename?: (node: DriveNode, name: string) => void | Promise<void>;
  onSelect?: (node: DriveNode) => void | Promise<void>;
  /**
   * Per-row actions, supplied by the page rather than built here.
   *
   * The tree stays a tree: what may be DONE to a node depends on its module's
   * declared capabilities and on dialogs that belong to the page, and a tree
   * that imported those would be a tree that knows about contacts. The row only
   * reserves the slot and decides WHEN it is visible.
   */
  renderRowActions?: (node: DriveNode) => ReactNode;
  /**
   * What the detail pane is showing, in the terms the URL carries it.
   *
   * Two fields rather than one node id: a record is addressed by its PATH,
   * which is the whole point of one namespace per space, while a file is
   * addressed by its id. Collapsing them into one opaque key would make the
   * link in the address bar stop meaning anything.
   */
  selectedArtifactId?: string;
  selectedFileId?: string;
  /** A file-space folder or mount, which is addressed by id like a file. */
  selectedFolderId?: string;
  selectedPath?: string;
  spaceId: string | null;
}

function isSelected(node: DriveNode, context: DriveRowContext): boolean {
  if (node.kind === "file") {
    return Boolean(
      context.selectedFileId && context.selectedFileId === node.sourceId
    );
  }
  if (node.kind === "artifact" || isArtifactFolder(node)) {
    return Boolean(
      context.selectedArtifactId && context.selectedArtifactId === node.sourceId
    );
  }
  if ((node.kind === "folder" || node.kind === "mount") && !node.dataPath) {
    return Boolean(
      context.selectedFolderId && context.selectedFolderId === node.sourceId
    );
  }
  return Boolean(
    context.selectedPath && context.selectedPath === node.dataPath
  );
}

interface DriveRowProps extends DriveRowContext {
  depth: number;
  node: DriveNode;
}

/** How this node's children are fetched — or that they are already here. */
type Expansion =
  | { kind: "data"; moduleId: string; path: string }
  | { kind: "eager"; children: DriveNode[] }
  | { kind: "files"; folderId: string | null }
  | null;

/**
 * What opening this row means.
 *
 * A `project` opens into its OWN file space (folder id null, its root), which
 * is why the owner rather than the path decides: a project folder and the
 * project's Files tab are the same object, addressed the same way.
 */
function expansionOf(node: DriveNode): Expansion {
  if (node.children) {
    return { children: node.children, kind: "eager" };
  }
  if (node.hasChildren && node.dataPath && node.moduleId) {
    return { kind: "data", moduleId: node.moduleId, path: node.dataPath };
  }
  if (node.hasChildren && node.owner) {
    return {
      folderId: node.kind === "project" ? null : node.sourceId,
      kind: "files",
    };
  }
  return null;
}

function Indented({
  children,
  depth,
  tone = "muted",
}: {
  children: ReactNode;
  depth: number;
  tone?: "destructive" | "muted";
}) {
  return (
    <p
      className={cn(
        "py-1 pr-2 text-xs",
        tone === "destructive" ? "text-destructive" : "text-muted-foreground"
      )}
      style={{ paddingLeft: `${BASE_PAD_PX + (depth + 1) * INDENT_PX + 16}px` }}
    >
      {children}
    </p>
  );
}

function ChildRows({
  context,
  depth,
  nodes,
}: {
  context: DriveRowContext;
  depth: number;
  nodes: DriveNode[];
}) {
  return (
    <>
      {nodes.map((child) => (
        <DriveRow {...context} depth={depth + 1} key={child.id} node={child} />
      ))}
    </>
  );
}

/**
 * The children of an OPEN module folder.
 *
 * A separate component so the query only mounts once the folder is expanded —
 * rendering it collapsed-but-fetching is how a lazy tree quietly becomes an
 * eager one.
 */
function DataChildren({
  context,
  depth,
  moduleId,
  path,
}: {
  context: DriveRowContext;
  depth: number;
  moduleId: string;
  path: string;
}) {
  const { t } = useTranslation("common");
  const { error, isPending, nodes, truncated } = useSpaceDataChildren(
    context.spaceId,
    moduleId,
    path
  );
  if (isPending) {
    return <Indented depth={depth}>{t("spaces.data.loading")}</Indented>;
  }
  if (error) {
    return (
      <Indented depth={depth} tone="destructive">
        {t("spaces.data.folderFailed", {
          defaultValue: "This folder could not be loaded.",
        })}
      </Indented>
    );
  }
  return (
    <>
      <ChildRows context={context} depth={depth} nodes={nodes} />
      {nodes.length === 0 ? (
        <Indented depth={depth}>{t("spaces.data.emptyFolder")}</Indented>
      ) : null}
      {truncated ? (
        // A capped listing SAYS it is capped. A shorter list that looks
        // complete is the one failure mode a tree must never have.
        <Indented depth={depth}>
          {t("spaces.data.truncated", {
            defaultValue: "Showing the first results only.",
          })}
        </Indented>
      ) : null}
    </>
  );
}

/** The children of an OPEN file-space folder, project or connector mount. */
function FolderChildren({
  context,
  depth,
  folderId,
  node,
}: {
  context: DriveRowContext;
  depth: number;
  folderId: string | null;
  node: DriveNode;
}) {
  const { t } = useTranslation("common");
  const { error, isPending, nodes } = useSpaceFolderChildren(
    node.owner,
    folderId
  );
  if (isPending) {
    return <Indented depth={depth}>{t("spaces.data.loading")}</Indented>;
  }
  if (error) {
    return (
      <Indented depth={depth} tone="destructive">
        {t("spaces.data.folderFailed", {
          defaultValue: "This folder could not be loaded.",
        })}
      </Indented>
    );
  }
  return (
    <>
      <ChildRows context={context} depth={depth} nodes={nodes} />
      {nodes.length === 0 ? (
        <Indented depth={depth}>{t("spaces.data.emptyFolder")}</Indented>
      ) : null}
    </>
  );
}

function DriveRow({ depth, node, ...context }: DriveRowProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const actions = context.renderRowActions?.(node);
  const expansion = expansionOf(node);
  const expandable = expansion !== null;
  const artifactFolder = isArtifactFolder(node);
  const iconUntilHover =
    expandable && (artifactFolder || isConnectedFolder(node));
  /**
   * Does this row have somewhere to go in the pane?
   *
   * Containers included, which is the correction: this used to read
   * `!expandable && …`, so a folder could only ever be expanded and a knowledge
   * page with children — a category — could not be opened at all. A folder IS a
   * thing you can look at (its module renders it, or the pane lists it), and a
   * tree whose containers are the only rows that show nothing is a tree where
   * the most obvious click does the least.
   *
   * `href` stays leaf-only: a project and an artifact leave this page entirely,
   * and a row that navigates away on the same click that expands it would make
   * the tree unusable for browsing.
   */
  const opensInPane = Boolean(
    node.dataPath ||
      node.isReference ||
      node.kind === "file" ||
      node.kind === "artifact" ||
      artifactFolder ||
      ((node.kind === "folder" || node.kind === "mount") && node.owner)
  );
  const selectable = opensInPane || (!expandable && Boolean(node.href));
  const selected = isSelected(node, context);
  const Icon = driveNodeIcon({
    kind: node.kind,
    ...(node.moduleId ? { moduleId: node.moduleId } : {}),
    ...(node.nodeType ? { nodeType: node.nodeType } : {}),
    open,
  });
  const canRename = Boolean(context.canRename?.(node));
  const canDrag = canDragDriveNode(node);
  const isDragging = context.draggingNode?.id === node.id;
  const droppable =
    context.draggingNode != null &&
    canDropDriveNode(context.draggingNode, node);

  const activate = () => {
    if (editing) {
      return;
    }
    if (selectable) {
      // Selecting a container OPENS it rather than toggling: the pane is about
      // to show what is inside, and collapsing the row on the same click that
      // asked to see it would fight the pane. The chevron is still there for
      // anyone who wants the row shut again.
      if (expandable) {
        setOpen(true);
      }
      void context.onSelect?.(node);
      return;
    }
    if (expandable) {
      setOpen((value) => !value);
    }
  };

  const openRowMenu = (event: { currentTarget: HTMLElement }) => {
    const trigger = event.currentTarget.querySelector<HTMLElement>(
      "[data-row-menu-trigger]"
    );
    trigger?.click();
  };

  const onDragOverRow = (event: DragEvent<HTMLDivElement>) => {
    if (!droppable) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropActive(true);
  };

  const iconClassName = cn(
    "size-4",
    selected ? "text-foreground" : "text-muted-foreground"
  );

  return (
    <>
      <div
        className={cn(
          // Every name at full contrast: these are the space's own things, and
          // a tree drawn in muted grey reads as a list of things you cannot
          // have. WEIGHT carries the selection instead of colour — the row
          // already has a filled background, so darkening the text on top of it
          // said the same thing twice while leaving every other row faint.
          "group/row relative flex items-center gap-1.5 rounded-md py-1 pr-2 text-foreground text-sm",
          selected ? "bg-muted font-semibold" : null,
          expandable || selectable ? "cursor-pointer hover:bg-muted/60" : null,
          dropActive ? "bg-primary/10 ring-1 ring-primary/40" : null,
          isDragging ? "opacity-60" : null
        )}
        draggable={canDrag && !editing}
        onClick={expandable || selectable ? activate : undefined}
        onContextMenu={(event) => {
          if (!actions) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          openRowMenu(event);
        }}
        onDragEnd={() => {
          setDropActive(false);
          context.onDragEnd?.();
        }}
        onDragLeave={() => setDropActive(false)}
        onDragOver={onDragOverRow}
        onDragStart={(event) => {
          if (!canDrag) {
            event.preventDefault();
            return;
          }
          writeDriveNodeDrag(event.dataTransfer, node);
          context.onDragStart?.(node);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDropActive(false);
          const source = context.draggingNode;
          if (source && canDropDriveNode(source, node)) {
            context.onMoveInto?.(source, node);
            if (expandable) {
              setOpen(true);
            }
          }
          context.onDragEnd?.();
        }}
        onKeyDown={
          expandable || selectable || canRename
            ? (event) => {
                if (editing) {
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (canRename) {
                    setEditing(true);
                    return;
                  }
                  activate();
                  return;
                }
                if (event.key === " ") {
                  event.preventDefault();
                  activate();
                }
                // Arrow keys read as a tree the way a file manager does:
                // right opens, left closes, and neither moves the selection.
                if (event.key === "ArrowRight" && expandable) {
                  setOpen(true);
                }
                if (event.key === "ArrowLeft" && expandable) {
                  setOpen(false);
                }
              }
            : undefined
        }
        role={expandable || selectable ? "button" : undefined}
        style={{ paddingLeft: `${BASE_PAD_PX + depth * INDENT_PX}px` }}
        tabIndex={expandable || selectable ? 0 : undefined}
      >
        <span className="relative flex size-4 shrink-0 items-center justify-center">
          {iconUntilHover ? (
            <>
              <Icon
                aria-hidden
                className={cn(
                  iconClassName,
                  "transition-opacity group-focus-within/row:opacity-0 group-hover/row:opacity-0"
                )}
              />
              <button
                aria-expanded={open}
                aria-label={
                  open
                    ? t("actions.collapse", { defaultValue: "Collapse" })
                    : t("actions.expand", { defaultValue: "Expand" })
                }
                className="pointer-events-none absolute inset-0 flex items-center justify-center rounded opacity-0 transition-opacity hover:bg-muted group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100 group-hover/row:pointer-events-auto group-hover/row:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen((value) => !value);
                }}
                type="button"
              >
                <ChevronRight
                  className={cn(
                    "size-3.5 text-muted-foreground transition-transform",
                    open ? "rotate-90" : null
                  )}
                />
              </button>
            </>
          ) : expandable ? (
            <button
              aria-expanded={open}
              aria-label={
                open
                  ? t("actions.collapse", { defaultValue: "Collapse" })
                  : t("actions.expand", { defaultValue: "Expand" })
              }
              className="flex size-4 items-center justify-center rounded hover:bg-muted"
              onClick={(event) => {
                event.stopPropagation();
                setOpen((value) => !value);
              }}
              type="button"
            >
              <ChevronRight
                className={cn(
                  "size-3.5 text-muted-foreground transition-transform",
                  open ? "rotate-90" : null
                )}
              />
            </button>
          ) : (
            <Icon className={iconClassName} />
          )}
        </span>
        <DriveRowTitle
          editing={editing}
          endGutterPx={actions ? 36 : 0}
          name={node.name}
          onCancel={() => setEditing(false)}
          onCommit={(value) => {
            setEditing(false);
            const next = value.trim();
            if (next && next !== node.name) {
              void context.onRename?.(node, next);
            }
          }}
        />
        {/* Hover/focus reveals it, and it STAYS while its own menu is open.
            Right-click on the row opens the same ⋮ trigger. */}
        {actions ? (
          <span
            className="pointer-events-none absolute top-0 right-0 bottom-0 z-10 flex items-center bg-gradient-to-l from-40% from-muted to-transparent pr-1 pl-8 opacity-0 transition-opacity group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100 group-hover/row:pointer-events-auto group-hover/row:opacity-100 has-data-[state=open]:pointer-events-auto has-data-[state=open]:opacity-100"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {actions}
          </span>
        ) : null}
      </div>
      {open && expansion?.kind === "eager" ? (
        <ChildRows context={context} depth={depth} nodes={expansion.children} />
      ) : null}
      {open && expansion?.kind === "data" ? (
        <DataChildren
          context={context}
          depth={depth}
          moduleId={expansion.moduleId}
          path={expansion.path}
        />
      ) : null}
      {open && expansion?.kind === "files" ? (
        <FolderChildren
          context={context}
          depth={depth}
          folderId={expansion.folderId}
          node={node}
        />
      ) : null}
    </>
  );
}

/**
 * What lives under a root-type heading. Depth is -1 so the first real rows
 * sit at the same indent the old top-level folders used — the heading already
 * named the type, so the children should not step in again.
 */
export function RootSectionBody({
  context,
  section,
}: {
  context: DriveRowContext;
  section: {
    children: DriveNode[];
    root: DriveNode | null;
  };
}) {
  if (!section.root) {
    return <ChildRows context={context} depth={-1} nodes={section.children} />;
  }
  const expansion = expansionOf(section.root);
  if (expansion?.kind === "eager") {
    return (
      <ChildRows context={context} depth={-1} nodes={expansion.children} />
    );
  }
  if (expansion?.kind === "data") {
    return (
      <DataChildren
        context={context}
        depth={-1}
        moduleId={expansion.moduleId}
        path={expansion.path}
      />
    );
  }
  if (expansion?.kind === "files") {
    return (
      <FolderChildren
        context={context}
        depth={-1}
        folderId={expansion.folderId}
        node={section.root}
      />
    );
  }
  return null;
}
