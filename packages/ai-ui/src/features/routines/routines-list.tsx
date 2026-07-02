import { Button, Skeleton, Switch } from "@engenty/ui-core";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Loader2,
  Play,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { RoutineTriggerChip } from "./routine-trigger-chip.js";
import type { RoutineDto } from "./routines-api.js";
import {
  usePatchRoutineStateMutation,
  useRoutinesListQuery,
  useRunRoutineNowMutation,
} from "./routines-queries.js";

export interface RoutinesListProps {
  agentIdFilter?: string | null;
  locale?: string;
  onSelectRoutine: (routine: RoutineDto) => void;
}

export function RoutinesList({
  agentIdFilter,
  onSelectRoutine,
  locale = "en",
}: RoutinesListProps) {
  const isDe = locale.startsWith("de");
  const { data, isPending, isError } = useRoutinesListQuery(true);
  const patchMutation = usePatchRoutineStateMutation();
  const runMutation = useRunRoutineNowMutation();
  const [runningId, setRunningId] = useState<string | null>(null);

  const filteredRoutines = useMemo(() => {
    const list = data?.routines ?? [];
    if (!agentIdFilter) {
      return list;
    }
    return list.filter((r) => r.agent_id === agentIdFilter);
  }, [data?.routines, agentIdFilter]);

  const handleToggle = useCallback(
    (routineId: string, checked: boolean) => {
      patchMutation.mutate({
        id: routineId,
        patch: { enabled: checked },
      });
    },
    [patchMutation]
  );

  const handleRunNow = useCallback(
    async (routineId: string) => {
      setRunningId(routineId);
      try {
        await runMutation.mutateAsync(routineId);
      } finally {
        setRunningId(null);
      }
    },
    [runMutation]
  );

  if (isPending) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            className="flex items-center justify-between rounded-lg border p-4"
            key={i}
          >
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-60" />
            </div>
            <Skeleton className="h-6 w-12 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-8 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="font-medium text-foreground text-sm">
          {isDe
            ? "Laden der Routinen fehlgeschlagen"
            : "Failed to load routines"}
        </p>
      </div>
    );
  }

  if (filteredRoutines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-12 text-center text-muted-foreground text-sm">
        <Calendar className="h-8 w-8 text-muted-foreground/40" />
        <p>{isDe ? "Keine Routinen gefunden" : "No routines found"}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-border border-b bg-muted/30 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
            <th className="px-4 py-3.5">{isDe ? "Routine" : "Routine"}</th>
            <th className="px-4 py-3.5">{isDe ? "Quelle" : "Source"}</th>
            <th className="px-4 py-3.5">
              {isDe ? "Trigger / Zeitplan" : "Triggers / Schedule"}
            </th>
            <th className="px-4 py-3.5">
              {isDe ? "Letzter Lauf" : "Last Run"}
            </th>
            <th className="px-4 py-3.5 text-center">
              {isDe ? "Aktiv" : "Enabled"}
            </th>
            <th className="px-4 py-3.5 text-right">
              {isDe ? "Aktionen" : "Actions"}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-sm">
          {filteredRoutines.map((routine) => {
            const isFailing = routine.last_result?.startsWith("error:");
            const isRunning = runningId === routine.id;

            return (
              <tr
                className="group cursor-pointer transition-colors hover:bg-muted/30"
                key={routine.id}
                onClick={() => onSelectRoutine(routine)}
              >
                {/* Routine Name & Desc */}
                <td className="max-w-xs px-4 py-3.5 sm:max-w-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground transition-colors group-hover:text-primary">
                      {routine.name}
                    </p>
                    {routine.description && (
                      <p className="mt-0.5 truncate text-muted-foreground text-xs">
                        {routine.description}
                      </p>
                    )}
                  </div>
                </td>

                {/* Source Badge */}
                <td className="whitespace-nowrap px-4 py-3.5">
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
                </td>

                {/* Trigger Chips */}
                <td
                  className="px-4 py-3.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <RoutineTriggerChip locale={locale} routine={routine} />
                </td>

                {/* Last Run Status */}
                <td className="whitespace-nowrap px-4 py-3.5">
                  {routine.last_run_at ? (
                    <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                      {isFailing ? (
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      )}
                      <span className="tabular-nums">
                        {new Date(routine.last_run_at).toLocaleDateString()}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs italic">
                      {isDe ? "Nie gelaufen" : "Never run"}
                    </span>
                  )}
                </td>

                {/* Enabled Switch */}
                <td
                  className="px-4 py-3.5 text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="inline-flex w-full justify-center">
                    <Switch
                      checked={routine.enabled}
                      onCheckedChange={(checked) =>
                        handleToggle(routine.id, checked)
                      }
                    />
                  </div>
                </td>

                {/* Quick Run Now Button */}
                <td
                  className="whitespace-nowrap px-4 py-3.5 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    className="h-8 gap-1 font-medium text-xs"
                    disabled={isRunning || !routine.enabled}
                    onClick={() => handleRunNow(routine.id)}
                    size="sm"
                    variant="outline"
                  >
                    {isRunning ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3 fill-current" />
                    )}
                    {isDe ? "Start" : "Run"}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
