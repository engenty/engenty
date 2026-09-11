/**
 * The Data tree, wired into the space's sidebar.
 *
 * The tree is NAVIGATION, so it lives in the nav column — the same slot the
 * Work section fills with its module list — and the pane beside it shows
 * whatever is selected. Rendering it inside the page was the first cut and it
 * read as a second sidebar drawn in the content area: two columns of chrome,
 * one of them scrolling away with the document.
 *
 * Where a leaf opens is decided here rather than in the tree, because it is a
 * routing question:
 *
 *  - a record or a bundle opens in the pane beside the tree — it is the
 *    space's data, and the Data page is where the space's data is edited;
 *  - a file opens there too, as a preview of its bytes;
 *  - a FOLDER opens there as an overview of what is in it. A folder here is a
 *    virtual object — `People` is a query over contacts, `sent` is a state of
 *    the offer pipeline — so its module may render it; the pane lists it
 *    generically when none does;
 *  - an ARTIFACT stored to the space opens in the pane too. It is a published
 *    deliverable shown beside module records, not another module record;
 *  - a PROJECT opens in the module that owns it. Its editor already exists and
 *    is better than anything this pane would grow. (A knowledge article used to
 *    be in this sentence; since Phase K it is a record like any other, and it
 *    opens in the pane — rendered by the knowledge base's own viewer.)
 */
import { type DriveNode, spaceDriveRootOwner } from "@engenty/file-storage";
import { useTranslation } from "@engenty/i18n/ui";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { SpaceDriveTree } from "@/components/spaces/SpaceDriveTree";
import { ArtifactRowActions } from "@/components/spaces/space-data/artifact-row-actions";
import { useSpaceArtifactsAdd } from "@/components/spaces/space-data/artifacts-add";
import { useSpaceFilesAdd } from "@/components/spaces/space-data/files-add";
import {
  reportSpaceDataOutcome,
  SpaceDataNodeActions,
} from "@/components/spaces/space-data/node-actions";
import {
  NO_SPACE_DATA_CAPABILITIES,
  resolveSpaceDataReference,
} from "@/lib/api/space-data-client";
import { useSpaceDataActions } from "@/lib/space-data-actions";
import { useSpaceDataLibrary } from "@/lib/space-data-library-persistence";
import {
  isArtifactFolder,
  isArtifactTreeNode,
} from "@/lib/space-data-root-sections";
import { driveNodeHref, driveNodeLibraryItem } from "@/lib/space-drive-href";
import { useSpaceDrive } from "@/lib/space-drive-queries";
import {
  isSpaceDataArtifactsListing,
  spaceDataArtifactPath,
  spaceDataPath,
} from "@/lib/space-routes";
import { useSpaceModules } from "@/lib/use-space-modules";

export function SpaceDataTree({
  spaceId,
  spaceKey,
}: {
  spaceId: string | null;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { touchRecent } = useSpaceDataLibrary(spaceId);
  const { modules } = useSpaceModules(spaceId);
  const labelsByModuleId = useMemo(
    () => Object.fromEntries(modules.map((app) => [app.id, app.label])),
    [modules]
  );
  const drive = useSpaceDrive(
    spaceId,
    t("spaces.data.projectsFolder", { defaultValue: "Projects" })
  );

  const select = useCallback(
    async (node: DriveNode) => {
      const pin =
        spaceId && !node.isReference
          ? driveNodeLibraryItem(spaceId, spaceKey, node)
          : null;
      if (pin) {
        touchRecent(pin);
      }
      if (node.isReference && spaceId) {
        // A shortcut resolves to the record it points at, so the reader lands
        // on the contact rather than on the JSON that names it. A broken ref is
        // left selected-as-nothing rather than navigating somewhere wrong.
        const ref = await resolveSpaceDataReference({
          fileId: node.sourceId,
          owner: spaceDriveRootOwner(spaceId),
        }).catch(() => null);
        if (ref) {
          const href = spaceDataPath(spaceKey, ref.dataPath);
          touchRecent({
            href,
            kind: "record",
            space_id: spaceId,
            title: node.name,
          });
          navigate(href);
        }
        return;
      }
      const href = driveNodeHref(spaceKey, node);
      if (href) {
        navigate(href);
      }
    },
    [navigate, spaceId, spaceKey, touchRecent]
  );

  const actions = useSpaceDataActions(spaceId);
  const [draggingNode, setDraggingNode] = useState<DriveNode | null>(null);
  const artifactsAdd = useSpaceArtifactsAdd({ actions, spaceId, spaceKey });
  const filesAdd = useSpaceFilesAdd(spaceId);
  const addInTree = useCallback(
    async (input: { kind: "folder" | "page"; parentPath: string }) => {
      try {
        if (input.kind === "page") {
          const created = await actions.createPage({
            name: t("spaces.data.newPageName", { defaultValue: "New page" }),
          });
          toast.success(
            t("spaces.data.pageCreated", { defaultValue: "Page created" })
          );
          navigate(spaceDataArtifactPath(spaceKey, created.id));
          return;
        }
        await actions.createFolder({
          name: t("spaces.data.newFolderName", { defaultValue: "New folder" }),
          parentPath: input.parentPath,
        });
        toast.success(
          t("spaces.data.folderCreated", { defaultValue: "Folder created" })
        );
      } catch (error) {
        reportSpaceDataOutcome(error, t);
      }
    },
    [actions, navigate, spaceKey, t]
  );
  /**
   * A path's FIRST segment names its root, and a capability belongs to the
   * root's adapter — so this is the whole lookup. Unknown root ⇒ nothing is
   * possible, which is the safe direction and also the correct one for
   * Projects and artifacts, whose actions live on their own screens.
   */
  const capabilitiesFor = useCallback(
    (path: string) =>
      drive.capabilitiesByRoot[path.split("/")[0] ?? ""] ??
      NO_SPACE_DATA_CAPABILITIES,
    [drive.capabilitiesByRoot]
  );

  const canRename = useCallback(
    (node: DriveNode) => {
      if (isArtifactTreeNode(node)) {
        return true;
      }
      const path = node.dataPath;
      if (!path?.includes("/")) {
        return false;
      }
      return capabilitiesFor(path).canMove;
    },
    [capabilitiesFor]
  );

  const renameRow = useCallback(
    async (node: DriveNode, name: string) => {
      try {
        if (isArtifactTreeNode(node)) {
          await actions.renameArtifact({ id: node.sourceId, title: name });
        } else if (node.dataPath) {
          await actions.renameNode({ newName: name, path: node.dataPath });
        } else {
          return;
        }
        toast.success(t("spaces.data.renamed", { defaultValue: "Renamed" }));
      } catch (error) {
        reportSpaceDataOutcome(error, t);
      }
    },
    [actions, t]
  );

  const moveInto = useCallback(
    async (source: DriveNode, target: DriveNode) => {
      try {
        if (isArtifactTreeNode(source) && isArtifactFolder(target)) {
          await actions.moveArtifact({
            id: source.sourceId,
            parentId: target.sourceId,
          });
        } else if (source.dataPath && target.dataPath) {
          await actions.moveNode({
            path: source.dataPath,
            toParentPath: target.dataPath,
          });
        } else {
          return;
        }
        toast.success(t("spaces.data.moved", { defaultValue: "Moved" }));
      } catch (error) {
        reportSpaceDataOutcome(error, t);
      }
    },
    [actions, t]
  );

  const selectedPath = searchParams.get("path") ?? undefined;
  const selectedArtifactId = searchParams.get("artifact") ?? undefined;
  const selectedArtifactsRoot = isSpaceDataArtifactsListing(searchParams);
  const selectedFileId = searchParams.get("file") ?? undefined;
  const selectedFolderId = searchParams.get("folder") ?? undefined;

  return (
    <>
      <SpaceDriveTree
        artifactsAddItems={artifactsAdd.items}
        canRename={canRename}
        capabilitiesByRoot={drive.capabilitiesByRoot}
        draggingNode={draggingNode}
        filesAddItems={filesAdd.items}
        isAddBusy={actions.isBusy || filesAdd.isBusy || artifactsAdd.isBusy}
        isPending={drive.isPending}
        labelsByModuleId={labelsByModuleId}
        nodes={drive.nodes}
        onAdd={(input) => void addInTree(input)}
        onDragEnd={() => setDraggingNode(null)}
        onDragStart={setDraggingNode}
        onMoveInto={(source, target) => void moveInto(source, target)}
        onRename={(node, name) => void renameRow(node, name)}
        onSelect={select}
        renderRowActions={(node) =>
          isArtifactTreeNode(node) ? (
            <ArtifactRowActions
              node={node}
              spaceId={spaceId}
              spaceKey={spaceKey}
            />
          ) : (
            <SpaceDataNodeActions
              actions={actions}
              capabilitiesFor={capabilitiesFor}
              node={node}
              spaceId={spaceId}
            />
          )
        }
        spaceId={spaceId}
        spaceKey={spaceKey}
        unavailable={drive.unavailable}
        {...(selectedArtifactId ? { selectedArtifactId } : {})}
        {...(selectedArtifactsRoot ? { selectedArtifactsRoot: true } : {})}
        {...(selectedFileId ? { selectedFileId } : {})}
        {...(selectedFolderId ? { selectedFolderId } : {})}
        {...(selectedPath ? { selectedPath } : {})}
      />
      {filesAdd.dialogs}
    </>
  );
}
