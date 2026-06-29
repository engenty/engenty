// Routines-as-triggers section on the agent personnel file (ui-2 §3):
// lists routines targeting this agent with inline enable-toggle + run-now,
// opens the shared RoutineDetailPanel on click, and adds new custom routines
// with the agent pre-fixed (no agent picker).

import { useTranslation } from "@engenty/i18n/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  SettingsFormSection,
  Switch,
} from "@engenty/ui-core";
import { CalendarClock, Loader2, Play, Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { RoutineCreateDialog } from "../routines/routine-create-dialog.js";
import { RoutineDetailPanel } from "../routines/routine-detail-panel.js";
import { RoutineTriggerChip } from "../routines/routine-trigger-chip.js";
import type { RoutineDto } from "../routines/routines-api.js";
import {
  useDeleteCustomRoutineMutation,
  usePatchRoutineStateMutation,
  useRoutinesListQuery,
  useRunRoutineNowMutation,
} from "../routines/routines-queries.js";

export function AgentRoutinesTriggerCard({ agentId }: { agentId: string }) {
  const { t, i18n } = useTranslation("ai-ui");
  const { t: tCommon } = useTranslation("common");
  const locale = i18n.language || "en";

  const routinesQuery = useRoutinesListQuery(true);
  const routines = useMemo(
    () =>
      (routinesQuery.data?.routines ?? []).filter(
        (routine) => routine.agent_id === agentId
      ),
    [agentId, routinesQuery.data?.routines]
  );

  const patchMutation = usePatchRoutineStateMutation();
  const runMutation = useRunRoutineNowMutation();
  const deleteMutation = useDeleteCustomRoutineMutation();

  const [selected, setSelected] = useState<RoutineDto | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [routineToEdit, setRoutineToEdit] = useState<RoutineDto | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RoutineDto | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const handleRunNow = useCallback(
    async (id: string) => {
      setRunningId(id);
      try {
        await runMutation.mutateAsync(id);
      } finally {
        setRunningId(null);
      }
    },
    [runMutation]
  );

  const openCreate = useCallback(() => {
    setRoutineToEdit(null);
    setCreateOpen(true);
  }, []);

  const handleEdit = useCallback((routine: RoutineDto) => {
    setSelected(null);
    setRoutineToEdit(routine);
    setCreateOpen(true);
  }, []);

  const handleRequestDelete = useCallback((routine: RoutineDto) => {
    setSelected(null);
    setPendingDelete(routine);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) {
      return;
    }
    await deleteMutation.mutateAsync(pendingDelete.id);
    setPendingDelete(null);
  }, [pendingDelete, deleteMutation]);

  return (
    <SettingsFormSection
      description={t("agentDetail.routinesDescription")}
      title={t("agentDetail.routinesTitle")}
    >
      <div className="space-y-3">
        {routines.length ? (
          <ul className="m-0 list-none divide-y divide-border p-0">
            {routines.map((routine) => {
              const isRunning = runningId === routine.id;
              return (
                <li className="flex items-center gap-3 py-2.5" key={routine.id}>
                  <button
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    onClick={() => setSelected(routine)}
                    type="button"
                  >
                    <CalendarClock
                      aria-hidden
                      className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                      strokeWidth={1.75}
                    />
                    <span className="min-w-0">
                      <span className="block break-words font-medium text-sm transition-colors hover:text-primary">
                        {routine.name ?? routine.id}
                      </span>
                      <span className="mt-0.5 block">
                        <RoutineTriggerChip locale={locale} routine={routine} />
                      </span>
                    </span>
                  </button>
                  <Button
                    className="h-8 shrink-0 gap-1 font-medium text-xs"
                    disabled={isRunning || !routine.enabled}
                    onClick={() => handleRunNow(routine.id)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {isRunning ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3 fill-current" />
                    )}
                    {t("agentDetail.routineRunNow")}
                  </Button>
                  <Switch
                    checked={routine.enabled}
                    disabled={patchMutation.isPending}
                    onCheckedChange={(checked) =>
                      patchMutation.mutate({
                        id: routine.id,
                        patch: { enabled: checked },
                      })
                    }
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {routinesQuery.isPending
              ? t("agentDetail.workSourcesRoutinesLoading")
              : t("agentDetail.workSourcesRoutinesEmpty")}
          </p>
        )}

        <Button
          className="h-9 w-fit gap-1.5"
          onClick={openCreate}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus aria-hidden className="size-3.5" />
          {t("agentDetail.addRoutine")}
        </Button>
      </div>

      <RoutineDetailPanel
        locale={locale}
        onDeleteCustom={() => {
          if (selected) {
            handleRequestDelete(selected);
          }
        }}
        onEditCustom={handleEdit}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
          }
        }}
        routine={selected}
      />

      <RoutineCreateDialog
        defaultAgentId={agentId}
        locale={locale}
        onOpenChange={setCreateOpen}
        open={createOpen}
        routineToEdit={routineToEdit}
      />

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
        open={!!pendingDelete}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("agentDetail.routineDeleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("agentDetail.routineDeleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={handleConfirmDelete}
            >
              {t("agentDetail.routineDeleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsFormSection>
  );
}
