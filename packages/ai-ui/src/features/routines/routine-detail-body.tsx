// The routine's setup, without any chrome around it.
//
// One reading of the whole job: what wakes it, what it runs, what it may do
// unattended, and how its recent runs went. Firing it starts a RUN — the run
// history below is `GET /ai/v1/routines/:id/runs`, and there is no work item
// standing in for the routine to link away to.
//
// The host supplies the title and whatever navigation frames it (a dialog
// header, a back link).
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Switch } from "@engenty/ui-core";
import { Edit, Loader2, Play, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useDeveloperModeEnabled } from "../../components/ag-ui-inspector/ag-ui-inspector-hooks.js";
import { buildAgentDetailPath } from "../agents-workspace/agent-workspace-paths.js";
import { RoutineCanvas } from "./routine-canvas.js";
import { RoutineOutcomeList } from "./routine-outcome-list.js";
import { RoutineOutcomesDialog } from "./routine-outcomes-dialog.js";
import { RoutineTriggerList } from "./routine-trigger-list.js";
import { RoutineTriggersDialog } from "./routine-triggers-dialog.js";
import type { RoutineDto, RoutineRunDto } from "./routines-api.js";
import {
  usePatchRoutineStateMutation,
  useRoutineRunsQuery,
  useRunRoutineNowMutation,
} from "./routines-queries.js";

export interface RoutineDetailBodyProps {
  /** Hide the agent block where the host already names the specialist. */
  hideAgent?: boolean;
  locale?: string;
  onDeleteCustom?: (id: string) => void;
  onEditCustom?: (routine: RoutineDto) => void;
  /** Open the Action's canvas where the HOST wants it (in place, in a Space). */
  onOpenAction: (workflowId: string) => void;
  routine: RoutineDto;
}

function SectionHeading({ children }: { children: string }) {
  return (
    <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
      {children}
    </h4>
  );
}

/** The enable toggle — sits at the right end of the action row. */
export function RoutineEnabledToggle({
  locale = "en",
  routine,
}: {
  locale?: string;
  routine: RoutineDto;
}) {
  const isDe = locale.startsWith("de");
  const patchMutation = usePatchRoutineStateMutation();
  const handleToggleActive = useCallback(
    (checked: boolean) => {
      patchMutation.mutate({ id: routine.id, patch: { enabled: checked } });
    },
    [patchMutation, routine.id]
  );

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs">
        {isDe ? "Aktiviert" : "Active"}
      </span>
      <Switch
        checked={patchMutation.isPending ? !routine.enabled : routine.enabled}
        disabled={patchMutation.isPending}
        onCheckedChange={handleToggleActive}
      />
    </div>
  );
}

/** A finished run is green unless its status says otherwise. */
function runToneClass(status: string): string {
  if (/fail|error|cancel/i.test(status)) {
    return "bg-red-500/10 text-red-600 dark:text-red-400";
  }
  if (/requires_action|paused|sleeping|dispatched|running/i.test(status)) {
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  }
  return "bg-green-500/10 text-green-600 dark:text-green-400";
}

function RunRow({ run }: { run: RoutineRunDto }) {
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
        </div>
      </div>
      {run.summary || run.reason ? (
        <p className="break-words text-[11px] text-muted-foreground leading-relaxed">
          {run.summary ?? run.reason}
        </p>
      ) : null}
    </li>
  );
}

export function RoutineDetailBody({
  hideAgent = false,
  locale = "en",
  onDeleteCustom,
  onEditCustom,
  onOpenAction,
  routine,
}: RoutineDetailBodyProps) {
  const { t } = useTranslation("ai-ui");
  const isDe = locale.startsWith("de");
  // The agent page lives in the /admin/engenty debugging area.
  const developerMode = useDeveloperModeEnabled();
  const runMutation = useRunRoutineNowMutation();
  const runsQuery = useRoutineRunsQuery(routine.id, runMutation.isPending);
  const isCustom = routine.source === "custom";
  const [triggersOpen, setTriggersOpen] = useState(false);
  const [outcomesOpen, setOutcomesOpen] = useState(false);

  // A fire that changed nothing must not read as "started": the routine is
  // off, it is inside its quiet hours, or its previous run is still active.
  const [skipped, setSkipped] = useState<string | null>(null);
  const handleRunNow = useCallback(() => {
    setSkipped(null);
    runMutation.mutate(routine.id, {
      onSuccess: (result) => {
        if (!result.skipped) {
          return;
        }
        const reasons: Record<string, [string, string]> = {
          disabled: [
            "Die Routine ist deaktiviert.",
            "This routine is switched off.",
          ],
          overlap: [
            "Der vorige Lauf dieser Routine läuft noch.",
            "This routine's previous run is still active.",
          ],
          quiet_hours: [
            "Die Routine ist gerade in ihren Ruhezeiten.",
            "This routine is inside its quiet hours.",
          ],
        };
        const [de, en] = reasons[result.skipped] ?? [
          "Der Lauf wurde übersprungen.",
          "The run was skipped.",
        ];
        setSkipped(isDe ? de : en);
      },
    });
  }, [isDe, routine.id, runMutation]);

  const runs = runsQuery.data?.runs ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
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

        {isCustom && onEditCustom ? (
          <Button
            className="gap-1.5"
            onClick={() => onEditCustom(routine)}
            size="sm"
            variant="outline"
          >
            <Edit className="h-3.5 w-3.5" />
            {isDe ? "Bearbeiten" : "Edit"}
          </Button>
        ) : null}

        {isCustom && onDeleteCustom ? (
          <Button
            className="gap-1.5 text-destructive hover:bg-destructive/10"
            onClick={() => onDeleteCustom(routine.id)}
            size="sm"
            variant="outline"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isDe ? "Löschen" : "Delete"}
          </Button>
        ) : null}

        <div className="ml-auto">
          <RoutineEnabledToggle locale={locale} routine={routine} />
        </div>
      </div>

      {skipped ? (
        <p
          className="rounded-md bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-400"
          role="status"
        >
          {skipped}
        </p>
      ) : null}

      {/* What wakes it comes first — the canvas below shows the same sources
          as nodes, this is the readable inventory. */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SectionHeading>{isDe ? "Auslöser" : "Trigger"}</SectionHeading>
          {isCustom ? (
            <Button
              onClick={() => setTriggersOpen(true)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {isDe ? "Bearbeiten" : "Edit"}
            </Button>
          ) : null}
        </div>
        <RoutineTriggerList locale={locale} routine={routine} />
      </div>

      {/* What runs, and what has to be true at the end. */}
      <div className="space-y-2">
        <SectionHeading>
          {routine.prompt
            ? t("routines.detail.prompt")
            : t("routines.detail.workflow")}
        </SectionHeading>
        <div className="ui-card-panel p-3.5">
          {routine.prompt ? (
            // A prompt routine IS its prompt — the workflow behind it is a
            // storage detail, not something to draw.
            <div className="space-y-3">
              {/* A long prompt scrolls inside the card. */}
              <p className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words pr-1 text-sm leading-relaxed">
                {routine.prompt}
              </p>
            </div>
          ) : (
            <RoutineCanvas
              locale={locale}
              onOpenAction={onOpenAction}
              onOpenOutcomes={
                isCustom ? () => setOutcomesOpen(true) : undefined
              }
              onOpenTriggers={
                isCustom ? () => setTriggersOpen(true) : undefined
              }
              routine={routine}
            />
          )}
        </div>
        {routine.next_due_at ? (
          <p className="text-muted-foreground text-xs tabular-nums">
            {isDe
              ? `Nächster Lauf: ${new Date(routine.next_due_at).toLocaleString()}`
              : `Next execution: ${new Date(routine.next_due_at).toLocaleString()}`}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SectionHeading>{t("routines.outcomes.title")}</SectionHeading>
          {isCustom ? (
            <Button
              onClick={() => setOutcomesOpen(true)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {isDe ? "Bearbeiten" : "Edit"}
            </Button>
          ) : null}
        </div>
        <RoutineOutcomeList
          locale={locale}
          onEdit={isCustom ? () => setOutcomesOpen(true) : undefined}
          routine={routine}
        />
      </div>

      {hideAgent ? null : (
        <div className="space-y-2">
          <SectionHeading>
            {isDe ? "Ausführender Agent" : "Executing Agent"}
          </SectionHeading>
          <div className="ui-card-panel flex items-center justify-between p-3 text-sm">
            <span className="min-w-0 font-medium font-mono text-foreground">
              {routine.agent_id}
            </span>
            {developerMode ? (
              <Link
                className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
                to={buildAgentDetailPath(routine.agent_id)}
              >
                {isDe ? "Agent verwalten" : "Manage agent"}
              </Link>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs leading-normal">
            {isDe
              ? `Diese Routine läuft automatisch im Hintergrund mit den Tools von ‹${routine.agent_id}› — ohne Rückfragen.`
              : `This routine runs automatically in the background using the tools of ‹${routine.agent_id}› — without confirmation.`}
          </p>
        </div>
      )}

      {/* Every fire is a run, so the history IS the run index filtered to this
          routine — not a field on some other record. */}
      <div className="space-y-2">
        <SectionHeading>{isDe ? "Läufe" : "Runs"}</SectionHeading>
        {runs.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            {runsQuery.isPending
              ? isDe
                ? "Läufe werden geladen…"
                : "Loading runs…"
              : isDe
                ? "Diese Routine ist noch nie gelaufen."
                : "This routine has never run."}
          </p>
        ) : (
          <ul className="ui-card-panel divide-y divide-border">
            {runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </ul>
        )}
      </div>

      {isCustom ? (
        <>
          <RoutineTriggersDialog
            locale={locale}
            onOpenChange={setTriggersOpen}
            open={triggersOpen}
            routine={routine}
          />
          <RoutineOutcomesDialog
            locale={locale}
            onOpenChange={setOutcomesOpen}
            open={outcomesOpen}
            routine={routine}
          />
        </>
      ) : null}
    </div>
  );
}
