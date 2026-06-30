import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Card,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@engenty/ui-core";
import { Bot, ChevronDown, Copy, ExternalLink, Square } from "lucide-react";
import type { TaskActivity, TaskRun } from "../../src/schema/types.js";
import { formatAgentTypeKey } from "../lib/format-assignee.js";
import { resolveRunStarterLabel } from "../lib/resolve-run-starter.js";
import { isTaskRunLiveActive } from "../lib/task-run-live.js";

interface LiveTaskRunsPanelProps {
  activity?: TaskActivity[];
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  disabled?: boolean;
  onRelease?: (run: TaskRun) => void;
  onViewRun?: (run: TaskRun) => void;
  releasing?: boolean;
  runs: TaskRun[];
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60_000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }
  return date.toLocaleDateString();
}

function resolveStartedByLabel(
  run: TaskRun,
  activity: TaskActivity[] | undefined,
  assigneeProfiles?: Map<string, { full_name: string; id: string }>
): string | null {
  if (run.created_by_user_id && assigneeProfiles) {
    return (
      assigneeProfiles.get(run.created_by_user_id)?.full_name ??
      run.created_by_user_id.slice(0, 8)
    );
  }
  if (activity?.length) {
    return resolveRunStarterLabel(
      run.agent_session_run_id,
      activity,
      assigneeProfiles
    );
  }
  return null;
}

export function LiveTaskRunsPanel({
  runs,
  onRelease,
  onViewRun,
  releasing = false,
  disabled = false,
  activity,
  assigneeProfiles,
}: LiveTaskRunsPanelProps) {
  const { t } = useTranslation("tasks");

  if (runs.length === 0) {
    return null;
  }

  const handleCopyRunId = async (runId: string) => {
    try {
      await navigator.clipboard.writeText(runId);
    } catch {
      // Clipboard unavailable — ignore.
    }
  };

  return (
    <section className="space-y-2">
      <h2 className="font-medium text-sm">{t("detail.liveRuns")}</h2>
      <Card className="space-y-3" variant="form">
        {runs.map((run) => {
          const active = isTaskRunLiveActive(run);
          const agentLabel = run.agent_type_key
            ? formatAgentTypeKey(run.agent_type_key)
            : t("detail.liveRunUnknownAgent");
          const startedBy = resolveStartedByLabel(
            run,
            activity,
            assigneeProfiles
          );
          const when = formatRelativeTime(run.run_started_at ?? run.created_at);

          return (
            <div
              className="space-y-3 rounded-md border border-border/60 p-3"
              key={run.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Bot className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm">{agentLabel}</p>
                    <p className="text-muted-foreground text-xs">
                      {startedBy
                        ? t("detail.liveRunStartedBy", {
                            when,
                            name: startedBy,
                          })
                        : t("detail.liveRunStarted", { when })}
                    </p>
                  </div>
                </div>
                <Badge variant={active ? "default" : "secondary"}>
                  {active
                    ? t("detail.liveRunInProgress")
                    : t("detail.liveRunFinished")}
                </Badge>
              </div>

              {onViewRun ? (
                <Button
                  className="h-8 px-2"
                  onClick={() => onViewRun(run)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <ExternalLink className="mr-1.5 size-3.5" />
                  {t("detail.liveRunViewLog")}
                </Button>
              ) : null}

              <Collapsible>
                <CollapsibleTrigger className="flex w-full items-center gap-1 text-muted-foreground text-xs hover:text-foreground">
                  <ChevronDown className="size-3.5" />
                  {t("detail.liveRunViewDetails")}
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1 text-muted-foreground text-xs">
                  <p>{t("detail.liveRunRole", { role: run.role })}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono">
                      {t("detail.liveRunId", {
                        id: run.agent_session_run_id.slice(0, 8),
                      })}
                    </span>
                    <Button
                      aria-label={t("detail.copyRunId")}
                      className="size-7"
                      onClick={() =>
                        void handleCopyRunId(run.agent_session_run_id)
                      }
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {active && onRelease ? (
                <Button
                  disabled={disabled || releasing}
                  onClick={() => onRelease(run)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Square className="mr-1.5 size-3.5" />
                  {t("detail.releaseCheckout")}
                </Button>
              ) : null}
            </div>
          );
        })}
      </Card>
    </section>
  );
}
