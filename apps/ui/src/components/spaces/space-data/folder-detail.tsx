/**
 * Folders in the Data pane: a module folder listed as its children, or a
 * file-space folder opened with FileManager.
 */
import type { FileSpaceOwnerRef } from "@engenty/file-storage";
import { fileSpaceOwnerKey } from "@engenty/file-storage";
import { FileManager } from "@engenty/files-ui/ui/file-manager";
import { useTranslation } from "@engenty/i18n/ui";
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSpaceDataLibrary } from "@/lib/space-data-library-persistence";
import { useSpaceDataFolder } from "@/lib/space-drive-queries";
import {
  spaceDataFilePath,
  spaceDataFolderInSpacePath,
  spaceDataFolderPath,
  spaceDataPath,
} from "@/lib/space-routes";
import type { FolderChildRow } from "./folder-list-model";
import { FolderOverview } from "./folder-overview";
import { PaneChrome, useNodeBreadcrumbs } from "./pane-chrome";
import { spaceDataFolderSurface, useSpaceDataSurfaceView } from "./surfaces";

/**
 * A data folder — `Contacts`, `Contacts/People`, `Offers/sent`.
 *
 * Listed rather than read, because that is what a folder is on this contract.
 * Its module gets first refusal through `spaces.data.folder:<type>`; the
 * generic list is what everything else gets.
 */
export function DataFolderDetail({
  onClose,
  path,
  spaceId,
}: {
  onClose: () => void;
  path: string;
  spaceId: string;
}) {
  const { t } = useTranslation("common");
  const { spaceKey = "" } = useParams();
  const listing = useSpaceDataFolder(spaceId, path);
  const breadcrumbs = useNodeBreadcrumbs(path);
  const View = useSpaceDataSurfaceView(
    listing.self?.nodeType
      ? spaceDataFolderSurface(listing.self.nodeType)
      : null
  );

  const children = useMemo<FolderChildRow[]>(
    () => [
      ...listing.folders.map((folder) => ({
        dataPath: folder.path,
        href: spaceDataFolderPath(spaceKey, folder.path),
        id: `folder:${folder.path}`,
        kind: "folder" as const,
        name: folder.name,
        ...(folder.nodeType ? { nodeType: folder.nodeType } : {}),
      })),
      ...listing.entries.map((entry) => ({
        dataPath: entry.path,
        href: spaceDataPath(spaceKey, entry.path),
        id: `${entry.kind}:${entry.recordId}`,
        kind: entry.kind,
        name: entry.title || entry.name,
        ...(entry.nodeType ? { nodeType: entry.nodeType } : {}),
        ...(entry.updatedAt ? { updatedAt: entry.updatedAt } : {}),
      })),
    ],
    [listing.entries, listing.folders, spaceKey]
  );

  if (View) {
    // The module renders the BODY; the host keeps the chrome — unlike a
    // module-rendered node, which owns both.
    //
    // A folder's identity is its path and the only thing you can do to it is
    // leave, and the host knows both already. Handing the topbar over too would
    // make every contributing module re-derive the same breadcrumbs from the
    // same string, and the one that forgot would render a pane you cannot tell
    // apart from the last one. A document is the opposite case: its title and
    // its actions (Edit, version) are things only its module knows.
    //
    // It also keeps the chrome STABLE across the fetch: `self` — and so the
    // renderer — is unknown until the listing lands, so the first frame is
    // always this component's, and a topbar that appeared and then vanished
    // would flicker on every folder open.
    //
    // The LISTING travels with the params. The host has already fetched it, and
    // it is the only place the nodes' data PATHS exist: a module that refetched
    // from its own API would get its records back without them, and would have
    // to rebuild each path from the adapter's naming convention to link a row
    // back into this pane. Enriching by `recordId` is the module's job; knowing
    // where a node lives in the tree is the host's.
    return (
      <PaneChrome breadcrumbs={breadcrumbs} onClose={onClose}>
        <View
          params={{
            entries: listing.entries,
            folderPath: path,
            folders: listing.folders,
            isPending: listing.isPending,
            spaceId,
            truncated: listing.truncated,
            ...(listing.self?.nodeType
              ? { nodeType: listing.self.nodeType }
              : {}),
          }}
          surface={spaceDataFolderSurface(listing.self?.nodeType ?? "")}
        />
      </PaneChrome>
    );
  }

  if (listing.error) {
    return (
      <PaneChrome breadcrumbs={breadcrumbs} onClose={onClose}>
        <p className="p-6 text-destructive text-sm">
          {t("spaces.data.readFailed", {
            defaultValue: "This node could not be read.",
          })}
        </p>
      </PaneChrome>
    );
  }

  return (
    <PaneChrome breadcrumbs={breadcrumbs} onClose={onClose}>
      <FolderOverview
        isPending={listing.isPending}
        spaceId={spaceId}
        truncated={listing.truncated}
        {...(listing.self?.description
          ? { description: listing.self.description }
          : {})}
      >
        {children}
      </FolderOverview>
    </PaneChrome>
  );
}

/**
 * A real folder of bytes — a file-space folder or a connector mount.
 *
 * FileManager is the same component the project Files tab uses, pointed at this
 * folder, with clicks routed through the Data URLs so the sidebar tree and the
 * pane stay one object.
 */
export function FileFolderDetail({
  folderId,
  onClose,
  owner,
  spaceId,
}: {
  folderId: string;
  onClose: () => void;
  owner: FileSpaceOwnerRef;
  spaceId: string | null;
}) {
  const { spaceKey = "" } = useParams();
  const navigate = useNavigate();
  const library = useSpaceDataLibrary(spaceId);

  return (
    <PaneChrome onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        <FileManager
          folderId={folderId}
          hideBreadcrumb
          onOpenFile={(file) => {
            const href = spaceDataFilePath(spaceKey, {
              fileSpaceKey: fileSpaceOwnerKey(owner),
              folderId,
              id: file.id,
            });
            if (spaceId) {
              library.touchRecent({
                href,
                kind: "file",
                space_id: spaceId,
                title: file.name,
              });
            }
            navigate(href);
          }}
          onOpenFolder={(folder) => {
            const href = spaceDataFolderInSpacePath(spaceKey, {
              fileSpaceKey: fileSpaceOwnerKey(owner),
              id: folder.id,
            });
            if (spaceId) {
              library.touchRecent({
                href,
                kind: folder.connectionId ? "mount" : "folder",
                space_id: spaceId,
                title: folder.name,
              });
            }
            navigate(href);
          }}
          owner={owner}
        />
      </div>
    </PaneChrome>
  );
}
