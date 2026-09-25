// "Run now" for one routine, wherever it is pressed — the page's button and
// the pane's menu share the fire's state through the mutation cache, so the
// page says why a fire was skipped no matter which of the two started it.
import { useMutationState } from "@engenty/query-client";
import type { RoutineSkipReason, RunRoutineResult } from "./routines-api.js";
import { routinesKeys, useRunRoutineNowMutation } from "./routines-queries.js";

const SKIP_REASONS: Record<RoutineSkipReason, [string, string]> = {
  disabled: ["Die Routine ist deaktiviert.", "This routine is switched off."],
  overlap: [
    "Der vorige Lauf dieser Routine läuft noch.",
    "This routine's previous run is still active.",
  ],
  quiet_hours: [
    "Die Routine ist gerade in ihren Ruhezeiten.",
    "This routine is inside its quiet hours.",
  ],
};

/** Why a fire changed nothing: the routine is off, quiet, or still running. */
export function skipReasonText(
  reason: RoutineSkipReason,
  locale: string
): string {
  const [de, en] = SKIP_REASONS[reason] ?? [
    "Der Lauf wurde übersprungen.",
    "The run was skipped.",
  ];
  return locale.startsWith("de") ? de : en;
}

export function useRoutineRunNow(routineId: string) {
  const mutation = useRunRoutineNowMutation();
  const fires = useMutationState({
    filters: {
      mutationKey: routinesKeys.runNow(),
      predicate: (entry) => entry.state.variables === routineId,
    },
    select: (entry) => entry.state,
  });
  const last = fires.at(-1);
  return {
    isPending: fires.some((fire) => fire.status === "pending"),
    run: () => mutation.mutate(routineId),
    skipped:
      last?.status === "success"
        ? ((last.data as RunRoutineResult).skipped ?? null)
        : null,
  };
}
