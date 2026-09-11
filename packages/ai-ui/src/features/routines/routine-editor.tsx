// The routine form plus its submit — without deciding where it is shown.
//
// Extracted from RoutineCreateDialog so editing can happen IN PLACE on the
// agent's Plan tab. A modal was the wrong shape there: you open a routine to
// read its setup, and changing a line of it should not cover the thing you
// were reading. Creating one still gets a dialog — that starts from a menu
// with no page to edit in place on.
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { useEffect, useState } from "react";
import { RoutineForm } from "./routine-form.js";
import {
  defaultRoutineFormValue,
  primaryTrigger,
  type RoutineFormValue,
  routineFormToPayload,
  routineFormToRoutinePatch,
  routineToFormValue,
  triggerFormToInput,
  validateRoutineForm,
} from "./routine-form-value.js";
import type { RoutineDto } from "./routines-api.js";
import {
  useCreateCustomRoutineMutation,
  useCreateRoutineTriggerMutation,
  useUpdateCustomRoutineMutation,
  useUpdateRoutineTriggerMutation,
} from "./routines-queries.js";

export interface RoutineEditorProps {
  /** Fixes the Action (the Action's card owns it) and hides the flow picker. */
  defaultActionId?: string | null;
  /** Fixes the agent (the agent page owns it) and hides the agent picker. */
  defaultAgentId?: string | null;
  locale?: string;
  onCancel: () => void;
  /** Open the Action's canvas where the host wants it (in place, in a Space). */
  onOpenAction?: (workflowId: string) => void;
  /** Called after a successful write, with the routine's id when known. */
  onSaved: (routineId: string | null) => void;
  /** Absent = create. */
  routineToEdit?: RoutineDto | null;
}

export function RoutineEditor({
  defaultActionId,
  defaultAgentId,
  locale = "en",
  onCancel,
  onOpenAction,
  onSaved,
  routineToEdit,
}: RoutineEditorProps) {
  const { t } = useTranslation("ai-ui");
  const { t: tCommon } = useTranslation("common");

  const createMutation = useCreateCustomRoutineMutation();
  const updateMutation = useUpdateCustomRoutineMutation();
  const createTriggerMutation = useCreateRoutineTriggerMutation();
  const updateTriggerMutation = useUpdateRoutineTriggerMutation();

  const [value, setValue] = useState<RoutineFormValue>(() =>
    routineToEdit
      ? routineToFormValue(routineToEdit)
      : defaultRoutineFormValue(defaultAgentId, defaultActionId)
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Re-seed when the subject changes — the same editor is reused for the next
  // routine you open, and stale field values would silently save onto it.
  useEffect(() => {
    setValue(
      routineToEdit
        ? routineToFormValue(routineToEdit)
        : defaultRoutineFormValue(defaultAgentId, defaultActionId)
    );
    setErrorMsg(null);
  }, [routineToEdit, defaultAgentId, defaultActionId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg(null);
    const candidate = {
      ...value,
      ...(defaultActionId ? { workflowId: defaultActionId } : {}),
      ...(defaultAgentId ? { agentId: defaultAgentId } : {}),
    };
    const errorKey = validateRoutineForm(candidate);
    if (errorKey) {
      setErrorMsg(t(`routines.form.errors.${errorKey}`));
      return;
    }
    try {
      if (routineToEdit) {
        // Two halves, two writes: the behaviour PATCH on the routine, the wake
        // fields on its primary trigger (created when the routine gains its
        // first self-waking one).
        await updateMutation.mutateAsync({
          body: routineFormToRoutinePatch(candidate),
          id: routineToEdit.id,
        });
        const primary = primaryTrigger(routineToEdit);
        const triggerBody = triggerFormToInput(candidate);
        if (primary) {
          await updateTriggerMutation.mutateAsync({
            body: triggerBody,
            routineId: routineToEdit.id,
            triggerId: primary.id,
          });
        } else {
          await createTriggerMutation.mutateAsync({
            body: triggerBody,
            routineId: routineToEdit.id,
          });
        }
        onSaved(routineToEdit.id);
        return;
      }
      const created = await createMutation.mutateAsync(
        routineFormToPayload(candidate)
      );
      onSaved(created?.routine?.id ?? null);
    } catch (err) {
      setErrorMsg(
        err instanceof Error && err.message
          ? err.message
          : t("routines.form.errors.actionFailed")
      );
    }
  };

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    createTriggerMutation.isPending ||
    updateTriggerMutation.isPending;

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <RoutineForm
        locale={locale}
        onChange={setValue}
        onOpenAction={onOpenAction}
        showActionPicker={!defaultActionId}
        showAgentPicker={!defaultAgentId}
        value={value}
      />
      {errorMsg ? (
        <p className="text-destructive text-sm" role="alert">
          {errorMsg}
        </p>
      ) : null}
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          disabled={isPending}
          onClick={onCancel}
          type="button"
          variant="outline"
        >
          {tCommon("actions.cancel")}
        </Button>
        <Button disabled={isPending} type="submit">
          {routineToEdit ? tCommon("actions.save") : tCommon("actions.create")}
        </Button>
      </div>
    </form>
  );
}
