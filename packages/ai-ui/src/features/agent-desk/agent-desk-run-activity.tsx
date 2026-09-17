"use client";

// The agent reporting in, while it is working.
//
// A routine fire never touches the chat someone has open: it runs in its own
// unattended thread, so the lane stayed completely silent from the tick until
// the fire showed up in the feed, finished. That is the wrong way round — the
// only reason to trust an agent that works on a schedule is seeing it work.
//
// This card is that. It names the routine, streams the tool calls as they
// happen (the SAME run stream the Runs tab replays afterwards) and ends on the
// result or the error — the RUN's outcome, not the thread's status, so a fire
// that failed says so. Opening it binds the lane to the fire's own thread,
// where the full transcript lives; while the lane is already there the card
// steps aside rather than narrating the transcript twice.

import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import { Button } from "@engenty/ui-core";
import { Check, Repeat2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useWorkflowRunStatus } from "../../hooks/use-workflow-run-status.js";
import { WorkflowRunStatus } from "../agents-workspace/workflow-run-status.js";
import { GateDecisionCard } from "../workflow-canvas/gate-decision-card.js";
import {
  useResumeRunMutation,
  useReviewRunMutation,
  useWorkflowRunQuery,
} from "../workflow-canvas/workflow-queries.js";
import { conversationEngagement } from "./agent-desk-url.js";
import { agentDeskKeys } from "./use-agent-desk-feed.js";
import { useAgentRoutineActivity } from "./use-agent-routine-activity.js";

export function AgentDeskRunActivity(props: {
  agentId: string;
  locale: string;
  spaceId: string;
  /** The thread the lane is bound to — the card hides when it is this fire's. */
  threadId: string | null;
}) {
  const { t } = useTranslation("ai-ui");
  const [searchParams, setSearchParams] = useSearchParams();
  const [dismissedRunId, setDismissedRunId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const activity = useAgentRoutineActivity({ agentId: props.agentId });
  // Null while the lane is bound to this very fire: the transcript is already
  // streaming it, and a second attach would replay the same run twice.
  const watchedRunId =
    activity && activity.threadId !== props.threadId ? activity.runId : null;
  const { cancel, isCancelling, state } = useWorkflowRunStatus(watchedRunId);

  // A parked run's question or approval is answerable HERE — the chat is the
  // room the person is already in, and work-model.md promises the ask on the
  // desk. The graph-run snapshot carries the gate; answering resumes the same
  // run, and the SSE card above then follows it to its end.
  const parked = state?.phase === "requires_action";
  const parkedRun = useWorkflowRunQuery(
    parked ? (watchedRunId ?? undefined) : undefined
  );
  const gate = parked ? parkedRun.data?.snapshot?.gate : undefined;
  const resume = useResumeRunMutation();
  // Parked with no gate is a review hold (`report: ask`): the fire finished
  // and waits for a look. Only a gate can suspend a graph, so nothing else
  // leaves a run in this state.
  const heldForReview = parked && parkedRun.isSuccess && !gate;
  const review = useReviewRunMutation();

  // A settled fire is a new thread on the desk. The feed is a snapshot taken
  // before the fire existed, so nothing would list it until the next load.
  const settled = Boolean(state && state.phase !== "running");
  const settledRunId = settled ? watchedRunId : null;
  useEffect(() => {
    if (!settledRunId) {
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: agentDeskKeys.feed(props.spaceId, props.agentId, props.locale),
    });
  }, [props.agentId, props.locale, props.spaceId, queryClient, settledRunId]);

  if (!(activity && state && watchedRunId) || watchedRunId === dismissedRunId) {
    return null;
  }

  const name = activity.title ?? t("agentDesk.activity.unnamed");
  const openRun = () => {
    const next = new URLSearchParams(searchParams);
    next.set("engagement", conversationEngagement(activity.threadId));
    next.delete("action");
    next.delete("workflow");
    setSearchParams(next);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Repeat2 aria-hidden className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {t("agentDesk.activity.routine", { name })}
        </span>
        <Button
          className="h-6 px-2 text-xs"
          onClick={openRun}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("agentDesk.activity.open")}
        </Button>
        <Button
          aria-label={t("agentDesk.activity.dismiss")}
          className="h-6 w-6 p-0"
          onClick={() => setDismissedRunId(activity.runId)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <X aria-hidden className="size-3.5" />
        </Button>
      </div>
      {heldForReview && watchedRunId ? (
        <div className="ui-card-panel flex flex-wrap items-center justify-between gap-2 p-2.5 text-xs">
          <span className="text-muted-foreground">
            {t("agentDesk.activity.reviewPrompt")}
          </span>
          <Button
            className="h-6 gap-1 px-2 text-xs"
            disabled={review.isPending}
            onClick={() =>
              review.mutate(watchedRunId, {
                onSuccess: () => void parkedRun.refetch(),
              })
            }
            size="sm"
            type="button"
          >
            <Check aria-hidden className="size-3.5" />
            {t("agentDesk.activity.markReviewed")}
          </Button>
        </div>
      ) : null}
      {gate && watchedRunId ? (
        <GateDecisionCard
          busy={resume.isPending}
          gate={gate}
          onDecide={(decision) =>
            resume.mutate(
              { runId: watchedRunId, ...decision, step_id: gate.stepId },
              { onSuccess: () => void parkedRun.refetch() }
            )
          }
        />
      ) : null}
      <WorkflowRunStatus
        cancel={cancel}
        isCancelling={isCancelling}
        labels={{
          completed: t("agentDesk.activity.completed"),
          failed: t("agentDesk.activity.failed"),
          noOutput: t("agentDesk.activity.noOutput"),
          paused: t("agentDesk.activity.paused"),
          requiresAction: t("agentDesk.activity.requiresAction"),
          running: t("agentDesk.activity.starting"),
          step: t("actionsRun.step"),
          stepResult: t("actionsRun.stepResult"),
          steps: t("actionsRun.steps"),
          stop: t("actionsRun.stop"),
          stopped: t("agentDesk.activity.stopped"),
          stopping: t("actionsRun.stopping"),
        }}
        status={state}
      />
    </div>
  );
}
