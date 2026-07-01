import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@engenty/ui-core";
import { addDays, format, startOfWeek } from "date-fns";
import { Clock } from "lucide-react";
import { ProjectGroup } from "./project-group.js";
import { TableSkeleton } from "./table-skeleton.js";
import { TimeTrackingProvider } from "./time-tracking-context.js";
import type {
  Discipline,
  Option,
  ProjectOption,
  TeamMemberOption,
  TimeEntry,
  TrackingRow,
} from "./types.js";
import { getGrandTotal, getTotalHoursForDay } from "./utils.js";

interface TimeTrackingTableProps {
  allProjects: ProjectOption[];
  currentWeek: Date;
  disciplines: Discipline[];
  getEntryForRowAndDate: (
    row: TrackingRow,
    date: Date
  ) => TimeEntry | undefined;
  isLoading: boolean;
  moveDate: Date;
  moveDiscipline: string;
  moveMode: string | null;
  movePhase: string;
  movePhases: Option[];
  moveProject: string;
  moveProjectComboOpen: boolean;
  moveTask: string;
  moveTasks: Option[];
  moveUser: string;
  onAddTracking: () => void;
  onDeleteEntry: (entryId: string) => void;
  onDeleteRow: (rowId: string) => void;
  onMoveEntry: (entry: TimeEntry) => void;
  onOpenMoveMode: (entry: TimeEntry) => void;
  onSaveEntry: (
    row: TrackingRow,
    day: Date,
    entry: TimeEntry | undefined,
    hours: number,
    notes: string | null,
    discipline: string | null
  ) => void;
  projectSelectionEnabled: boolean;
  setMoveDate: (date: Date) => void;
  setMoveDiscipline: (discipline: string) => void;
  setMoveMode: (entryId: string | null) => void;
  setMovePhase: (phaseId: string) => void;
  setMoveProject: (projectId: string) => void;
  setMoveProjectComboOpen: (open: boolean) => void;
  setMoveTask: (taskId: string) => void;
  setMoveUser: (userId: string) => void;
  showUserSelect: boolean;
  timeEntries: TimeEntry[];
  trackingRows: TrackingRow[];
  users: TeamMemberOption[];
}

export function TimeTrackingTable({
  isLoading,
  currentWeek,
  trackingRows,
  timeEntries,
  moveMode,
  moveDate,
  moveProject,
  movePhase,
  moveTask,
  moveDiscipline,
  moveUser,
  movePhases,
  moveTasks,
  moveProjectComboOpen,
  disciplines,
  allProjects,
  users,
  showUserSelect,
  projectSelectionEnabled,
  getEntryForRowAndDate,
  onSaveEntry,
  onDeleteEntry,
  onDeleteRow,
  onOpenMoveMode,
  onMoveEntry,
  onAddTracking,
  setMoveMode,
  setMoveDate,
  setMoveProject,
  setMovePhase,
  setMoveTask,
  setMoveDiscipline,
  setMoveUser,
  setMoveProjectComboOpen,
}: TimeTrackingTableProps) {
  const { t, i18n } = useTranslation("time-tracking");
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const projectGroups = trackingRows.reduce(
    (acc, row) => {
      const key = row.project_id ?? row.project_title;
      if (!acc[key]) {
        acc[key] = {
          client_name: row.client_name,
          project_title: row.project_title,
          rows: [],
        };
      }
      acc[key].rows.push(row);
      return acc;
    },
    {} as Record<
      string,
      { client_name: string; project_title: string; rows: TrackingRow[] }
    >
  );

  return (
    <div className="min-h-[600px] overflow-x-auto pb-2">
      {!isLoading && trackingRows.length === 0 ? (
        <Empty className="border-none py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Clock className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle>{t("empty.title")}</EmptyTitle>
            <EmptyDescription>{t("empty.description")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button className="h-8 text-xs" onClick={onAddTracking} size="sm">
              {t("addTracking")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <TimeTrackingProvider
          allProjects={allProjects}
          disciplines={disciplines}
          getEntryForRowAndDate={getEntryForRowAndDate}
          moveDate={moveDate}
          moveDiscipline={moveDiscipline}
          moveMode={moveMode}
          movePhase={movePhase}
          movePhases={movePhases}
          moveProject={moveProject}
          moveProjectComboOpen={moveProjectComboOpen}
          moveTask={moveTask}
          moveTasks={moveTasks}
          moveUser={moveUser}
          onDeleteEntry={onDeleteEntry}
          onDeleteRow={onDeleteRow}
          onMoveEntry={onMoveEntry}
          onOpenMoveMode={onOpenMoveMode}
          onSaveEntry={onSaveEntry}
          projectSelectionEnabled={projectSelectionEnabled}
          setMoveDate={setMoveDate}
          setMoveDiscipline={setMoveDiscipline}
          setMoveMode={setMoveMode}
          setMovePhase={setMovePhase}
          setMoveProject={setMoveProject}
          setMoveProjectComboOpen={setMoveProjectComboOpen}
          setMoveTask={setMoveTask}
          setMoveUser={setMoveUser}
          showUserSelect={showUserSelect}
          users={users}
        >
          <table className="w-full min-w-[672px] border-collapse md:min-w-0">
            <thead>
              <tr>
                <th className="hidden min-w-[250px] border-b px-0.5 py-1 text-left font-semibold text-xs md:table-cell lg:text-sm" />
                {weekDays.map((day) => (
                  <th
                    className="min-w-24 border-b px-0.5 py-1 text-center font-semibold md:min-w-[80px]"
                    key={day.toISOString()}
                  >
                    <div className="text-muted-foreground text-xxs lg:text-xs">
                      {new Intl.DateTimeFormat(i18n.language, {
                        weekday: "short",
                      }).format(day)}
                    </div>
                    <div className="text-xs lg:text-sm">
                      {format(day, "dd.MM")}
                    </div>
                  </th>
                ))}
                <th className="hidden min-w-[70px] border-b px-0.5 py-1 text-center font-semibold text-xs md:table-cell lg:text-sm">
                  {t("total")}
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton currentWeek={currentWeek} />
              ) : (
                <>
                  {Object.entries(projectGroups).map(([projectId, group]) => (
                    <ProjectGroup
                      clientName={group.client_name}
                      key={projectId}
                      projectId={projectId}
                      projectTitle={group.project_title}
                      rows={group.rows}
                      timeEntries={timeEntries}
                      weekDays={weekDays}
                    />
                  ))}
                  <tr className="border-t-2 border-t-border bg-muted/30 md:hidden">
                    <td className="px-2 py-2 font-bold text-sm" colSpan={9}>
                      {t("total")}
                    </td>
                  </tr>
                  <tr className="border-t-2 border-t-border bg-muted/30 font-bold">
                    <td className="hidden px-0.5 py-2 text-xs md:table-cell lg:text-sm">
                      {t("total")}
                    </td>
                    {weekDays.map((day) => {
                      const total = getTotalHoursForDay(day, timeEntries);
                      return (
                        <td
                          className="min-w-24 px-0.5 py-2 text-center text-xs md:min-w-0 lg:text-sm"
                          key={day.toISOString()}
                        >
                          {total > 0 ? `${total.toFixed(1)}h` : "-"}
                        </td>
                      );
                    })}
                    <td className="hidden px-0.5 py-2 text-center text-xs md:table-cell lg:text-sm">
                      {getGrandTotal(timeEntries).toFixed(1)}h
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </TimeTrackingProvider>
      )}
    </div>
  );
}
