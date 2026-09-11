import { useTranslation } from "@engenty/i18n/ui";
import { DatePicker } from "@engenty/ui-core";
import { useMemo } from "react";
import {
  hintClass,
  SegmentedChoice,
  type SegmentOption,
  sectionLabelClass,
} from "./new-task-selectors.js";

/**
 * Creating a task only ever creates a work item. Repeating work is a routine
 * on a specialist, added from that specialist's Plan panel — never from here.
 */
export function NewTaskWhenFields(props: {
  dueDate: string | null;
  onDueDateChange: (date: string | null) => void;
  onStartNowChange: (startNow: boolean) => void;
  startNow: boolean;
  workerHint: "agent" | "plan" | "user";
}) {
  const { t } = useTranslation("tasks");
  const startOptions = useMemo<SegmentOption[]>(
    () => [
      { label: t("newTask.startNow"), value: "now" },
      { label: t("newTask.startPlan"), value: "plan" },
    ],
    [t]
  );
  const workerHintKey = {
    agent: "newTask.hintAgent",
    plan: "newTask.hintPlan",
    user: "newTask.hintUser",
  }[props.workerHint];

  return (
    <div className="space-y-2.5">
      <p className={sectionLabelClass}>{t("newTask.whenLabel")}</p>

      <div className="grid gap-3 pt-1 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className={hintClass}>{t("newTask.startLabel")}</p>
          <SegmentedChoice
            onChange={(next) => props.onStartNowChange(next === "now")}
            options={startOptions}
            value={props.startNow ? "now" : "plan"}
          />
        </div>
        <div className="space-y-1.5">
          <p className={hintClass}>{t("newTask.dueLabel")}</p>
          <DatePicker
            onChange={props.onDueDateChange}
            placeholder={t("newTask.duePlaceholder")}
            value={props.dueDate}
          />
        </div>
      </div>
      <p className={hintClass}>{t(workerHintKey)}</p>
    </div>
  );
}
