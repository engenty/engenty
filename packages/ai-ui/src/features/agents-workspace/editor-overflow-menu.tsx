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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { MoreVertical, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";

export interface EditorOverflowDeleteAction {
  cancelLabel: string;
  confirmDescription: string;
  confirmTitle: string;
  isDeleting?: boolean;
  label: string;
  onDelete: () => void;
}

interface EditorOverflowMenuProps {
  deleteAction?: EditorOverflowDeleteAction;
  isBusy: boolean;
  moreActionsLabel: string;
  onReset: () => void;
  resetDisabled: boolean;
  t: (key: string) => string;
}

export function EditorOverflowMenu({
  deleteAction,
  isBusy,
  moreActionsLabel,
  onReset,
  resetDisabled,
  t,
}: EditorOverflowMenuProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const isDeleting = Boolean(deleteAction?.isDeleting);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={moreActionsLabel}
            className="size-7"
            size="icon"
            type="button"
            variant="ghost"
          >
            <MoreVertical aria-hidden className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={resetDisabled} onSelect={onReset}>
            <RotateCcw aria-hidden className="mr-2 size-4" />
            {t("actions.reset")}
          </DropdownMenuItem>
          {deleteAction ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                disabled={isBusy || isDeleting}
                onSelect={() => setDeleteOpen(true)}
              >
                <Trash2 aria-hidden className="mr-2 size-4" />
                {deleteAction.label}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {deleteAction ? (
        <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{deleteAction.confirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteAction.confirmDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>
                {deleteAction.cancelLabel}
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isDeleting}
                onClick={(event) => {
                  event.preventDefault();
                  setDeleteOpen(false);
                  deleteAction.onDelete();
                }}
              >
                {deleteAction.label}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}
