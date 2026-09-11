/**
 * `/s/<key>/data` — the pane beside the space's Data tree (PLAN-space-data.md
 * D1/D3).
 *
 * The TREE is in the sidebar, where navigation lives; this page is what the
 * selection opens. A record is shown as its FILE: a contact is frontmatter plus
 * notes, an offer is its members, and the text is the same text an agent reads
 * through `/data`. That is the point of files-as-protocol — there is one
 * representation, not a human one and a machine one that can disagree.
 *
 * Editing writes through `PUT …/data/write` with the version the editor read,
 * so a conflicting concurrent edit comes back 409 and is SHOWN, never merged by
 * accident and never silently overwritten.
 */
import {
  parseFileSpaceOwnerKey,
  spaceFileSpaceOwner,
} from "@engenty/file-storage";
import { useCallback, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { SpaceDataDashboard } from "@/components/spaces/SpaceDataDashboard";
import { ArtifactDetail } from "@/components/spaces/space-data/artifact-detail";
import { ArtifactsRootDetail } from "@/components/spaces/space-data/artifacts-root-detail";
import { filesSpaceFileIdFromPath } from "@/components/spaces/space-data/connected-folder";
import { FileDetail } from "@/components/spaces/space-data/file-detail";
import {
  DataFolderDetail,
  FileFolderDetail,
} from "@/components/spaces/space-data/folder-detail";
import { NodeDetail } from "@/components/spaces/space-data/node-detail";
import { readSpaceDataReturn } from "@/lib/space-data-return";
import { isSpaceDataArtifactsListing, spaceDataPath } from "@/lib/space-routes";
import { useSpacesQuery } from "@/lib/spaces-queries";

export function SpaceDataPage() {
  const { spaceKey = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search]
  );
  const spacesQuery = useSpacesQuery();
  const space = useMemo(
    () => spacesQuery.data?.find((entry) => entry.key === spaceKey) ?? null,
    [spaceKey, spacesQuery.data]
  );
  const spaceId = space?.id ?? null;
  const selectedPath = searchParams.get("path") ?? undefined;
  const selectedIsFolder = searchParams.get("as") === "folder";
  const selectedFileId = searchParams.get("file") ?? undefined;
  const selectedFolderId = searchParams.get("folder") ?? undefined;
  const fileSpace = parseFileSpaceOwnerKey(searchParams.get("fs"));
  const fileFolderId = searchParams.get("in");
  const selectedArtifactId = searchParams.get("artifact") ?? undefined;
  const filesFileId =
    selectedPath && !selectedIsFolder
      ? filesSpaceFileIdFromPath(selectedPath)
      : null;

  // Closing goes back where the pane was opened FROM when the link said so —
  // a card on the home, the Work tab's list. Opened from the tree, there is no
  // such state and closing means what it always did: back to the Data root,
  // with the tree still beside it.
  const close = useCallback(() => {
    navigate(readSpaceDataReturn(location.state) ?? spaceDataPath(spaceKey));
  }, [location.state, navigate, spaceKey]);

  if (selectedPath && spaceId && filesFileId) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <FileDetail
          fileId={filesFileId}
          folderId={null}
          key={filesFileId}
          onClose={close}
          owner={spaceFileSpaceOwner(spaceId)}
        />
      </div>
    );
  }

  if (selectedPath && spaceId) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        {selectedIsFolder ? (
          <DataFolderDetail
            key={selectedPath}
            onClose={close}
            path={selectedPath}
            spaceId={spaceId}
          />
        ) : (
          <NodeDetail
            key={selectedPath}
            onClose={close}
            path={selectedPath}
            spaceId={spaceId}
          />
        )}
      </div>
    );
  }

  if (selectedFolderId && fileSpace) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <FileFolderDetail
          folderId={selectedFolderId}
          key={selectedFolderId}
          onClose={close}
          owner={fileSpace}
          spaceId={spaceId}
        />
      </div>
    );
  }

  if (selectedFileId && fileSpace) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <FileDetail
          fileId={selectedFileId}
          folderId={fileFolderId}
          key={selectedFileId}
          onClose={close}
          owner={fileSpace}
        />
      </div>
    );
  }

  if (selectedArtifactId) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <ArtifactDetail
          artifactId={selectedArtifactId}
          key={selectedArtifactId}
          onClose={close}
          spaceId={spaceId}
        />
      </div>
    );
  }

  if (isSpaceDataArtifactsListing(searchParams)) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <ArtifactsRootDetail
          onClose={close}
          spaceId={spaceId}
          spaceKey={spaceKey}
        />
      </div>
    );
  }

  return <SpaceDataDashboard spaceId={spaceId} spaceKey={spaceKey} />;
}
