/**
 * Multi-select actions on a Data folder list: archive artifacts, delete
 * module-tree nodes, move artifacts into a folder.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { getSpaceArtifacts } from "@/lib/api/space-drive-client";
import { useSpaceDataActions } from "@/lib/space-data-actions";
import { spaceDriveKeys } from "@/lib/space-drive-queries";
import {
  type FolderChildRow,
  partitionFolderBulkTargets,
} from "./folder-list-model";
import { reportSpaceDataOutcome } from "./node-actions";

export function useFolderListBulk({
  onCleared,
  rows,
  selectedIds,
  spaceId,
}: {
  onCleared: () => void;
  rows: FolderChildRow[];
  selectedIds: ReadonlySet<string>;
  spaceId: string | null;
}): {
  canDelete: boolean;
  canMove: boolean;
  dialogs: ReactNode;
  openDelete: () => void;
  openMove: () => void;
  pending: boolean;
} {
  const { t } = useTranslation("common");
  const actions = useSpaceDataActions(spaceId);
  const targets = useMemo(
    () => partitionFolderBulkTargets(rows, selectedIds),
    [rows, selectedIds]
  );
  const selectedCount = targets.artifactIds.length + targets.dataNodes.length;
  const canDelete = selectedCount > 0;
  const canMove =
    targets.artifactIds.length > 0 && targets.dataNodes.length === 0;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveParentId, setMoveParentId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const foldersQuery = useQuery({
    enabled: Boolean(spaceId) && moveOpen,
    queryFn: ({ signal }) => getSpaceArtifacts(spaceId ?? "", signal),
    queryKey: spaceDriveKeys.artifacts(spaceId ?? ""),
  });
  const selectedArtifactIds = useMemo(
    () => new Set(targets.artifactIds),
    [targets.artifactIds]
  );
  const folders = (foldersQuery.data ?? []).filter(
    (row) => row.type === "folder" && !selectedArtifactIds.has(row.id)
  );

  const applyDelete = useCallback(async () => {
    if (!canDelete) {
      return;
    }
    setPending(true);
    let deleted = 0;
    let lastError: unknown;
    try {
      for (const id of targets.artifactIds) {
        try {
          await actions.removeArtifact({ id });
          deleted += 1;
        } catch (error) {
          lastError = error;
        }
      }
      const dataNodes = [...targets.dataNodes].sort(
        (left, right) =>
          right.path.split("/").length - left.path.split("/").length
      );
      for (const node of dataNodes) {
        try {
          await actions.removeNode(node);
          deleted += 1;
        } catch (error) {
          lastError = error;
        }
      }
      if (deleted > 0) {
        toast.success(
          deleted === selectedCount
            ? t("spaces.data.list.deletedSelected", {
                count: deleted,
                defaultValue: "Deleted {{count}}",
              })
            : t("spaces.data.list.deleteSelectedPartial", {
                count: selectedCount,
                defaultValue: "Deleted {{deleted}} of {{count}}",
                deleted,
              })
        );
        onCleared();
        setDeleteOpen(false);
      }
      if (lastError) {
        reportSpaceDataOutcome(lastError, t);
      }
    } finally {
      setPending(false);
    }
  }, [actions, canDelete, onCleared, selectedCount, t, targets]);

  const applyMove = useCallback(async () => {
    if (!canMove) {
      return;
    }
    setPending(true);
    let moved = 0;
    let lastError: unknown;
    try {
      for (const id of targets.artifactIds) {
        try {
          await actions.moveArtifact({ id, parentId: moveParentId });
          moved += 1;
        } catch (error) {
          lastError = error;
        }
      }
      if (moved > 0) {
        toast.success(
          moved === targets.artifactIds.length
            ? t("spaces.data.list.movedSelected", {
                count: moved,
                defaultValue: "Moved {{count}}",
              })
            : t("spaces.data.list.moveSelectedPartial", {
                count: targets.artifactIds.length,
                defaultValue: "Moved {{moved}} of {{count}}",
                moved,
              })
        );
        onCleared();
        setMoveOpen(false);
      }
      if (lastError) {
        toast.error(
          t("spaces.data.list.moveSelectedFailed", {
            defaultValue: "Could not move",
          })
        );
      }
    } finally {
      setPending(false);
    }
  }, [actions, canMove, moveParentId, onCleared, t, targets.artifactIds]);

  const dialogs = (
    <>
      <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("spaces.data.list.deleteSelectedTitle", {
                count: selectedCount,
                defaultValue: "Delete {{count}} items?",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("spaces.data.list.deleteSelectedDescription", {
                defaultValue:
                  "Selected artifacts are archived and leave Artifacts. Other items are removed from this folder. This cannot be undone from here.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("actions.cancel", { defaultValue: "Cancel" })}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={pending}
              onClick={() => void applyDelete()}
            >
              {t("spaces.data.list.deleteSelectedConfirm", {
                defaultValue: "Delete",
              })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog onOpenChange={setMoveOpen} open={moveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("spaces.data.list.moveSelectedTitle", {
                count: targets.artifactIds.length,
                defaultValue: "Move {{count}} items",
              })}
            </DialogTitle>
            <DialogDescription>
              {t("spaces.data.list.moveSelectedDescription", {
                defaultValue: "Choose a folder, or the Artifacts root.",
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            <Button
              className="w-full justify-start"
              onClick={() => setMoveParentId(null)}
              type="button"
              variant={moveParentId == null ? "secondary" : "ghost"}
            >
              {t("spaces.data.artifact.root", { defaultValue: "Artifacts" })}
            </Button>
            {folders.map((folder) => (
              <Button
                className="w-full justify-start"
                key={folder.id}
                onClick={() => setMoveParentId(folder.id)}
                type="button"
                variant={moveParentId === folder.id ? "secondary" : "ghost"}
              >
                {folder.title}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={() => setMoveOpen(false)}
              type="button"
              variant="ghost"
            >
              {t("actions.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              disabled={pending}
              onClick={() => void applyMove()}
              type="button"
            >
              {t("spaces.data.list.moveHere", { defaultValue: "Move" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return {
    canDelete,
    canMove,
    dialogs,
    openDelete: () => setDeleteOpen(true),
    openMove: () => {
      setMoveParentId(null);
      setMoveOpen(true);
    },
    pending: pending || actions.isBusy,
  };
}
