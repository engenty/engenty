// "Routine" property row on the task sidebar — links a task back to the routine
// (trigger) that materialized it. Only rendered when the task carries a
// trigger_id. The routine name is resolved from the routines list; falls back
// to a generic label while loading or if the routine was deleted.
import { type RoutineDto, useRoutinesListQuery } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { Repeat } from "lucide-react";
import { Link } from "react-router-dom";
import { tasksPaths } from "../lib/tasks-routes.js";
import { TaskPropertyRow } from "./task-property-row.js";

export function TaskRoutinePropertyRow({ triggerId }: { triggerId: string }) {
  const { t } = useTranslation("tasks");
  const routinesQuery = useRoutinesListQuery();
  const routine = (routinesQuery.data?.routines ?? []).find(
    (r: RoutineDto) => r.id === triggerId
  );
  const label = routine?.name ?? t("detail.openRoutine");

  return (
    <TaskPropertyRow icon={Repeat} label={t("detail.routine")}>
      <Link
        className="truncate text-primary text-sm hover:underline"
        to={tasksPaths.routineDetail(triggerId)}
      >
        {label}
      </Link>
    </TaskPropertyRow>
  );
}
