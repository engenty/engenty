import { Fragment } from "react";
import { TrackingRow } from "./tracking-row.js";
import type { TimeEntry, TrackingRow as TrackingRowType } from "./types.js";

interface ProjectGroupProps {
  clientName: string;
  projectId: string;
  projectTitle: string;
  rows: TrackingRowType[];
  timeEntries: TimeEntry[];
  weekDays: Date[];
}

export function ProjectGroup({
  projectId,
  clientName,
  projectTitle,
  rows,
  weekDays,
  timeEntries,
}: ProjectGroupProps) {
  const phases = new Map<
    string,
    {
      phaseTitle: string;
      tasks: Map<string, { taskTitle: string; rows: TrackingRowType[] }>;
      rows: TrackingRowType[];
    }
  >();

  for (const row of rows) {
    const phaseKey = row.phase_id ?? row.phase_title ?? "__none__";
    if (!phases.has(phaseKey)) {
      phases.set(phaseKey, {
        phaseTitle: row.phase_title ?? "",
        tasks: new Map(),
        rows: [],
      });
    }
    const phase = phases.get(phaseKey)!;

    if (row.type === "task") {
      const taskKey = row.task_id ?? row.task_title ?? "__none__";
      if (!phase.tasks.has(taskKey)) {
        phase.tasks.set(taskKey, { taskTitle: row.task_title ?? "", rows: [] });
      }
      phase.tasks.get(taskKey)!.rows.push(row);
    } else {
      // project or phase level row
      phase.rows.push(row);
    }
  }

  return (
    <Fragment key={projectId}>
      {/* Project Header */}
      <tr className="border-t-2 border-t-border bg-muted/50">
        <td className="px-2 py-2 text-sm" colSpan={9}>
          <div className="text-xs leading-tight lg:text-sm">
            <span className="font-light text-muted-foreground text-xxs lg:text-xs">
              {clientName}
            </span>
            {" / "}
            <span className="font-medium">{projectTitle}</span>
          </div>
        </td>
      </tr>

      {Array.from(phases.entries()).map(([phaseKey, phase]) => (
        <Fragment key={phaseKey}>
          {/* Phase Header (only if it has a real phase title) */}
          {phaseKey !== "__none__" && (
            <tr className="border-b bg-muted/20">
              <td className="px-2 py-1.5 pl-6" colSpan={9}>
                <div className="font-medium text-muted-foreground text-xs">
                  {phase.phaseTitle}
                </div>
              </td>
            </tr>
          )}

          {/* Phase-level rows */}
          {phase.rows.map((row) => (
            <TrackingRow
              indent={phaseKey === "__none__" ? 4 : 8}
              key={row.id}
              row={row}
              timeEntries={timeEntries}
              weekDays={weekDays}
            />
          ))}

          {/* Tasks */}
          {Array.from(phase.tasks.entries()).map(([taskKey, task]) => (
            <Fragment key={taskKey}>
              {/* Task Header */}
              {taskKey !== "__none__" && (
                <tr className="border-b bg-muted/10">
                  <td
                    className={`px-2 py-1 ${phaseKey === "__none__" ? "pl-6" : "pl-10"}`}
                    colSpan={9}
                  >
                    <div className="font-medium text-foreground text-sm">
                      {task.taskTitle}
                    </div>
                  </td>
                </tr>
              )}
              {/* Task-level rows (Disciplines) */}
              {task.rows.map((row) => (
                <TrackingRow
                  indent={phaseKey === "__none__" ? 10 : 14}
                  key={row.id}
                  row={row}
                  timeEntries={timeEntries}
                  weekDays={weekDays}
                />
              ))}
            </Fragment>
          ))}
        </Fragment>
      ))}
    </Fragment>
  );
}
