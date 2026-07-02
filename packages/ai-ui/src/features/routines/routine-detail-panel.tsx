import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Switch,
} from "@engenty/ui-core";
import {
  Calendar,
  Edit,
  ExternalLink,
  Loader2,
  Play,
  Trash2,
} from "lucide-react";
import { useCallback } from "react";
import { Link } from "react-router-dom";
import { RoutineTriggerChip } from "./routine-trigger-chip.js";
import type { RoutineDto } from "./routines-api.js";
import {
  usePatchRoutineStateMutation,
  useRunRoutineNowMutation,
} from "./routines-queries.js";

export interface RoutineDetailPanelProps {
  locale?: string;
  onDeleteCustom?: (id: string) => void;
  onEditCustom?: (routine: RoutineDto) => void;
  onOpenChange: (open: boolean) => void;
  routine: RoutineDto | null;
}

export function RoutineDetailPanel({
  routine,
  onOpenChange,
  onEditCustom,
  onDeleteCustom,
  locale = "en",
}: RoutineDetailPanelProps) {
  const isDe = locale.startsWith("de");
  const patchMutation = usePatchRoutineStateMutation();
  const runMutation = useRunRoutineNowMutation();

  const handleToggleActive = useCallback(
    (checked: boolean) => {
      if (!routine) {
        return;
      }
      patchMutation.mutate({
        id: routine.id,
        patch: { enabled: checked },
      });
    },
    [routine, patchMutation]
  );

  const handleRunNow = useCallback(() => {
    if (!routine) {
      return;
    }
    runMutation.mutate(routine.id);
  }, [routine, runMutation]);

  if (!routine) {
    return null;
  }

  const isCustom = routine.source === "custom";

  return (
    <Dialog onOpenChange={onOpenChange} open={!!routine}>
      <DialogContent className="data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-border border-l bg-background p-6 shadow-lg outline-none transition ease-in-out data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:duration-300 data-[state=open]:duration-500">
        <DialogHeader className="space-y-1.5 border-b pb-4">
          <div className="flex items-center justify-between">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs ${
                routine.source === "custom"
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {routine.source === "custom"
                ? isDe
                  ? "Eigene"
                  : "Custom"
                : isDe
                  ? "Modul"
                  : "Module"}
            </span>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">
                {isDe ? "Aktiviert" : "Active"}
              </span>
              <Switch
                checked={
                  patchMutation.isPending ? !routine.enabled : routine.enabled
                }
                disabled={patchMutation.isPending}
                onCheckedChange={handleToggleActive}
              />
            </div>
          </div>

          <DialogTitle className="font-semibold text-xl tracking-tight">
            {routine.name}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {routine.description ||
              (isDe
                ? "Keine Beschreibung hinterlegt"
                : "No description provided")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto py-6">
          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              className="gap-2 font-medium"
              disabled={runMutation.isPending || !routine.enabled}
              onClick={handleRunNow}
              size="sm"
              type="button"
            >
              {runMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current" />
              )}
              {isDe ? "Jetzt ausführen" : "Run now"}
            </Button>

            {isCustom && onEditCustom && (
              <Button
                className="gap-1.5"
                onClick={() => onEditCustom(routine)}
                size="sm"
                variant="outline"
              >
                <Edit className="h-3.5 w-3.5" />
                {isDe ? "Bearbeiten" : "Edit"}
              </Button>
            )}

            {isCustom && onDeleteCustom && (
              <Button
                className="gap-1.5 text-destructive hover:bg-destructive/10"
                onClick={() => onDeleteCustom(routine.id)}
                size="sm"
                variant="outline"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isDe ? "Löschen" : "Delete"}
              </Button>
            )}
          </div>

          {/* Trigger list */}
          <div className="space-y-2">
            <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
              {isDe ? "Trigger / Zeitplan" : "Triggers / Schedule"}
            </h4>
            <div className="flex items-center gap-2 rounded-lg border bg-card p-3">
              <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <RoutineTriggerChip locale={locale} routine={routine} />
              </div>
            </div>
            {routine.next_due_at && (
              <p className="text-muted-foreground text-xs tabular-nums">
                {isDe
                  ? `Nächster Lauf: ${new Date(routine.next_due_at).toLocaleString()}`
                  : `Next execution: ${new Date(routine.next_due_at).toLocaleString()}`}
              </p>
            )}
          </div>

          {/* Prompt/Instructions */}
          {routine.prompt && (
            <div className="space-y-2">
              <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                {isDe ? "Anweisungen" : "Instructions"}
              </h4>
              <div className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-3.5 font-mono text-foreground text-xs leading-relaxed">
                {routine.prompt}
              </div>
            </div>
          )}

          {/* Agent info */}
          {routine.agent_id && (
            <div className="space-y-2">
              <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                {isDe ? "Ausführender Agent" : "Executing Agent"}
              </h4>
              <div className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm">
                <div className="min-w-0">
                  <span className="font-medium font-mono text-foreground">
                    {routine.agent_id}
                  </span>
                </div>
                <Link
                  className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
                  to={`/admin/engenty/${encodeURIComponent(routine.agent_id)}`}
                >
                  {isDe ? "Agent verwalten" : "Manage agent"}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <p className="text-muted-foreground text-xs leading-normal">
                {isDe
                  ? `Diese Routine läuft automatisch im Hintergrund mit den Tools von ‹${routine.agent_id}› — ohne Rückfragen.`
                  : `This routine runs automatically in the background using the tools of ‹${routine.agent_id}› — without confirmation.`}
              </p>
            </div>
          )}

          {/* Last Run Info */}
          {(routine.last_run_at || routine.last_result) && (
            <div className="space-y-2">
              <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                {isDe ? "Letzter Lauf" : "Last Execution"}
              </h4>
              <div className="space-y-2.5 rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {routine.last_run_at
                      ? new Date(routine.last_run_at).toLocaleString()
                      : isDe
                        ? "Nie gelaufen"
                        : "Never executed"}
                  </span>
                  {routine.last_result && (
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        routine.last_result.startsWith("error:")
                          ? "bg-red-500/10 text-red-600 dark:text-red-400"
                          : "bg-green-500/10 text-green-600 dark:text-green-400"
                      }`}
                    >
                      {routine.last_result.startsWith("error:")
                        ? isDe
                          ? "Fehlgeschlagen"
                          : "Failed"
                        : isDe
                          ? "Erfolgreich"
                          : "Success"}
                    </span>
                  )}
                </div>

                {routine.last_result && (
                  <p className="break-words rounded border bg-muted/40 p-2.5 font-mono text-[11px] text-muted-foreground leading-relaxed">
                    {routine.last_result}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
