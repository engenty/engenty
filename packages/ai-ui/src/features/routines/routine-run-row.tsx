// One run in a routine's history. A run still open — working, or waiting on
// a person — can be cancelled here: while it is open, every new start of the
// routine is skipped as overlap.
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
} from "@engenty/ui-core";
import { useState } from "react";
import type { RoutineRunDto } from "./routines-api.js";
import { useCancelRoutineRunMutation } from "./routines-queries.js";

const OPEN_STATUS = /requires_action|paused|sleeping|dispatched|running/i;

/** A finished run is green unless its status says otherwise. */
function runToneClass(status: string): string {
  if (/fail|error|cancel/i.test(status)) {
    return "bg-red-500/10 text-red-600 dark:text-red-400";
  }
  if (OPEN_STATUS.test(status)) {
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  }
  return "bg-green-500/10 text-green-600 dark:text-green-400";
}

export function RoutineRunRow({
  locale,
  routineId,
  run,
}: {
  locale: string;
  routineId: string;
  run: RoutineRunDto;
}) {
  const isDe = locale.startsWith("de");
  const [confirming, setConfirming] = useState(false);
  const cancel = useCancelRoutineRunMutation(routineId);
  const runId = run.run_id;
  const open = OPEN_STATUS.test(run.status) && runId !== null;

  return (
    <li className="space-y-1 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground tabular-nums">
          {new Date(run.created_at).toLocaleString()}
        </span>
        <div className="flex items-center gap-1.5">
          {run.trigger ? (
            <span className="font-mono text-[10px] text-muted-foreground">
              {run.trigger}
            </span>
          ) : null}
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${runToneClass(run.status)}`}
          >
            {run.status}
          </span>
          {open ? (
            <Button
              className="h-6 px-2 text-xs"
              disabled={cancel.isPending}
              onClick={() => setConfirming(true)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {isDe ? "Abbrechen" : "Cancel"}
            </Button>
          ) : null}
        </div>
      </div>
      {run.summary || run.reason ? (
        <p className="break-words text-[11px] text-muted-foreground leading-relaxed">
          {run.summary ?? run.reason}
        </p>
      ) : null}
      {cancel.isError ? (
        <p className="text-[11px] text-destructive">
          {isDe
            ? "Der Lauf konnte nicht abgebrochen werden."
            : "The run could not be cancelled."}
        </p>
      ) : null}
      <AlertDialog onOpenChange={setConfirming} open={confirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isDe ? "Lauf abbrechen?" : "Cancel this run?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isDe
                ? "Was der Lauf schon angelegt hat, bleibt. Der Rest passiert nicht mehr, und die Routine kann wieder neu starten."
                : "What it already wrote stays. The rest never happens, and the routine can start again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancel.isPending}>
              {isDe ? "Weiterlaufen lassen" : "Keep it"}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cancel.isPending}
              onClick={async (event) => {
                event.preventDefault();
                if (!runId) {
                  return;
                }
                await cancel.mutateAsync(runId).catch(() => undefined);
                setConfirming(false);
              }}
            >
              {isDe ? "Lauf abbrechen" : "Cancel run"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
