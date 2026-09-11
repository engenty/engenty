// Field body for custom routines (no dialog chrome) — consumed by
// RoutineCreateDialog and the agent desk's Plan panel.
//
// EDIT MODE IS THE VIEW WITH THE FIELDS UNLOCKED. Same headings, same order,
// same card chrome as RoutineDetailBody: the title reads as the title (not a
// labelled "Name" input), and Action / Auslöser / Ergebnis are the same three
// sections in the same places. Switching between reading a routine and
// changing it must not reshuffle the page — that reshuffle is what made the
// old form feel like a different screen about the same thing.
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Input, Label, Textarea } from "@engenty/ui-core";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { CreateWorkflowDialog } from "../workflow-canvas/create-workflow-dialog.js";
import { RoutineAgentSelect } from "./routine-agent-select.js";
import { RoutineFlowSelect } from "./routine-flow-select.js";
import type {
  RoutineBodyMode,
  RoutineFormValue,
  RoutineTriggerType,
} from "./routine-form-value.js";
import type { RoutineReportMode } from "./routines-api.js";
import { SchedulePresetPicker } from "./schedule-preset-picker.js";

const TRIGGER_TYPES: RoutineTriggerType[] = [
  "schedule",
  "module-events",
  "webhook",
  "manual",
  "agent",
];

const REPORT_MODES: RoutineReportMode[] = ["quiet", "desk_card", "ask"];
const BODY_MODES: RoutineBodyMode[] = ["prompt", "workflow"];

export interface RoutineFormProps {
  idPrefix?: string;
  locale?: string;
  onChange: (next: RoutineFormValue) => void;
  /** Open the Action's canvas — same handler the view uses. */
  onOpenAction?: (workflowId: string) => void;
  // When false the Action is fixed by the host (the Action's own card) and
  // neither the workflow picker nor "Create a workflow" is rendered.
  showActionPicker?: boolean;
  // When true an agent <select> is rendered; otherwise agentId stays fixed.
  showAgentPicker: boolean;
  value: RoutineFormValue;
}

/** The view's section heading, verbatim — this is the point of the mirror. */
function SectionHeading({ children }: { children: string }) {
  return (
    <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
      {children}
    </h4>
  );
}

export function RoutineForm({
  value,
  onChange,
  onOpenAction,
  showActionPicker = true,
  showAgentPicker,
  locale = "en",
  idPrefix = "routine",
}: RoutineFormProps) {
  const { t } = useTranslation("ai-ui");
  const isDe = locale.startsWith("de");
  const [createActionOpen, setCreateActionOpen] = useState(false);

  const set = (patch: Partial<RoutineFormValue>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="space-y-6">
      {/* Identity — the view's title block, unlocked. The heading IS the
          field: a labelled "Name" input above a separate description input
          made the same two lines read as a form about a routine rather than
          the routine itself. */}
      <div className="space-y-1">
        <Input
          aria-label={t("routines.form.name")}
          autoComplete="off"
          className="h-auto border-0 bg-transparent px-0 py-0 font-semibold text-xl tracking-tight shadow-none focus-visible:ring-0"
          id={`${idPrefix}-name`}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={t("routines.form.namePlaceholder")}
          required
          value={value.name}
        />
        <Input
          aria-label={t("routines.form.description")}
          autoComplete="off"
          className="h-auto border-0 bg-transparent px-0 py-0 text-muted-foreground text-sm shadow-none focus-visible:ring-0"
          id={`${idPrefix}-desc`}
          onChange={(e) => set({ description: e.target.value })}
          placeholder={t("routines.form.descriptionPlaceholder")}
          value={value.description}
        />
      </div>

      {/* Action — the view's canvas section, as the choice that produces it.
          With both pickers fixed by the host and no event mapping to show,
          the section has no fields and disappears. */}
      <div
        className={
          showAgentPicker ||
          showActionPicker ||
          value.triggerType === "module-events" ||
          value.triggerType === "webhook"
            ? "space-y-2"
            : "hidden"
        }
      >
        <SectionHeading>Action</SectionHeading>
        <div className="ui-card-panel space-y-3 p-3.5">
          {/* The owning specialist: the Action is what runs, but only a
              specialist owns a routine. */}
          {showAgentPicker ? (
            <RoutineAgentSelect
              id={`${idPrefix}-agent`}
              onChange={(agentId) => set({ agentId })}
              value={value.agentId}
            />
          ) : null}

          {/* What runs: one instruction in prose (the common case — one
              prompt, one trigger, no canvas) or a workflow from the canvas. */}
          {showActionPicker ? (
            <div
              aria-label={t("routines.form.bodyMode")}
              className="inline-flex rounded-md border border-input p-0.5"
              role="radiogroup"
            >
              {BODY_MODES.map((mode) => (
                <button
                  aria-checked={value.mode === mode}
                  className={
                    value.mode === mode
                      ? "rounded bg-muted px-3 py-1 font-medium text-sm"
                      : "rounded px-3 py-1 text-muted-foreground text-sm hover:text-foreground"
                  }
                  key={mode}
                  onClick={() => set({ mode })}
                  role="radio"
                  type="button"
                >
                  {t(`routines.form.bodyModes.${mode}`)}
                </button>
              ))}
            </div>
          ) : null}

          {showActionPicker && value.mode === "prompt" ? (
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-prompt`}>
                {t("routines.form.prompt")}
              </Label>
              <Textarea
                className="min-h-[120px]"
                id={`${idPrefix}-prompt`}
                onChange={(e) => set({ prompt: e.target.value })}
                placeholder={t("routines.form.promptPlaceholder")}
                value={value.prompt}
              />
              <p className="text-muted-foreground text-xs">
                {t("routines.form.promptHint")}
              </p>
            </div>
          ) : null}

          {showActionPicker && value.mode === "workflow" ? (
            <>
              <RoutineFlowSelect
                id={`${idPrefix}-action`}
                onChange={(workflowId) => set({ workflowId })}
                value={value.workflowId}
              />
              {/* Authoring a workflow was a dead end here: the picker offered
                  only what already existed, and building one meant leaving for
                  the admin area. Both moves now happen in place. */}
              <div className="flex flex-wrap gap-2">
                <Button
                  className="gap-1.5"
                  onClick={() => setCreateActionOpen(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Plus className="size-3.5" />
                  {isDe ? "Neuen Workflow erstellen" : "Create a workflow"}
                </Button>
                {value.workflowId && onOpenAction ? (
                  <Button
                    className="gap-1.5"
                    onClick={() => onOpenAction(value.workflowId)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Pencil className="size-3.5" />
                    {isDe ? "Workflow bearbeiten" : "Edit this workflow"}
                  </Button>
                ) : null}
              </div>
              <CreateWorkflowDialog
                onCreated={(graphId) => {
                  set({ workflowId: graphId });
                  setCreateActionOpen(false);
                  onOpenAction?.(graphId);
                }}
                onOpenChange={setCreateActionOpen}
                open={createActionOpen}
              />
            </>
          ) : null}
          {value.triggerType === "module-events" ||
          value.triggerType === "webhook" ? (
            // An event wakes the Action through its INPUT, not through
            // prose: the payload is `initData`, and this says which fields
            // the Action's input schema wants. Blank = the payload IS the
            // input.
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
          ) : null}
        </div>
      </div>

      {/* Auslöser — the view's wake source, as the schedule that fills it. */}
      <div className="space-y-2">
        <SectionHeading>{isDe ? "Auslöser" : "Trigger"}</SectionHeading>
        <div className="ui-card-panel space-y-3 p-3.5">
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

          {(value.triggerType === "module-events" ||
            value.triggerType === "webhook") && (
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
        </div>
      </div>

      {/* Ergebnis — the view's outcome node, as its two fields. The Action
          says what to DO; this says what must be TRUE when the run ends. */}
      <div className="space-y-2">
        <SectionHeading>{isDe ? "Ergebnis" : "Outcome"}</SectionHeading>
        <div className="ui-card-panel space-y-3 p-3.5">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-outcome`}>
              {t("routines.form.outcome")}
            </Label>
            <Textarea
              className="min-h-[64px]"
              id={`${idPrefix}-outcome`}
              onChange={(e) => set({ outcome: e.target.value })}
              placeholder={t("routines.form.outcomePlaceholder")}
              value={value.outcome}
            />
            <p className="text-muted-foreground text-xs">
              {t("routines.form.outcomeHint")}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-report-mode`}>
              {t("routines.form.reportMode")}
            </Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              id={`${idPrefix}-report-mode`}
              onChange={(e) =>
                set({ reportMode: e.target.value as RoutineReportMode })
              }
              value={value.reportMode}
            >
              {REPORT_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {t(`routines.form.reportModes.${mode}`)}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-xs">
              {t(`routines.form.reportModeHints.${value.reportMode}`)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
