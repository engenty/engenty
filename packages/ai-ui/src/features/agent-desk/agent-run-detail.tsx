// One run, opened in place from the Runs tab.
//
// A row told you a run failed; it could not tell you why. The detail is the
// Trajectory ledger the run actually wrote, so "succeeded" and "failed" stop
// being the end of the story. Folded from durable `GET /ai/v1/runs/:id/events`,
// not the live debug firehose — it survives a reload.
import {
  buildInspectorTrajectory,
  runEventRecordsToAgUi,
  runTraceStats,
  SYSTEM_INSTRUCTIONS_NOT_CAPTURED,
} from "@engenty/ag-ui-bridge";
import { useQuery } from "@engenty/query-client";
import { Badge, Button, Skeleton } from "@engenty/ui-core";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useDeveloperModeEnabled } from "../../components/ag-ui-inspector/ag-ui-inspector-hooks.js";
import { TrajectoryRowView } from "../../components/ag-ui-inspector/ag-ui-inspector-panels.js";
import {
  type LedgerTextMode,
  LedgerTextModeSwitch,
} from "../../components/ag-ui-inspector/inspector-ledger-text.js";
import { TrajectoryGantt } from "../../components/ag-ui-inspector/trajectory-gantt.js";
import { PromptPreviewDialog } from "../../components/copilot/context-usage/prompt-preview-dialog.js";
import type { AiAgentRunRecord } from "../../lib/admin/ai-runtime-types.js";
import { getAiRun, getAiRunEvents } from "../../lib/runtime/runs-api.js";
import { WorkflowRunView } from "../workflow-canvas/workflow-run-view.js";
import { runDuration, runStamp } from "./run-format.js";

/** A graph run's own row is agent `workflow:<graph id>`. */
const WORKFLOW_RUN_AGENT_PREFIX = "workflow:";

function tokenLine(run: AiAgentRunRecord, locale: string): string {
  const usage = run.usage_json;
  if (!usage) {
    return "—";
  }
  const input = Number(usage.input_tokens);
  const output = Number(usage.output_tokens);
  const parts: string[] = [];
  if (Number.isFinite(input) && input > 0) {
    parts.push(`${input.toLocaleString(locale)} in`);
  }
  if (Number.isFinite(output) && output > 0) {
    parts.push(`${output.toLocaleString(locale)} out`);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function AgentRunDetail({
  locale = "en",
  onBack,
  runId,
}: {
  locale?: string;
  onBack: () => void;
  runId: string;
}) {
  const isDe = locale.startsWith("de");
  const developerMode = useDeveloperModeEnabled();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [textMode, setTextMode] = useState<LedgerTextMode>("markdown");
  const runQuery = useQuery({
    queryFn: ({ signal }) => getAiRun(runId, signal),
    queryKey: ["ai", "run", runId],
  });
  const eventsQuery = useQuery({
    queryFn: ({ signal }) => getAiRunEvents(runId, signal),
    queryKey: ["ai", "run-events", runId],
  });

  const back = (
    <Button
      className="-ml-2 gap-1 text-muted-foreground"
      onClick={onBack}
      size="sm"
      type="button"
      variant="ghost"
    >
      <ChevronLeft className="size-4" />
      {isDe ? "Läufe" : "Runs"}
    </Button>
  );

  if (runQuery.isPending) {
    return (
      <div className="space-y-3">
        {back}
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (runQuery.isError || !runQuery.data) {
    return (
      <div className="space-y-3">
        {back}
        <p className="px-1 text-destructive text-sm">
          {isDe
            ? "Dieser Lauf konnte nicht geladen werden."
            : "This run could not be loaded."}
        </p>
      </div>
    );
  }

  const { run, summary } = runQuery.data;
  // A workflow's run (a routine's fire) is the graph filling in: its steps,
  // where it stands, and the gate to answer when it waits on someone. The
  // agents' own work is in the chat beside it.
  if (run.agent_id.startsWith(WORKFLOW_RUN_AGENT_PREFIX)) {
    return (
      <div className="space-y-3">
        {back}
        <div className="ui-card-panel overflow-hidden">
          <WorkflowRunView layout="pane" runId={runId} />
        </div>
      </div>
    );
  }
  const events = eventsQuery.data?.events ?? [];
  const agUi = runEventRecordsToAgUi(events);
  const rows = buildInspectorTrajectory(agUi);
  const stats = runTraceStats(rows);
  const missingSystemInstructions = rows.some(
    (row) =>
      row.kind === "system" &&
      row.text.startsWith(SYSTEM_INSTRUCTIONS_NOT_CAPTURED)
  );

  return (
    <div className="space-y-4">
      {back}

      <div className="ui-card-panel space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold text-base">
              {summary.summary?.trim() || (isDe ? "Lauf" : "Run")}
            </h2>
            <p className="mt-1 text-muted-foreground text-xs tabular-nums">
              {runStamp(summary.started_at ?? summary.created_at, locale)}
            </p>
          </div>
          <Badge variant="outline">{summary.status}</Badge>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">
              {isDe ? "Ausgelöst durch" : "Trigger"}
            </dt>
            <dd className="mt-0.5 font-medium">
              {summary.trigger ?? (isDe ? "unbekannt" : "unknown")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {isDe ? "Beendet" : "Finished"}
            </dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {runStamp(summary.finished_at, locale) || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {isDe ? "Dauer" : "Duration"}
            </dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {runDuration(summary) ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tokens</dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {tokenLine(run, locale)}
            </dd>
          </div>
        </dl>
        <p className="text-muted-foreground text-xs tabular-nums">
          {isDe ? "Turns" : "Turns"} {stats.turns}
          {" · "}
          {isDe ? "Modellschritte" : "Model steps"} {stats.llmCalls}
          {" · "}
          {isDe ? "Tools" : "Tools"} {stats.toolCalls}
        </p>

        {summary.error ? (
          <p className="whitespace-pre-wrap break-words rounded-md bg-destructive/10 px-3 py-2 text-destructive text-xs">
            {summary.error}
          </p>
        ) : null}
      </div>

      {missingSystemInstructions ? (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-amber-900 text-xs dark:text-amber-200">
          {isDe
            ? "Dieser Lauf hat Tool-Namen gespeichert, aber nicht die zusammengesetzten System-Anweisungen. Neuere Läufe erfassen die Anweisungen."
            : "This run stored tool names but not the assembled system instructions. Newer runs capture the instructions."}
        </p>
      ) : null}

      {developerMode && run.thread_id ? (
        <div className="flex justify-end">
          <Button
            onClick={() => setPreviewOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            {isDe ? "Prompt-Aufschlüsselung" : "Prompt breakdown"}
          </Button>
          <PromptPreviewDialog
            onOpenChange={setPreviewOpen}
            open={previewOpen}
            threadId={run.thread_id}
          />
        </div>
      ) : null}

      {eventsQuery.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : rows.length === 0 ? (
        <p className="px-1 text-muted-foreground text-sm">
          {isDe
            ? "Dieser Lauf hat keine Ereignisse aufgezeichnet."
            : "This run recorded no events."}
        </p>
      ) : (
        <div className="ui-card-elevated overflow-hidden font-mono text-xs">
          <div className="flex items-center justify-end gap-1 border-border-soft border-b px-2 py-1">
            <LedgerTextModeSwitch onChange={setTextMode} value={textMode} />
          </div>
          <TrajectoryGantt
            hoveredId={hoveredRowId}
            onHover={setHoveredRowId}
            onSelect={(rowId) => {
              setSelectedRowId(rowId);
              setExpandedRowId(rowId);
            }}
            rows={rows}
            selectedId={selectedRowId}
          />
          <div className="w-full divide-y divide-border-soft">
            {rows.map((row) => (
              <TrajectoryRowView
                expanded={row.id === expandedRowId}
                highlighted={
                  row.id === hoveredRowId || row.id === selectedRowId
                }
                key={row.id}
                onHover={setHoveredRowId}
                onToggleExpand={() =>
                  setExpandedRowId((current) =>
                    current === row.id ? null : row.id
                  )
                }
                row={row}
                textMode={textMode}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
