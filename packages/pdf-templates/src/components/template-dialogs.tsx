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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@engenty/ui-core";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

interface TemplateNameDialogProps {
  confirmLabel: string;
  defaultValue: string;
  deleteConfirmDescription?: string;
  deleteConfirmTitle?: string;
  deleteLabel?: string;
  onConfirm: (value: string) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}

function TemplateNameDialog({
  confirmLabel,
  defaultValue,
  deleteConfirmDescription,
  deleteConfirmTitle,
  deleteLabel,
  onConfirm,
  onDelete,
  onOpenChange,
  open,
  title,
}: TemplateNameDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
    }
  }, [defaultValue, open]);

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="template-name">Name</Label>
            <Input
              id="template-name"
              onChange={(event) => setValue(event.target.value)}
              value={value}
            />
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            <div>
              {onDelete ? (
                <Button
                  onClick={() => setDeleteConfirmOpen(true)}
                  size="sm"
                  variant="destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleteLabel ?? "Delete"}
                </Button>
              ) : null}
            </div>
            <Button onClick={() => void onConfirm(value.trim())} size="sm">
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog onOpenChange={setDeleteConfirmOpen} open={deleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteConfirmTitle ?? "Delete template?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirmDescription ??
                "This template will be removed. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                await onDelete?.();
                setDeleteConfirmOpen(false);
                onOpenChange(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function CreateTemplateDialog(
  props: Omit<
    TemplateNameDialogProps,
    | "confirmLabel"
    | "title"
    | "deleteConfirmDescription"
    | "deleteConfirmTitle"
    | "deleteLabel"
    | "onDelete"
  >
) {
  return (
    <TemplateNameDialog
      {...props}
      confirmLabel="Create"
      title="Create template"
    />
  );
}

export function RenameTemplateDialog(
  props: Omit<TemplateNameDialogProps, "confirmLabel" | "title">
) {
  return (
    <TemplateNameDialog
      {...props}
      confirmLabel="Save"
      title="Rename template"
    />
  );
}
