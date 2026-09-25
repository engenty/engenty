// Confirm before a routine is deleted — from its page and from the pane's menu.
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@engenty/ui-core";
import { useDeleteCustomRoutineMutation } from "./routines-queries.js";

export function RoutineDeleteDialog({
  locale = "en",
  onDeleted,
  onOpenChange,
  routineId,
}: {
  locale?: string;
  onDeleted: () => void;
  onOpenChange: (open: boolean) => void;
  /** The routine to delete; null keeps the dialog closed. */
  routineId: string | null;
}) {
  const isDe = locale.startsWith("de");
  const deleteMutation = useDeleteCustomRoutineMutation();

  return (
    <AlertDialog onOpenChange={onOpenChange} open={routineId !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isDe ? "Routine löschen?" : "Delete routine?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isDe
              ? "Die Routine wacht dann nicht mehr auf. Ihre bisherigen Läufe bleiben erhalten."
              : "It will stop waking up. Its past runs stay."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>
            {isDe ? "Abbrechen" : "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteMutation.isPending}
            onClick={async (event) => {
              event.preventDefault();
              if (!routineId) {
                return;
              }
              await deleteMutation.mutateAsync(routineId);
              onOpenChange(false);
              onDeleted();
            }}
          >
            {isDe ? "Löschen" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
