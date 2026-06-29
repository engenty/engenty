// Create/edit dialog for custom routines — thin chrome around RoutineForm.
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { useEffect, useState } from "react";
import { RoutineForm } from "./routine-form.js";
import {
  defaultRoutineFormValue,
  type RoutineFormValue,
  routineFormToPayload,
  routineToFormValue,
  validateRoutineForm,
} from "./routine-form-value.js";
import type { RoutineDto } from "./routines-api.js";
import {
  useCreateCustomRoutineMutation,
  useUpdateCustomRoutineMutation,
} from "./routines-queries.js";

export interface RoutineCreateDialogProps {
  defaultAgentId?: string | null;
  locale?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  routineToEdit?: RoutineDto | null;
}

export function RoutineCreateDialog({
  open,
  onOpenChange,
  routineToEdit,
  defaultAgentId,
  locale = "en",
}: RoutineCreateDialogProps) {
  const { t } = useTranslation("ai-ui");
  const { t: tCommon } = useTranslation("common");

  const createMutation = useCreateCustomRoutineMutation();
  const updateMutation = useUpdateCustomRoutineMutation();

  const [value, setValue] = useState<RoutineFormValue>(() =>
    defaultRoutineFormValue(defaultAgentId)
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Re-seed the form whenever the dialog opens (create vs edit).
  useEffect(() => {
    if (open) {
      setValue(
        routineToEdit
          ? routineToFormValue(routineToEdit)
          : defaultRoutineFormValue(defaultAgentId)
      );
      setErrorMsg(null);
    }
  }, [open, routineToEdit, defaultAgentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const candidate = defaultAgentId
      ? { ...value, agentId: defaultAgentId }
      : value;
    const errorKey = validateRoutineForm(candidate);
    if (errorKey) {
      setErrorMsg(t(`routines.form.errors.${errorKey}`));
      return;
    }
    const payload = routineFormToPayload(candidate);
    try {
      if (routineToEdit) {
        await updateMutation.mutateAsync({
          id: routineToEdit.id,
          body: payload,
        });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch (err: any) {
      setErrorMsg(err?.message || t("routines.form.errors.actionFailed"));
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form className="space-y-5" onSubmit={handleSubmit}>
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

          <div className="space-y-4">
            <RoutineForm
              locale={locale}
              onChange={setValue}
              showAgentPicker={!defaultAgentId}
              value={value}
            />
            {errorMsg && (
              <p className="text-destructive text-sm" role="alert">
                {errorMsg}
              </p>
            )}
          </div>

          <DialogFooter className="border-t pt-4">
            <Button
              disabled={isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {tCommon("actions.cancel")}
            </Button>
            <Button disabled={isPending} type="submit">
              {routineToEdit
                ? tCommon("actions.save")
                : tCommon("actions.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
