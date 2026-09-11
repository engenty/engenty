/**
 * Dateien section "+" — Folder, Upload, Connect — using the File Manager's
 * own dialogs rather than minting a nameless "New folder" into a unique index.
 */
import { spaceDriveRootOwner } from "@engenty/file-storage";
import { ConnectFolderDialog } from "@engenty/files-ui/ui/components/connect-folder-dialog";
import {
  FileSpaceFolderDialog,
  FileSpaceUploadInput,
  useFileSpaceActions,
} from "@engenty/files-ui/ui/components/file-space-actions";
import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import { FolderPlus, Link2, Upload } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import type { SpaceSectionAddItem } from "@/components/spaces/space-section-heading";
import { spaceDriveKeys } from "@/lib/space-drive-queries";

export function useSpaceFilesAdd(spaceId: string | null): {
  dialogs: ReactNode;
  isBusy: boolean;
  items: SpaceSectionAddItem[];
} {
  const { t } = useTranslation("files");
  const client = useQueryClient();
  const owner = useMemo(
    () =>
      spaceId
        ? spaceDriveRootOwner(spaceId)
        : { id: "", type: "space" as const },
    [spaceId]
  );
  const invalidateData = useCallback(() => {
    if (!spaceId) {
      return;
    }
    void client.invalidateQueries({
      queryKey: spaceDriveKeys.dataRoots(spaceId),
    });
    void client.invalidateQueries({
      queryKey: [...spaceDriveKeys.dataChildren(spaceId, "")].slice(0, -1),
    });
  }, [client, spaceId]);
  const actions = useFileSpaceActions(owner, null, !spaceId, invalidateData);
  const [connectOpen, setConnectOpen] = useState(false);

  if (!spaceId) {
    return { dialogs: null, isBusy: false, items: [] };
  }

  const items: SpaceSectionAddItem[] = [
    {
      icon: <FolderPlus className="size-4" />,
      id: "folder",
      label: t("fileManager.newFolder"),
      onSelect: () => {
        actions.setNewFolderName("");
        actions.setNewFolderOpen(true);
      },
    },
    {
      icon: <Upload className="size-4" />,
      id: "upload",
      label: t("fileManager.upload"),
      onSelect: () => actions.fileInputRef.current?.click(),
    },
    {
      icon: <Link2 className="size-4" />,
      id: "connect",
      label: t("fileManager.sources.connectFolder"),
      onSelect: () => setConnectOpen(true),
    },
  ];

  return {
    dialogs: (
      <>
        <FileSpaceUploadInput actions={actions} />
        <FileSpaceFolderDialog actions={actions} />
        <ConnectFolderDialog
          currentFolderId={null}
          onMounted={invalidateData}
          onOpenChange={setConnectOpen}
          open={connectOpen}
          owner={owner}
        />
      </>
    ),
    isBusy: actions.uploading || actions.createFolderMutation.isPending,
    items,
  };
}
