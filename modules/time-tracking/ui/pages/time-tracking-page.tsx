import { useRegisterAgentUiSlice } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AddTrackingDialog } from "../components/add-tracking-dialog.js";
import { TimeTrackingTable } from "../components/time-tracking-table.js";
import { TimeTrackingUserSwitcher } from "../components/time-tracking-user-switcher.js";
import { WeekNavigation } from "../components/week-navigation.js";
import { useAddTrackingRow } from "../hooks/use-add-tracking-row.js";
import { useTimeEntryOperations } from "../hooks/use-time-entry-operations.js";
import { useTimeTracking } from "../hooks/use-time-tracking.js";

export function TimeTrackingPage() {
  const { t } = useTranslation("time-tracking");
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedUser, setSelectedUser] = useState("");
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

  const pageActions = useMemo(
    () => (
      <div className="flex items-center gap-2">
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
    [t]
  );

  const breadcrumbs = useMemo(
    () => [
      { label: t("menu"), to: "/mdl/time-tracking" },
      {
        compactKept: true,
        label: (
          <TimeTrackingUserSwitcher
            currentUser={currentUser}
            onSelect={setSelectedUser}
            selectedUser={userId}
            teamMembersAvailable={teamMembersAvailable}
            users={users}
          />
        ),
        menuLabel:
          users.find((u) => u.id === userId)?.full_name ||
          currentUser?.full_name ||
          "",
      },
    ],
    [users, userId, currentUser, teamMembersAvailable, t]
  );
  usePageConfig({ breadcrumbs, actions: pageActions });

  const agentUiSlice = useMemo(
    () => ({
      page: {
        view: "week",
        display: "table",
        current_week_start: currentWeek.toISOString(),
      },
    }),
    [currentWeek]
  );

  useRegisterAgentUiSlice("time_tracking", agentUiSlice);

  return (
    <div className="w-full min-w-0 space-y-4 p-4">
      <div className="mb-4">
        <WeekNavigation
          currentWeek={currentWeek}
          onWeekChange={setCurrentWeek}
        />
      </div>

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
