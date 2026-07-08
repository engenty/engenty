import { useRegisterAgentUiSlice } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { CalendarDays, Plus, Table2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AddTrackingDialog } from "../components/add-tracking-dialog.js";
import { TimeTrackingCalendar } from "../components/calendar/time-tracking-calendar.js";
import { TimeTrackingTable } from "../components/time-tracking-table.js";
import { TimeTrackingUserSwitcher } from "../components/time-tracking-user-switcher.js";
import { WeekNavigation } from "../components/week-navigation.js";
import { useAddTrackingRow } from "../hooks/use-add-tracking-row.js";
import { useTimeEntryOperations } from "../hooks/use-time-entry-operations.js";
import { useTimeTracking } from "../hooks/use-time-tracking.js";

type ViewMode = "table" | "calendar";

const VIEW_STORAGE_KEY = "engenty:time-tracking:view";

function loadViewPref(): ViewMode {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === "calendar"
      ? "calendar"
      : "table";
  } catch {
    return "table";
  }
}

export function TimeTrackingPage() {
  const { t } = useTranslation("time-tracking");
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedUser, setSelectedUser] = useState("");
  const [view, setView] = useState<ViewMode>(() => loadViewPref());
  const {
    trackingRows,
    timeEntries,
    currentUser,
    users,
    isAdmin,
    isLoading,
    disciplines,
    allProjects,
    projectsAvailable,
    tasksAvailable,
    teamMembersAvailable,
    loadError,
    refetchTrackingRows,
    refetchTimeEntries,
  } = useTimeTracking(selectedUser, currentWeek);

  const userId = selectedUser || currentUser?.id || "";
  const showUserSelect = isAdmin && teamMembersAvailable && users.length > 0;
  const teamMemberPickerReady =
    !isLoading && isAdmin && teamMembersAvailable && users.length > 1;
  const activeUserName =
    users.find((u) => u.id === userId)?.full_name ||
    currentUser?.full_name ||
    "";

  const operations = useTimeEntryOperations(
    userId,
    currentUser,
    showUserSelect,
    projectsAvailable,
    refetchTimeEntries
  );

  const addRow = useAddTrackingRow(
    currentWeek,
    userId,
    currentUser,
    allProjects,
    projectsAvailable,
    tasksAvailable,
    refetchTrackingRows,
    refetchTimeEntries
  );

  useEffect(() => {
    if (currentUser && !selectedUser) {
      setSelectedUser(currentUser.id);
    }
  }, [currentUser, selectedUser]);

  const switchView = (next: ViewMode) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  const pageActions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-md border p-0.5">
          <button
            aria-label={t("calendar.viewTable")}
            className={[
              "rounded p-1 transition-colors",
              view === "table"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
            onClick={() => switchView("table")}
            title={t("calendar.viewTable")}
            type="button"
          >
            <Table2 className="h-3.5 w-3.5" />
          </button>
          <button
            aria-label={t("calendar.viewCalendar")}
            className={[
              "rounded p-1 transition-colors",
              view === "calendar"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
            onClick={() => switchView("calendar")}
            title={t("calendar.viewCalendar")}
            type="button"
          >
            <CalendarDays className="h-3.5 w-3.5" />
          </button>
        </div>
        <Button
          className="h-8 gap-1.5 px-2.5 text-xs"
          onClick={() => addRow.setAddRowOpen(true)}
          size="sm"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("addTracking")}
        </Button>
      </div>
    ),
    [t, view]
  );

  const breadcrumbs = useMemo(
    () => [
      { label: t("menu"), to: "/mdl/time-tracking" },
      {
        compactKept: true,
        label: teamMemberPickerReady ? (
          <TimeTrackingUserSwitcher
            currentUser={currentUser}
            isAdmin={isAdmin}
            onSelect={setSelectedUser}
            selectedUser={userId}
            teamMembersAvailable={teamMembersAvailable}
            users={users}
          />
        ) : (
          <span className="font-medium text-foreground text-sm">
            {activeUserName}
          </span>
        ),
        menuLabel: activeUserName,
      },
    ],
    [
      users,
      userId,
      currentUser,
      isAdmin,
      teamMembersAvailable,
      teamMemberPickerReady,
      activeUserName,
      isLoading,
      t,
    ]
  );
  usePageConfig({ breadcrumbs, actions: pageActions });

  const agentUiSlice = useMemo(
    () => ({
      page: {
        view: "week",
        display: view,
        current_week_start: currentWeek.toISOString(),
      },
    }),
    [currentWeek, view]
  );

  useRegisterAgentUiSlice("time_tracking", agentUiSlice);

  return (
    <div className="w-full min-w-0 space-y-4 p-4">
      {view === "table" ? (
        <div className="mb-4">
          <WeekNavigation
            currentWeek={currentWeek}
            onWeekChange={setCurrentWeek}
          />
        </div>
      ) : null}

      {loadError ? (
        <p className="text-destructive text-sm">{loadError}</p>
      ) : null}

      <AddTrackingDialog
        addError={addRow.addError}
        addRowOpen={addRow.addRowOpen}
        allProjects={allProjects}
        allTasks={addRow.allTasks}
        availablePhases={addRow.availablePhases}
        availableTasks={addRow.availableTasks}
        disciplines={disciplines}
        hideTrigger
        manualPhaseTitle={addRow.manualPhaseTitle}
        manualProjectTitle={addRow.manualProjectTitle}
        manualTaskTitle={addRow.manualTaskTitle}
        onAdd={async () => {
          await addRow.handleAddRow();
        }}
        projectsAvailable={projectsAvailable}
        selectedDiscipline={addRow.selectedDiscipline}
        selectedPhase={addRow.selectedPhase}
        selectedProject={addRow.selectedProject}
        selectedTask={addRow.selectedTask}
        setAddRowOpen={addRow.setAddRowOpen}
        setManualPhaseTitle={addRow.setManualPhaseTitle}
        setManualProjectTitle={addRow.setManualProjectTitle}
        setManualTaskTitle={addRow.setManualTaskTitle}
        setSelectedDiscipline={addRow.setSelectedDiscipline}
        setSelectedPhase={addRow.setSelectedPhase}
        setSelectedProject={addRow.setSelectedProject}
        setSelectedTask={addRow.setSelectedTask}
        setTrackingMode={addRow.setTrackingMode}
        tasksAvailable={tasksAvailable}
        trackingMode={addRow.trackingMode}
      />

      {view === "calendar" ? (
        <TimeTrackingCalendar
          allProjects={allProjects}
          currentWeek={currentWeek}
          disciplines={disciplines}
          isLoading={isLoading}
          onWeekChange={setCurrentWeek}
          projectsAvailable={projectsAvailable}
          refetch={refetchTimeEntries}
          tasksAvailable={tasksAvailable}
          timeEntries={timeEntries}
          trackingRows={trackingRows}
          userId={userId}
        />
      ) : (
      <TimeTrackingTable
        allProjects={allProjects}
        currentWeek={currentWeek}
        disciplines={disciplines}
        getEntryForRowAndDate={(row, date) =>
          operations.getEntryForRowAndDate(row, date, timeEntries)
        }
        isLoading={isLoading}
        moveDate={operations.moveDate}
        moveDiscipline={operations.moveDiscipline}
        moveMode={operations.moveMode}
        movePhase={operations.movePhase}
        movePhases={operations.movePhases}
        moveProject={operations.moveProject}
        moveProjectComboOpen={operations.moveProjectComboOpen}
        moveTask={operations.moveTask}
        moveTasks={operations.moveTasks}
        moveUser={operations.moveUser}
        onAddTracking={() => addRow.setAddRowOpen(true)}
        onDeleteEntry={operations.handleDeleteEntry}
        onDeleteRow={operations.handleDeleteRow}
        onMoveEntry={operations.handleMoveEntry}
        onOpenMoveMode={operations.openMoveMode}
        onSaveEntry={operations.handleSaveEntry}
        projectSelectionEnabled={projectsAvailable}
        setMoveDate={operations.setMoveDate}
        setMoveDiscipline={operations.setMoveDiscipline}
        setMoveMode={operations.setMoveMode}
        setMovePhase={operations.setMovePhase}
        setMoveProject={operations.setMoveProject}
        setMoveProjectComboOpen={operations.setMoveProjectComboOpen}
        setMoveTask={operations.setMoveTask}
        setMoveUser={operations.setMoveUser}
        showUserSelect={showUserSelect}
        timeEntries={timeEntries}
        trackingRows={trackingRows}
        users={users}
      />
      )}

      {loadError || projectsAvailable || tasksAvailable ? null : (
        <p className="text-muted-foreground text-xs">{t("manualModeHint")}</p>
      )}
      {loadError || teamMembersAvailable ? null : (
        <p className="text-muted-foreground text-xs">
          {t("selfTrackingHint", { user: currentUser?.full_name ?? "Me" })}
        </p>
      )}
    </div>
  );
}
