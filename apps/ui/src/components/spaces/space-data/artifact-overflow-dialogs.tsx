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
  Input,
} from "@engenty/ui-core";

export interface ArtifactOverflowDialogLabels {
  cancel: string;
  current: string;
  deleteConfirm: string;
  deleteDescription: string;
  deleteTitle: string;
  history: string;
  historyEmpty: string;
  moveDescription: string;
  moveHere: string;
  moveTitle: string;
  rename: string;
  root: string;
}

export function ArtifactOverflowDialogs({
  currentVersion,
  deleteOpen,
  folders,
  historyOpen,
  historyRows,
  labels,
  moveOpen,
  moveParentId,
  onApplyDelete,
  onApplyMove,
  onApplyRename,
  onDeleteOpenChange,
  onHistoryOpenChange,
  onMoveOpenChange,
  onMoveParentIdChange,
  onRenameNameChange,
  onRenameOpenChange,
  pending,
  renameName,
  renameOpen,
}: {
  currentVersion: number;
  deleteOpen: boolean;
  folders: Array<{ id: string; title: string }>;
  historyOpen: boolean;
  historyRows: Array<{
    created_at: string;
    summary: string | null;
    version: number;
  }>;
  labels: ArtifactOverflowDialogLabels;
  moveOpen: boolean;
  moveParentId: string | null;
  onApplyDelete: () => void;
  onApplyMove: () => void;
  onApplyRename: () => void;
  onDeleteOpenChange: (open: boolean) => void;
  onHistoryOpenChange: (open: boolean) => void;
  onMoveOpenChange: (open: boolean) => void;
  onMoveParentIdChange: (id: string | null) => void;
  onRenameNameChange: (name: string) => void;
  onRenameOpenChange: (open: boolean) => void;
  pending: boolean;
  renameName: string;
  renameOpen: boolean;
}) {
  return (
    <>
      <Dialog onOpenChange={onMoveOpenChange} open={moveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.moveTitle}</DialogTitle>
            <DialogDescription>{labels.moveDescription}</DialogDescription>
          </DialogHeader>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            <Button
              className="w-full justify-start"
              onClick={() => onMoveParentIdChange(null)}
              type="button"
              variant={moveParentId == null ? "secondary" : "ghost"}
            >
              {labels.root}
            </Button>
            {folders.map((folder) => (
              <Button
                className="w-full justify-start"
                key={folder.id}
                onClick={() => onMoveParentIdChange(folder.id)}
                type="button"
                variant={moveParentId === folder.id ? "secondary" : "ghost"}
              >
                {folder.title}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={() => onMoveOpenChange(false)}
              type="button"
              variant="ghost"
            >
              {labels.cancel}
            </Button>
            <Button disabled={pending} onClick={onApplyMove} type="button">
              {labels.moveHere}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog onOpenChange={onHistoryOpenChange} open={historyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.history}</DialogTitle>
          </DialogHeader>
          <div className="max-h-72 space-y-2 overflow-y-auto text-sm">
            {historyRows.length === 0 ? (
              <p className="text-muted-foreground">{labels.historyEmpty}</p>
            ) : (
              historyRows.map((row) => (
                <div
                  className="flex items-baseline justify-between gap-3 border-b py-1.5 last:border-0"
                  key={row.version}
                >
                  <span>
                    v{row.version}
                    {row.version === currentVersion ? (
                      <span className="ml-2 text-muted-foreground text-xs">
                        {labels.current}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {row.summary ?? row.created_at}
                  </span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog onOpenChange={onRenameOpenChange} open={renameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.rename}</DialogTitle>
          </DialogHeader>
          <Input
            onChange={(event) => onRenameNameChange(event.target.value)}
            value={renameName}
          />
          <DialogFooter>
            <Button
              onClick={() => onRenameOpenChange(false)}
              type="button"
              variant="ghost"
            >
              {labels.cancel}
            </Button>
            <Button
              disabled={pending || !renameName.trim()}
              onClick={onApplyRename}
              type="button"
            >
              {labels.rename}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog onOpenChange={onDeleteOpenChange} open={deleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {labels.deleteDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{labels.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={pending}
              onClick={onApplyDelete}
            >
              {labels.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
