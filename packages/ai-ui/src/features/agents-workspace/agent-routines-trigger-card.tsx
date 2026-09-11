// Routines section on the agent personnel file.
//
// The desk's Plan panel is the place to READ a routine — it draws the whole
// job on the canvas, in the Space the routine belongs to. This card is the
// other half: the personnel file is about the AGENT, so it lists every routine
// the agent owns ACROSS Spaces and gives the quick controls (run now, pause,
// edit, delete, add). Nothing here duplicates the desk's reading view; clicking
// through to edit opens the same form the desk uses.

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
import {
  CalendarClock,
  Loader2,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { RoutineCreateDialog } from "../routines/routine-create-dialog.js";
import { routineBelongsToAgent } from "../routines/routine-shape.js";
import { RoutineTriggerChip } from "../routines/routine-trigger-chip.js";
import type { RoutineDto } from "../routines/routines-api.js";
import {
  useDeleteCustomRoutineMutation,
  usePatchRoutineStateMutation,
  useRoutinesListQuery,
} from "../routines/routines-queries.js";
import { useRoutineRun } from "../routines/use-routine-run.js";

export function AgentRoutinesTriggerCard({ agentId }: { agentId: string }) {
  const { t, i18n } = useTranslation("ai-ui");
  const { t: tCommon } = useTranslation("common");
  const locale = i18n.language || "en";
  const isDe = locale.startsWith("de");

  // Tenant scope: this card lives on the admin personnel file, which is about
  // the AGENT, not about whichever Space the shell happens to have selected.
  // Scoped to the current Space it silently showed "No routines target this
  // agent" for an agent whose routine lives in another Space — the exact case
  // the scope option exists for.
  const routinesQuery = useRoutinesListQuery(true, "tenant");
  const routines = useMemo(
    () =>
      (routinesQuery.data?.routines ?? []).filter((routine) =>
        routineBelongsToAgent(routine, agentId)
      ),
    [agentId, routinesQuery.data?.routines]
  );

  const patchMutation = usePatchRoutineStateMutation();
  const deleteMutation = useDeleteCustomRoutineMutation();
  const { fire, runningRoutineId, skipped } = useRoutineRun();

  const [createOpen, setCreateOpen] = useState(false);
  const [routineToEdit, setRoutineToEdit] = useState<RoutineDto | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RoutineDto | null>(null);

  const openCreate = useCallback(() => {
    setRoutineToEdit(null);
    setCreateOpen(true);
  }, []);

  const handleEdit = useCallback((routine: RoutineDto) => {
    setRoutineToEdit(routine);
    setCreateOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) {
      return;
    }
    await deleteMutation.mutateAsync(pendingDelete.id);
    setPendingDelete(null);
  }, [pendingDelete, deleteMutation]);

  // A fire that changed nothing must not read as "started".
  const skipMessage = skipped
    ? {
        disabled: isDe
          ? "Die Routine ist deaktiviert."
          : "That routine is switched off.",
        overlap: isDe
          ? "Der vorige Lauf dieser Routine läuft noch."
          : "That routine's previous run is still active.",
        quiet_hours: isDe
          ? "Die Routine ist gerade in ihren Ruhezeiten."
          : "That routine is inside its quiet hours.",
      }[skipped]
    : null;

  return (
    <SettingsFormSection
      description={t("agentDetail.routinesDescription")}
      title={t("agentDetail.routinesTitle")}
    >
      <div className="space-y-3">
        {routines.length ? (
          <ul className="m-0 list-none divide-y divide-border p-0">
            {routines.map((routine) => {
              const isRunning = runningRoutineId === routine.id;
              return (
                <li className="flex items-center gap-2 py-2.5" key={routine.id}>
                  <CalendarClock
                    aria-hidden
                    className="mt-0.5 size-3.5 shrink-0 self-start text-muted-foreground"
                    strokeWidth={1.75}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-medium text-sm">
                      {routine.name}
                    </span>
                    <span className="mt-0.5 block">
                      <RoutineTriggerChip locale={locale} routine={routine} />
                    </span>
                  </span>
                  <Button
                    className="h-8 shrink-0 gap-1 font-medium text-xs"
                    disabled={isRunning || !routine.enabled}
                    onClick={() => fire(routine.id)}
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
                  {routine.source === "custom" ? (
                    <>
                      <Button
                        aria-label={tCommon("actions.edit")}
                        className="size-8 shrink-0"
                        onClick={() => handleEdit(routine)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        aria-label={tCommon("actions.delete")}
                        className="size-8 shrink-0 text-destructive hover:bg-destructive/10"
                        onClick={() => setPendingDelete(routine)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </>
                  ) : null}
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

        {skipMessage ? (
          <p
            className="text-amber-700 text-xs dark:text-amber-400"
            role="status"
          >
            {skipMessage}
          </p>
        ) : null}

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
