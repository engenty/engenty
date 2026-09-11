// The routine's wake sources, in one place.
//
// Every trigger row of ONE routine — schedule, event, webhook, manual press,
// agent invoke — listable, editable, pausable, plus adding a new one, without
// leaving the card the routine lives on. Editing EXPANDS the row in place
// (accordion); the list never disappears behind a second view. The routine
// itself (name, outcome, report) is edited elsewhere; this dialog is only
// about when and by whom it wakes.
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
  Textarea,
} from "@engenty/ui-core";
import {
  Bot,
  CalendarClock,
  ChevronDown,
  MousePointerClick,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  defaultTriggerFormValue,
  type RoutineTriggerType,
  type TriggerFormValue,
  triggerFormToInput,
  triggerToFormValue,
  validateTriggerForm,
} from "./routine-form-value.js";
import { triggerDisplay } from "./routine-shape.js";
import type { RoutineDto, RoutineTriggerDto } from "./routines-api.js";
import {
  useCreateRoutineTriggerMutation,
  useDeleteRoutineTriggerMutation,
  useUpdateRoutineTriggerMutation,
} from "./routines-queries.js";
import { SchedulePresetPicker } from "./schedule-preset-picker.js";

const TRIGGER_TYPES: RoutineTriggerType[] = [
  "schedule",
  "module-events",
  "webhook",
  "manual",
  "agent",
];

const KIND_ICON = {
  agent: Bot,
  event: Zap,
  manual: MousePointerClick,
  schedule: CalendarClock,
} as const;

export interface RoutineTriggersDialogProps {
  locale?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  routine: RoutineDto;
}

/** One trigger's fields — the trigger half of the routine form, standalone. */
function TriggerFields({
  idPrefix,
  locale,
  onChange,
  value,
}: {
  idPrefix: string;
  locale: string;
  onChange: (next: TriggerFormValue) => void;
  value: TriggerFormValue;
}) {
  const { t } = useTranslation("ai-ui");
  const isDe = locale.startsWith("de");
  const set = (patch: Partial<TriggerFormValue>) =>
    onChange({ ...value, ...patch });
  const isEvent =
    value.triggerType === "module-events" || value.triggerType === "webhook";

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-kind`}>
          {t("routines.form.triggerType")}
        </Label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          id={`${idPrefix}-kind`}
          onChange={(e) =>
            set({ triggerType: e.target.value as RoutineTriggerType })
          }
          value={value.triggerType}
        >
          {TRIGGER_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`routines.form.triggerTypes.${type}`)}
            </option>
          ))}
        </select>
      </div>

      {value.triggerType === "schedule" && (
        <SchedulePresetPicker
          locale={locale}
          onChange={(next) => set({ schedule: next })}
          value={value.schedule}
        />
      )}

      {value.triggerType === "module-events" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-resource`}>
            {t("routines.form.eventResource")}
          </Label>
          <Input
            autoComplete="off"
            id={`${idPrefix}-resource`}
            onChange={(e) => set({ resource: e.target.value })}
            placeholder={t("routines.form.eventResourcePlaceholder")}
            required
            value={value.resource}
          />
        </div>
      )}

      {isEvent && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-filter`}>
              {t("routines.form.eventFilter")}
            </Label>
            <Textarea
              className="min-h-[64px] font-mono text-xs"
              id={`${idPrefix}-filter`}
              onChange={(e) => set({ eventFilter: e.target.value })}
              placeholder={t("routines.form.eventFilterPlaceholder")}
              value={value.eventFilter}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-mapping`}>
              {t("routines.form.inputMapping")}
            </Label>
            <Textarea
              className="min-h-[64px] font-mono text-xs"
              id={`${idPrefix}-mapping`}
              onChange={(e) => set({ inputMapping: e.target.value })}
              placeholder={t("routines.form.inputMappingPlaceholder")}
              value={value.inputMapping}
            />
            <p className="text-muted-foreground text-xs">
              {t("routines.form.inputMappingHint")}
            </p>
          </div>
        </>
      )}

      {value.triggerType === "webhook" && (
        <p className="text-muted-foreground text-xs">
          {t("routines.form.webhookHint")}
        </p>
      )}

      {value.triggerType === "manual" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-shortcode`}>
            {t("routines.form.shortcode")}
          </Label>
          <Input
            autoComplete="off"
            id={`${idPrefix}-shortcode`}
            onChange={(e) => set({ shortcode: e.target.value })}
            value={value.shortcode}
          />
          <p className="text-muted-foreground text-xs">
            {t("routines.form.shortcodeHint")}
          </p>
        </div>
      )}

      {value.triggerType === "agent" && (
        <p className="text-muted-foreground text-xs">
          {t("routines.form.agentTriggerHint")}
        </p>
      )}

      <div className="flex items-center justify-between rounded-md border border-border-soft px-3 py-2">
        <span className="text-sm">{isDe ? "Aktiv" : "Enabled"}</span>
        <Switch
          checked={value.enabled}
          onCheckedChange={(checked) => set({ enabled: checked })}
        />
      </div>
    </div>
  );
}

/** "create" expands the add form; a trigger id expands that row's editor. */
type ExpandedTarget = string | "create" | null;

export function RoutineTriggersDialog({
  locale = "en",
  onOpenChange,
  open,
  routine,
}: RoutineTriggersDialogProps) {
  const { t } = useTranslation("ai-ui");
  const isDe = locale.startsWith("de");
  const [expandedId, setExpandedId] = useState<ExpandedTarget>(null);
  const [draft, setDraft] = useState<TriggerFormValue>(() =>
    defaultTriggerFormValue()
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const createMutation = useCreateRoutineTriggerMutation();
  const updateMutation = useUpdateRoutineTriggerMutation();
  const deleteMutation = useDeleteRoutineTriggerMutation();

  // Re-seed on every open so the last visit's expansion doesn't leak into the
  // next.
  useEffect(() => {
    if (open) {
      setExpandedId(null);
      setErrorMsg(null);
    }
  }, [open]);

  const triggers = routine.triggers ?? [];

  const toggleRow = (trigger: RoutineTriggerDto) => {
    setErrorMsg(null);
    if (expandedId === trigger.id) {
      setExpandedId(null);
      return;
    }
    setDraft(triggerToFormValue(trigger));
    setExpandedId(trigger.id);
  };
  const toggleCreate = () => {
    setErrorMsg(null);
    if (expandedId === "create") {
      setExpandedId(null);
      return;
    }
    setDraft(defaultTriggerFormValue());
    setExpandedId("create");
  };

  const handleSave = async () => {
    const errorKey = validateTriggerForm(draft);
    if (errorKey) {
      setErrorMsg(t(`routines.form.errors.${errorKey}`));
      return;
    }
    try {
      if (expandedId === "create") {
        await createMutation.mutateAsync({
          body: triggerFormToInput(draft),
          routineId: routine.id,
        });
      } else if (expandedId) {
        await updateMutation.mutateAsync({
          body: triggerFormToInput(draft),
          routineId: routine.id,
          triggerId: expandedId,
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

  const handleDelete = async (trigger: RoutineTriggerDto) => {
    setErrorMsg(null);
    try {
      await deleteMutation.mutateAsync({
        routineId: routine.id,
        triggerId: trigger.id,
      });
      if (expandedId === trigger.id) {
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
        {isDe ? "Abbrechen" : "Cancel"}
      </Button>
      <Button
        disabled={isPending}
        onClick={() => void handleSave()}
        size="sm"
        type="button"
      >
        {expandedId === "create"
          ? isDe
            ? "Hinzufügen"
            : "Add"
          : isDe
            ? "Speichern"
            : "Save"}
      </Button>
    </div>
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isDe ? "Auslöser" : "Triggers"}
            <span className="truncate font-normal text-muted-foreground">
              · {routine.name}
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isDe
              ? "Wann und von wem diese Routine ausgelöst wird."
              : "When and by whom this routine is fired."}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1.5">
          {triggers.map((trigger) => {
            const display = triggerDisplay(trigger, locale);
            const Icon = KIND_ICON[trigger.kind];
            const isExpanded = expandedId === trigger.id;
            return (
              <li
                className="rounded-md border border-border-soft bg-muted/20"
                key={trigger.id}
              >
                <div className="flex items-center gap-1.5 pr-1.5">
                  <button
                    aria-expanded={isExpanded}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
                    onClick={() => toggleRow(trigger)}
                    type="button"
                  >
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className="font-medium">{display.label}</span>
                      {display.detail ? (
                        <span className="text-muted-foreground">
                          {" · "}
                          {display.detail}
                        </span>
                      ) : null}
                    </span>
                    <Badge variant={trigger.enabled ? "default" : "outline"}>
                      {trigger.enabled
                        ? isDe
                          ? "Aktiv"
                          : "Active"
                        : isDe
                          ? "Pausiert"
                          : "Paused"}
                    </Badge>
                    <ChevronDown
                      className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {/* Never the last one: a routine with no wake source at all
                      cannot ever run — pause it instead. */}
                  {triggers.length > 1 ? (
                    <Button
                      aria-label={
                        isDe ? "Auslöser entfernen" : "Remove this trigger"
                      }
                      className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                      disabled={isPending}
                      onClick={() => void handleDelete(trigger)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
                {isExpanded ? (
                  <div className="space-y-3 border-border-soft border-t px-2.5 py-3">
                    <TriggerFields
                      idPrefix={`trigger-${trigger.id}`}
                      locale={locale}
                      onChange={setDraft}
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

          {/* Add — the same accordion, one row further down. */}
          <li className="rounded-md border border-border-soft border-dashed">
            <button
              aria-expanded={expandedId === "create"}
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm"
              onClick={toggleCreate}
              type="button"
            >
              <Plus className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1">
                {isDe ? "Auslöser hinzufügen" : "Add a trigger"}
              </span>
              <ChevronDown
                className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                  expandedId === "create" ? "rotate-180" : ""
                }`}
              />
            </button>
            {expandedId === "create" ? (
              <div className="space-y-3 border-border-soft border-t px-2.5 py-3">
                <TriggerFields
                  idPrefix="trigger-create"
                  locale={locale}
                  onChange={setDraft}
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
