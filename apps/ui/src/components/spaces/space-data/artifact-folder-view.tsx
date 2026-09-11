/**
 * An artifact folder, listed as a card grid of what it contains.
 *
 * Folders are not a file type — there is nothing to preview. The pane is the
 * same object the tree row opened: its children, one large card each, so a
 * folder of tables is browsable without the sidebar.
 */
import { iconForArtifactType } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { cn, Spinner, uiCardRaisedClassName } from "@engenty/ui-core";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { getSpaceArtifacts } from "@/lib/api/space-drive-client";
import { artifactsInFolder } from "@/lib/artifact-tree";
import { spaceDriveKeys } from "@/lib/space-drive-queries";
import { spaceDataArtifactPath } from "@/lib/space-routes";
import { useArtifactOverflow } from "./artifact-overflow";
import { ArtifactOverflowMenuItems } from "./artifact-overflow-menu";
import { PaneChrome } from "./pane-chrome";

export function ArtifactFolderPane({
  artifact,
  breadcrumbs,
  onClose,
  spaceId,
}: {
  artifact: {
    id: string;
    parent_id?: string | null;
    title: string;
    type: string;
  };
  breadcrumbs: PageBreadcrumb[];
  onClose: () => void;
  spaceId?: string | null;
}) {
  const { spaceKey = "" } = useParams();
  const overflow = useArtifactOverflow({
    artifactId: artifact.id,
    content: null,
    parentId: artifact.parent_id ?? null,
    spaceId: spaceId ?? null,
    spaceKey,
    title: artifact.title,
    type: artifact.type,
  });
  const menuItems = useMemo(
    () => (
      <ArtifactOverflowMenuItems
        artifactId={artifact.id}
        capabilities={overflow.capabilities}
        onCopyLink={overflow.copyLink}
        onDelete={overflow.openDelete}
        onDuplicate={() => void overflow.duplicate()}
        onEdit={overflow.openRename}
        onMove={overflow.openMove}
        onRename={overflow.openRename}
        onVersions={overflow.openHistory}
        pending={overflow.pending}
        spaceId={spaceId ?? null}
      />
    ),
    [
      artifact.id,
      overflow.capabilities,
      overflow.copyLink,
      overflow.duplicate,
      overflow.openDelete,
      overflow.openHistory,
      overflow.openMove,
      overflow.openRename,
      overflow.pending,
      spaceId,
    ]
  );

  return (
    <>
      <PaneChrome
        breadcrumbs={breadcrumbs}
        menuItems={menuItems}
        onClose={onClose}
      >
        <ArtifactFolderView folderId={artifact.id} spaceId={spaceId} />
      </PaneChrome>
      {overflow.dialogs}
    </>
  );
}

export function ArtifactFolderView({
  folderId,
  spaceId,
}: {
  folderId: string;
  spaceId?: string | null;
}) {
  const { t } = useTranslation("common");
  const { spaceKey = "" } = useParams();
  const artifactsQuery = useQuery({
    enabled: Boolean(spaceId),
    queryFn: ({ signal }) => getSpaceArtifacts(spaceId ?? "", signal),
    queryKey: spaceDriveKeys.artifacts(spaceId ?? ""),
  });
  const children = artifactsInFolder(folderId, artifactsQuery.data ?? []);

  if (artifactsQuery.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Spinner />
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <p className="p-6 text-muted-foreground text-sm">
        {t("spaces.data.emptyFolder", { defaultValue: "Empty." })}
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {children.map((row) => {
          const Icon = iconForArtifactType(row.type ?? "markdown");
          const typeLabel = artifactTypeLabel(row.type ?? "markdown", t);
          const edited = row.updatedAt
            ? formatFolderCardDate(row.updatedAt)
            : "";
          return (
            <Link
              className={cn(
                uiCardRaisedClassName,
                "group flex min-h-36 flex-col gap-4 p-5 text-left"
              )}
              key={row.id}
              to={spaceDataArtifactPath(spaceKey, row.id)}
            >
              <Icon
                aria-hidden
                className="size-9 shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 flex-1 font-medium text-base leading-snug group-hover:underline">
                {row.title}
              </span>
              <span className="text-muted-foreground text-xs">
                {[typeLabel, edited].filter(Boolean).join(" · ")}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function artifactTypeLabel(
  type: string,
  t: (key: string, options?: { defaultValue: string }) => string
): string {
  if (type === "folder") {
    return t("spaces.data.kind.folder", { defaultValue: "Folder" });
  }
  if (type === "markdown") {
    return t("spaces.data.newPage", { defaultValue: "Page" });
  }
  if (type === "html") {
    return t("spaces.data.newHtml", { defaultValue: "HTML" });
  }
  if (type === "table") {
    return t("spaces.data.newTable", { defaultValue: "Table" });
  }
  if (type === "database") {
    return t("spaces.data.kind.database", { defaultValue: "Database" });
  }
  if (type === "app") {
    return t("spaces.data.newApp", { defaultValue: "App" });
  }
  if (type === "file") {
    return t("spaces.data.kind.file", { defaultValue: "File" });
  }
  return type;
}

function formatFolderCardDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString();
}
