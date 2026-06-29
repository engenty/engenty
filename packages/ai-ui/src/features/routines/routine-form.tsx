// Field body for custom routines (no dialog chrome) — consumed by
// RoutineCreateDialog and the tasks-module routine edit page.
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Input, Label, Textarea } from "@engenty/ui-core";
import { Plus, Trash } from "lucide-react";
import { RoutineAgentSelect } from "./routine-agent-select.js";
import {
  MAX_ROUTINE_SCHEDULES,
  type RoutineFormValue,
} from "./routine-form-value.js";
import type { PresetSchedule } from "./schedule-cron.js";
import { SchedulePresetPicker } from "./schedule-preset-picker.js";

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

  const setSchedule = (index: number, next: PresetSchedule) =>
    set({
      schedules: value.schedules.map((s, idx) => (idx === index ? next : s)),
    });

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

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>{t("routines.form.scheduleTriggers")}</Label>
          {value.schedules.length < MAX_ROUTINE_SCHEDULES && (
            <Button
              className="h-8 gap-1 font-medium text-xs"
              onClick={() =>
                set({
                  schedules: [
                    ...value.schedules,
                    { type: "daily", hour: 9, minute: 0 },
                  ],
                })
              }
              type="button"
              variant="outline"
            >
              <Plus className="h-3 w-3" />
              {t("routines.form.addTrigger")}
            </Button>
          )}
        </div>

        <div className="space-y-3.5">
          {value.schedules.map((preset, index) => (
            <div
              className="flex items-end gap-2 border-b pb-3.5 last:border-0 last:pb-0"
              key={index}
            >
              <div className="min-w-0 flex-1">
                <SchedulePresetPicker
                  locale={locale}
                  onChange={(next) => setSchedule(index, next)}
                  value={preset}
                />
              </div>
              {value.schedules.length > 1 && (
                <Button
                  className="h-10 w-10 shrink-0 p-0 text-destructive hover:bg-destructive/10"
                  onClick={() =>
                    set({
                      schedules: value.schedules.filter(
                        (_, idx) => idx !== index
                      ),
                    })
                  }
                  type="button"
                  variant="outline"
                >
                  <Trash className="h-4 w-4" />
                  <span className="sr-only">
                    {t("routines.form.removeTrigger")}
                  </span>
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
