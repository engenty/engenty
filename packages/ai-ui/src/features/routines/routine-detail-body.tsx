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
import { Check, Edit, Loader2, Pencil, Play, Trash2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDeveloperModeEnabled } from "../../components/ag-ui-inspector/ag-ui-inspector-hooks.js";
import { MessageResponse } from "../../components/presentation.js";
import { COMPACT_MARKDOWN_PROSE_CLASSNAME } from "../../lib/admin/compact-markdown-prose-classname.js";
import { buildAgentDetailPath } from "../agents-workspace/agent-workspace-paths.js";
import { RoutineCanvas } from "./routine-canvas.js";
import { RoutineOutcomeList } from "./routine-outcome-list.js";
import { RoutineOutcomesEditor } from "./routine-outcomes-editor.js";
import { RoutinePromptEditor } from "./routine-prompt-editor.js";
import { skipReasonText, useRoutineRunNow } from "./routine-run-now.js";
import { RoutineRunRow } from "./routine-run-row.js";
import { RoutineTriggerList } from "./routine-trigger-list.js";
import { RoutineTriggersEditor } from "./routine-triggers-editor.js";
import type { RoutineDto } from "./routines-api.js";
import {
  usePatchRoutineStateMutation,
  useRoutineRunsQuery,
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

/** The pen switches the section to its editor in place; the check switches back. */
function EditToggle({
  editing,
  locale,
  onToggle,
}: {
  editing: boolean;
  locale: string;
  onToggle: () => void;
}) {
  const isDe = locale.startsWith("de");
  return (
    <Button
      aria-label={
        editing ? (isDe ? "Fertig" : "Done") : isDe ? "Bearbeiten" : "Edit"
      }
      className="size-7 text-muted-foreground"
      onClick={onToggle}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      {editing ? (
        <Check className="size-3.5" />
      ) : (
        <Pencil className="size-3.5" />
      )}
    </Button>
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
  // A fire that changed nothing must not read as "started": the routine is
  // off, it is inside its quiet hours, or its previous run is still active.
  const runNow = useRoutineRunNow(routine.id);
  const runsQuery = useRoutineRunsQuery(routine.id, runNow.isPending);
  const isCustom = routine.source === "custom";
  const [editingTriggers, setEditingTriggers] = useState(false);
  const [editingOutcomes, setEditingOutcomes] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const triggersRef = useRef<HTMLDivElement>(null);
  const outcomesRef = useRef<HTMLDivElement>(null);

  // The canvas's nodes open the same editors, and bring them into view.
  const editTriggers = useCallback(() => {
    setEditingTriggers(true);
    triggersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const editOutcomes = useCallback(() => {
    setEditingOutcomes(true);
    outcomesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const runs = runsQuery.data?.runs ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="gap-2 font-medium"
          disabled={runNow.isPending || !routine.enabled}
          onClick={runNow.run}
          size="sm"
          type="button"
        >
          {runNow.isPending ? (
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

        <div className="ml-auto">
          <RoutineEnabledToggle locale={locale} routine={routine} />
        </div>
      </div>

      {runNow.skipped ? (
        <p
          className="rounded-md bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-400"
          role="status"
        >
          {skipReasonText(runNow.skipped, locale)}
        </p>
      ) : null}

      {/* What wakes it comes first — the canvas below shows the same sources
          as nodes, this is the readable inventory. */}
      <div className="scroll-mt-3 space-y-2" ref={triggersRef}>
        <div className="flex items-center justify-between gap-2">
          <SectionHeading>{isDe ? "Auslöser" : "Trigger"}</SectionHeading>
          {isCustom ? (
            <EditToggle
              editing={editingTriggers}
              locale={locale}
              onToggle={() => setEditingTriggers((open) => !open)}
            />
          ) : null}
        </div>
        {editingTriggers ? (
          <RoutineTriggersEditor locale={locale} routine={routine} />
        ) : (
          <RoutineTriggerList locale={locale} routine={routine} />
        )}
      </div>

      {/* What runs, and what has to be true at the end. */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SectionHeading>
            {routine.prompt
              ? t("routines.detail.prompt")
              : t("routines.detail.workflow")}
          </SectionHeading>
          {/* The editor carries its own Save and Cancel. */}
          {isCustom && routine.prompt && !editingPrompt ? (
            <EditToggle
              editing={false}
              locale={locale}
              onToggle={() => setEditingPrompt(true)}
            />
          ) : null}
        </div>
        {routine.prompt && editingPrompt ? (
          <RoutinePromptEditor
            locale={locale}
            onDone={() => setEditingPrompt(false)}
            routine={routine}
          />
        ) : (
          <div className="ui-card-panel p-3.5">
            {routine.prompt ? (
              // A prompt routine IS its prompt — the workflow behind it is a
              // storage detail, not something to draw. A long prompt scrolls
              // inside the card.
              <div className="max-h-72 overflow-y-auto break-words pr-1">
                <MessageResponse className={COMPACT_MARKDOWN_PROSE_CLASSNAME}>
                  {routine.prompt}
                </MessageResponse>
              </div>
            ) : (
              <RoutineCanvas
                locale={locale}
                onOpenAction={onOpenAction}
                onOpenOutcomes={isCustom ? editOutcomes : undefined}
                onOpenTriggers={isCustom ? editTriggers : undefined}
                routine={routine}
              />
            )}
          </div>
        )}
        {routine.next_due_at ? (
          <p className="text-muted-foreground text-xs tabular-nums">
            {isDe
              ? `Nächster Lauf: ${new Date(routine.next_due_at).toLocaleString()}`
              : `Next execution: ${new Date(routine.next_due_at).toLocaleString()}`}
          </p>
        ) : null}
      </div>

      <div className="scroll-mt-3 space-y-2" ref={outcomesRef}>
        <div className="flex items-center justify-between gap-2">
          <SectionHeading>{t("routines.outcomes.title")}</SectionHeading>
          {isCustom ? (
            <EditToggle
              editing={editingOutcomes}
              locale={locale}
              onToggle={() => setEditingOutcomes((open) => !open)}
            />
          ) : null}
        </div>
        {editingOutcomes ? (
          <RoutineOutcomesEditor locale={locale} routine={routine} />
        ) : (
          <RoutineOutcomeList
            locale={locale}
            onEdit={isCustom ? editOutcomes : undefined}
            routine={routine}
          />
        )}
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
              <RoutineRunRow
                key={run.id}
                locale={locale}
                routineId={routine.id}
                run={run}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Deleting ends the page — last, away from everyday actions. */}
      {isCustom && onDeleteCustom ? (
        <div className="border-border-soft border-t pt-4">
          <Button
            className="gap-1.5 text-destructive hover:bg-destructive/10"
            onClick={() => onDeleteCustom(routine.id)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isDe ? "Routine löschen" : "Delete routine"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
