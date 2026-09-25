// The routine's destinations, in one place — parallel to the triggers dialog.
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { ChevronDown, Flag, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { OutcomeFields } from "./routine-outcome-fields.js";
import {
  defaultOutcomeFormValue,
  type OutcomeFormValue,
  outcomeFormToInput,
  outcomeToFormValue,
  validateOutcomeForm,
} from "./routine-outcome-form-value.js";
import { outcomeDisplay } from "./routine-shape.js";
import type { RoutineDto, RoutineOutcomeDto } from "./routines-api.js";
import {
  useCreateRoutineOutcomeMutation,
  useDeleteRoutineOutcomeMutation,
  useOutcomeProvidersQuery,
  useUpdateRoutineOutcomeMutation,
} from "./routines-queries.js";

type ExpandedTarget = string | "create" | null;

export interface RoutineOutcomesDialogProps {
  locale?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  routine: RoutineDto;
}

export function RoutineOutcomesDialog({
  locale = "en",
  onOpenChange,
  open,
  routine,
}: RoutineOutcomesDialogProps) {
  const { t } = useTranslation("ai-ui");
  const [expandedId, setExpandedId] = useState<ExpandedTarget>(null);
  const [draft, setDraft] = useState<OutcomeFormValue>(() =>
    defaultOutcomeFormValue()
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const providersQuery = useOutcomeProvidersQuery(open);
  const createMutation = useCreateRoutineOutcomeMutation();
  const updateMutation = useUpdateRoutineOutcomeMutation();
  const deleteMutation = useDeleteRoutineOutcomeMutation();

  const providers = providersQuery.data?.providers ?? [];
  const providerById = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers]
  );

  useEffect(() => {
    if (open) {
      setExpandedId(null);
      setErrorMsg(null);
    }
  }, [open]);

  const outcomes = routine.outcomes ?? [];

  const toggleRow = (row: RoutineOutcomeDto) => {
    setErrorMsg(null);
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setDraft(outcomeToFormValue(row));
    setExpandedId(row.id);
  };
  const toggleCreate = () => {
    setErrorMsg(null);
    if (expandedId === "create") {
      setExpandedId(null);
      return;
    }
    setDraft(defaultOutcomeFormValue(providers[0]?.id ?? ""));
    setExpandedId("create");
  };

  const handleSave = async () => {
    const provider = providerById.get(draft.providerId) ?? null;
    const errorKey = validateOutcomeForm(draft, provider);
    if (errorKey) {
      setErrorMsg(t(`routines.outcomes.errors.${errorKey}`));
      return;
    }
    try {
      if (expandedId === "create") {
        await createMutation.mutateAsync({
          body: outcomeFormToInput(draft),
          routineId: routine.id,
        });
      } else if (expandedId) {
        await updateMutation.mutateAsync({
          body: outcomeFormToInput(draft),
          outcomeId: expandedId,
          routineId: routine.id,
        });
      }
      setExpandedId(null);
    } catch (err) {
      setErrorMsg(
        err instanceof Error && err.message
          ? err.message
          : t("routines.form.errors.actionFailed")
      );
    }
  };

  const handleDelete = async (row: RoutineOutcomeDto) => {
    setErrorMsg(null);
    try {
      await deleteMutation.mutateAsync({
        outcomeId: row.id,
        routineId: routine.id,
      });
      if (expandedId === row.id) {
        setExpandedId(null);
      }
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
    deleteMutation.isPending;

  const editorFooter = (
    <div className="flex justify-end gap-2 pt-1">
      <Button
        disabled={isPending}
        onClick={() => setExpandedId(null)}
        size="sm"
        type="button"
        variant="outline"
      >
        {t("routines.outcomes.cancel")}
      </Button>
      <Button
        disabled={isPending}
        onClick={() => void handleSave()}
        size="sm"
        type="button"
      >
        {expandedId === "create"
          ? t("routines.outcomes.add")
          : t("routines.outcomes.save")}
      </Button>
    </div>
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("routines.outcomes.title")}
            <span className="truncate font-normal text-muted-foreground">
              · {routine.name}
            </span>
          </DialogTitle>
          <DialogDescription>
            {t("routines.outcomes.description")}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1.5">
          {outcomes.map((row) => {
            const display = outcomeDisplay(
              row,
              locale,
              providerById.get(row.provider_id)?.label
            );
            const isExpanded = expandedId === row.id;
            return (
              <li
                className="rounded-md border border-border-soft bg-muted/20"
                key={row.id}
              >
                <div className="flex items-center gap-1.5 pr-1.5">
                  <button
                    aria-expanded={isExpanded}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
                    onClick={() => toggleRow(row)}
                    type="button"
                  >
                    <Flag className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className="font-medium">{display.label}</span>
                      <span className="text-muted-foreground">
                        {" · "}
                        {display.modeLabel}
                      </span>
                    </span>
                    <Badge variant={row.enabled ? "default" : "outline"}>
                      {row.enabled
                        ? t("routines.outcomes.active")
                        : t("routines.outcomes.paused")}
                    </Badge>
                    <ChevronDown
                      className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  <Button
                    aria-label={t("routines.outcomes.remove")}
                    className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={isPending}
                    onClick={() => void handleDelete(row)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                {isExpanded ? (
                  <div className="space-y-3 border-border-soft border-t px-2.5 py-3">
                    <OutcomeFields
                      idPrefix={`outcome-${row.id}`}
                      onChange={setDraft}
                      providers={providers}
                      value={draft}
                    />
                    {errorMsg ? (
                      <p className="text-destructive text-sm" role="alert">
                        {errorMsg}
                      </p>
                    ) : null}
                    {editorFooter}
                  </div>
                ) : null}
              </li>
            );
          })}

          <li className="rounded-md border border-border-soft border-dashed">
            <button
              aria-expanded={expandedId === "create"}
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm"
              onClick={toggleCreate}
              type="button"
            >
              <Plus className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1">{t("routines.outcomes.addRow")}</span>
              <ChevronDown
                className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                  expandedId === "create" ? "rotate-180" : ""
                }`}
              />
            </button>
            {expandedId === "create" ? (
              <div className="space-y-3 border-border-soft border-t px-2.5 py-3">
                <OutcomeFields
                  idPrefix="outcome-create"
                  onChange={setDraft}
                  providers={providers}
                  value={draft}
                />
                {errorMsg ? (
                  <p className="text-destructive text-sm" role="alert">
                    {errorMsg}
                  </p>
                ) : null}
                {editorFooter}
              </div>
            ) : null}
          </li>
        </ul>
        {errorMsg && !expandedId ? (
          <p className="text-destructive text-sm" role="alert">
            {errorMsg}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
