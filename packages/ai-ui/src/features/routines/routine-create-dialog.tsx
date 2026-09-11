// Dialog chrome around RoutineEditor — for CREATING a routine, which starts
// from a menu and has no page of its own to sit in. Editing an existing one
// happens in place (see RoutineEditor); this component still accepts
// `routineToEdit` for the surfaces that have nowhere to put an inline form.
import { useTranslation } from "@engenty/i18n/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { RoutineEditor } from "./routine-editor.js";
import type { RoutineDto } from "./routines-api.js";

export interface RoutineCreateDialogProps {
  defaultAgentId?: string | null;
  locale?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  routineToEdit?: RoutineDto | null;
}

export function RoutineCreateDialog({
  defaultAgentId,
  locale = "en",
  onOpenChange,
  open,
  routineToEdit,
}: RoutineCreateDialogProps) {
  const { t } = useTranslation("ai-ui");

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {routineToEdit
              ? t("routines.dialog.editTitle")
              : t("routines.dialog.createTitle")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("routines.dialog.description")}
          </DialogDescription>
        </DialogHeader>
        {/* Keyed so reopening the dialog starts from a freshly seeded form
            rather than whatever the last open left behind. */}
        <RoutineEditor
          defaultAgentId={defaultAgentId}
          key={routineToEdit?.id ?? "create"}
          locale={locale}
          onCancel={() => onOpenChange(false)}
          onSaved={() => onOpenChange(false)}
          routineToEdit={routineToEdit}
        />
      </DialogContent>
    </Dialog>
  );
}
