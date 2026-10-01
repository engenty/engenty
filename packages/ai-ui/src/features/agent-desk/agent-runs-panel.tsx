// Everything this agent has actually done — chat turns and unattended work in
// one feed, newest first.
//
// Runs used to be treated as internal execution plumbing. They stop being that
// the moment an agent works on a schedule with nobody watching: the only way to
// trust a routine is to see the runs it produced, whether they succeeded, and
// what failed when they did not.
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { Badge, Button, CardSection, Skeleton } from "@engenty/ui-core";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  MinusCircle,
  Square,
} from "lucide-react";
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import type { AiAgentRunSummary } from "../../lib/admin/ai-runtime-types.js";
import { cancelAiRun, listAgentRuns } from "../../lib/runtime/runs-api.js";
import { AgentRunDetail } from "./agent-run-detail.js";
import { runDuration, runStamp } from "./run-format.js";

type RunStatus = AiAgentRunSummary["status"];

const TERMINAL_OK: ReadonlySet<string> = new Set(["succeeded"]);
const TERMINAL_BAD: ReadonlySet<string> = new Set(["failed", "cancelled"]);

function StatusIcon({ status }: { status: RunStatus }) {
  if (TERMINAL_OK.has(status)) {
    return <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />;
  }
  if (TERMINAL_BAD.has(status)) {
    return <AlertCircle className="size-4 shrink-0 text-destructive" />;
  }
  if (status === "running" || status === "queued") {
    return <Loader2 className="size-4 shrink-0 animate-spin text-primary" />;
  }
  // waiting_for_input / waiting_for_approval / paused / requires_action.
  return <MinusCircle className="size-4 shrink-0 text-muted-foreground" />;
}

/** Runs a person can stop: executing or queued, not parked on an ask. */
const STOPPABLE: ReadonlySet<string> = new Set(["queued", "running"]);

/** Nothing pushes run state to the browser: poll while any run is live. */
const LIVE_RUNS_POLL_MS = 5000;

function useAgentRunsQuery(agentId: string) {
  return useQuery({
    queryFn: ({ signal }) => listAgentRuns(agentId, { limit: 50, signal }),
    queryKey: ["ai", "agent-runs", agentId],
    refetchInterval: (query) =>
      query.state.data?.runs.some((run) => STOPPABLE.has(run.status))
        ? LIVE_RUNS_POLL_MS
        : false,
  });
}

function useStopRun(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      cancelAiRun(runId, { reason: "user_cancel" }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["ai", "agent-runs"] }),
  });
}

function RunRow({
  locale,
  onOpen,
  onStop,
  run,
  stopping,
}: {
  locale: string;
  onOpen: () => void;
  onStop?: () => void;
  run: AiAgentRunSummary;
  stopping?: boolean;
}) {
  const { t } = useTranslation("ai-ui");
  const ran = runDuration(run);
  return (
    <div className="flex items-start transition-colors focus-within:bg-muted/50 hover:bg-muted/50">
      <button
        className="flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2 text-left focus-visible:outline-none"
        onClick={onOpen}
        type="button"
      >
        <span className="pt-0.5">
          <StatusIcon status={run.status} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">
            {run.summary?.trim() || "Run"}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs">
            <span className="tabular-nums">
              {runStamp(run.started_at ?? run.created_at, locale)}
            </span>
            {ran ? <span className="tabular-nums">· {ran}</span> : null}
          </p>
          {run.error ? (
            <p className="mt-1 break-words text-destructive text-xs">
              {run.error}
            </p>
          ) : null}
        </div>
        <Badge className="shrink-0" variant="outline">
          {run.status}
        </Badge>
      </button>
      {onStop && STOPPABLE.has(run.status) ? (
        <Button
          aria-label={t("agentDesk.runs.stop")}
          className="mt-1.5 mr-2 size-7 shrink-0"
          disabled={stopping}
          onClick={onStop}
          size="icon"
          title={t("agentDesk.runs.stop")}
          type="button"
          variant="ghost"
        >
          <Square aria-hidden className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The newest three runs, at the foot of the settings drawer. Enough to see
 * that the agent IS running and whether the last one failed; the rest is a
 * click away in the runs drawer, which this hands over to (`panel=runs`,
 * plus the run id when a row is what was clicked).
 */
export function AgentRecentRuns({
  agentId,
  locale = "en",
}: {
  agentId: string;
  locale?: string;
}) {
  const { t } = useTranslation("ai-ui");
  const [searchParams, setSearchParams] = useSearchParams();
  const runsQuery = useAgentRunsQuery(agentId);
  const stopRun = useStopRun(agentId);
  const openRuns = useCallback(
    (runId: string | null) => {
      const next = new URLSearchParams(searchParams);
      next.set("panel", "runs");
      next.delete("tab");
      if (runId) {
        next.set("run", runId);
      }
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const runs = (runsQuery.data?.runs ?? []).slice(0, 3);
  if (runs.length === 0) {
    return null;
  }

  return (
    <CardSection
      cardVariant="flush"
      headerVariant="compact"
      title={t("agentDesk.drawer.runs")}
    >
      <ul className="divide-y divide-border">
        {runs.map((run) => (
          <li key={run.id}>
            <RunRow
              locale={locale}
              onOpen={() => openRuns(run.id)}
              onStop={() => stopRun.mutate(run.id)}
              run={run}
              stopping={stopRun.isPending}
            />
          </li>
        ))}
      </ul>
      <Button
        className="w-full justify-center rounded-none border-border-soft border-t"
        onClick={() => openRuns(null)}
        size="sm"
        type="button"
        variant="ghost"
      >
        {t("agentDesk.manage.allRuns")}
        <ChevronRight className="ml-1 size-3.5" />
      </Button>
    </CardSection>
  );
}

export function AgentRunsPanel({
  agentId,
  locale = "en",
}: {
  agentId: string;
  locale?: string;
}) {
  const isDe = locale.startsWith("de");
  // URL state, like the Plan tab's routine/flow: back, forward and reload land
  // on the run you were reading, and the tab never changes underneath you.
  const [searchParams, setSearchParams] = useSearchParams();
  const openRunId = searchParams.get("run");
  const setOpenRunId = useCallback(
    (runId: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (runId) {
        next.set("run", runId);
      } else {
        next.delete("run");
      }
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams]
  );
  const runsQuery = useAgentRunsQuery(agentId);
  const stopRun = useStopRun(agentId);

  if (openRunId) {
    return (
      <AgentRunDetail
        locale={locale}
        onBack={() => setOpenRunId(null)}
        runId={openRunId}
      />
    );
  }

  if (runsQuery.isPending) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((row) => (
          <Skeleton className="h-14 w-full" key={row} />
        ))}
      </div>
    );
  }

  if (runsQuery.isError) {
    return (
      <p className="px-1 text-destructive text-sm">Runs could not be loaded.</p>
    );
  }

  const runs = runsQuery.data?.runs ?? [];
  // Runs older than the registry row happened under the same agent KEY before
  // this agent was hired onto it. Real work, so it stays — but it is marked,
  // because a fresh agent listing yesterday's runs as its own reads as a bug.
  const hiredAt = runsQuery.data?.agent_registered_at
    ? Date.parse(runsQuery.data.agent_registered_at)
    : Number.NaN;
  const predates = (run: AiAgentRunSummary): boolean => {
    if (Number.isNaN(hiredAt)) {
      return false;
    }
    const started = Date.parse(run.started_at ?? run.created_at ?? "");
    return Number.isFinite(started) && started < hiredAt;
  };
  const firstEarlierIndex = runs.findIndex(predates);
  if (runs.length === 0) {
    return (
      <p className="px-1 text-muted-foreground text-sm">
        This agent has not run yet.
      </p>
    );
  }

  return (
    <ul className="ui-card-elevated divide-y divide-border">
      {runs.map((run, index) => (
        <li key={run.id}>
          {index === firstEarlierIndex ? (
            <p className="border-border border-b bg-muted/40 px-4 py-1.5 text-muted-foreground text-xs">
              {isDe
                ? `Vor dieser Einstellung — dieselbe Agent-ID, ${runStamp(
                    runsQuery.data?.agent_registered_at,
                    locale
                  )} übernommen`
                : `Before this hire — same agent id, taken over ${runStamp(
                    runsQuery.data?.agent_registered_at,
                    locale
                  )}`}
            </p>
          ) : null}
          <RunRow
            locale={locale}
            onOpen={() => setOpenRunId(run.id)}
            onStop={() => stopRun.mutate(run.id)}
            run={run}
            stopping={stopRun.isPending}
          />
        </li>
      ))}
    </ul>
  );
}
