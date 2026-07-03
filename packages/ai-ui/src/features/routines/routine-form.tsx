// Field body for custom routines (no dialog chrome) — consumed by
// RoutineCreateDialog and the tasks-module routine edit page.
import { useTranslation } from "@engenty/i18n/ui";
import { Input, Label, Textarea } from "@engenty/ui-core";
import { RoutineAgentSelect } from "./routine-agent-select.js";
import type {
  RoutineFormValue,
  RoutineTriggerType,
} from "./routine-form-value.js";
import { SchedulePresetPicker } from "./schedule-preset-picker.js";

const TRIGGER_TYPES: RoutineTriggerType[] = [
  "schedule",
  "module-events",
  "webhook",
];

export interface RoutineFormProps {
  idPrefix?: string;
  locale?: string;
  onChange: (next: RoutineFormValue) => void;
  // When true an agent <select> is rendered; otherwise agentId stays fixed.
  showAgentPicker: boolean;
  value: RoutineFormValue;
}

export function RoutineForm({
  value,
  onChange,
  showAgentPicker,
  locale = "en",
  idPrefix = "routine",
}: RoutineFormProps) {
  const { t } = useTranslation("ai-ui");

  const set = (patch: Partial<RoutineFormValue>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-name`}>{t("routines.form.name")}</Label>
        <Input
          autoComplete="off"
          id={`${idPrefix}-name`}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={t("routines.form.namePlaceholder")}
          required
          value={value.name}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-desc`}>
          {t("routines.form.description")}
        </Label>
        <Input
          autoComplete="off"
          id={`${idPrefix}-desc`}
          onChange={(e) => set({ description: e.target.value })}
          placeholder={t("routines.form.descriptionPlaceholder")}
          value={value.description}
        />
      </div>

      {showAgentPicker && (
        <RoutineAgentSelect
          id={`${idPrefix}-agent`}
          onChange={(agentId) => set({ agentId })}
          value={value.agentId}
        />
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-prompt`}>
          {t("routines.form.instructions")}
        </Label>
        <Textarea
          className="min-h-[120px] font-mono text-xs"
          id={`${idPrefix}-prompt`}
          onChange={(e) => set({ prompt: e.target.value })}
          placeholder={t("routines.form.instructionsPlaceholder")}
          required
          value={value.prompt}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-trigger-type`}>
          {t("routines.form.triggerType")}
        </Label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          id={`${idPrefix}-trigger-type`}
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
        <div className="space-y-3">
          <Label>{t("routines.form.scheduleTriggers")}</Label>
          <SchedulePresetPicker
            locale={locale}
            onChange={(next) => set({ schedule: next })}
            value={value.schedule}
          />
        </div>
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

      {value.triggerType !== "schedule" && (
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
      )}

      {value.triggerType === "webhook" && (
        <p className="text-muted-foreground text-xs">
          {t("routines.form.webhookHint")}
        </p>
      )}
    </div>
  );
}
