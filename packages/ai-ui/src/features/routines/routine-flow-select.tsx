// The routine form's Action picker. Module workflows are materialized as
// tenant rows by the boot reconcile, so the list is simply the published
// graphs — selecting one stores its id on the binding.
import { useTranslation } from "@engenty/i18n/ui";
import { Label } from "@engenty/ui-core";
import { useMemo } from "react";
import { useWorkflowListQuery } from "../workflow-canvas/workflow-queries.js";
import { buildRoutineFlowOptions } from "./routine-flow-options.js";

export interface RoutineFlowSelectProps {
  id: string;
  onChange: (workflowId: string) => void;
  value: string;
}

export function RoutineFlowSelect({
  id,
  value,
  onChange,
}: RoutineFlowSelectProps) {
  const { t } = useTranslation("ai-ui");
  const graphsQuery = useWorkflowListQuery();

  const options = useMemo(
    () => buildRoutineFlowOptions(graphsQuery.data?.graphs ?? []),
    [graphsQuery.data?.graphs]
  );

  const loading = graphsQuery.isPending;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t("routines.form.flow")}</Label>
      <select
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        required
        value={value}
      >
        <option value="">
          {loading
            ? t("routines.form.flowLoading")
            : t("routines.form.flowPlaceholder")}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
