/**
 * One live job inside a card (PLAN-space-home.md H4, P2).
 *
 * What the verdict buttons can and cannot do here:
 *
 * - A paused ROOM lifts from this row. `POST /ai/threads/:id/continue` is the
 *   whole operation (room-routes.ts), so the card owns it end to end.
 * - An open INTERRUPT does not resolve here. Answering it resumes the parked
 *   run through the thread's AG-UI session — a stream, not a request — so the
 *   button opens the conversation, where the decision card is already waiting.
 *   A "Freigeben" here that silently opened a stream in the background would
 *   be a second, weaker copy of that card.
 * - An APP waiting for activation lifts from here too, for the same reason the
 *   room does: `apps.approve` is a plain POST on the App itself, with no run
 *   to resume. See SpaceHomeAppReleaseRow.
 */
import type { SpaceHomeJob } from "@engenty/ai-ui";
import { useContinueRoomMutation } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { useNavigate } from "react-router-dom";
import { SpaceHomeAppReleaseRow } from "./SpaceHomeAppReleaseRow";

function jobLine(
  job: SpaceHomeJob,
  agentTurns: number,
  t: (
    key: string,
    options: { defaultValue: string } & Record<string, unknown>
  ) => string
): string {
  if (job.interrupt?.title) {
    return job.interrupt.title;
  }
  if (job.interrupt) {
    return t("spaces.home.cards.waitingLine", {
      defaultValue: "Waiting for your answer.",
    });
  }
  if (job.state === "paused") {
    return t("spaces.home.cards.pausedLine", {
      count: agentTurns,
      defaultValue:
        "{{count}} agent turns without a word from you — the room waits.",
    });
  }
  if (job.state === "running") {
    return t("spaces.home.cards.runningLine", { defaultValue: "Working." });
  }
  if (job.state === "waiting") {
    // A run parked by native HITL, with no interrupt metadata to quote.
    return t("spaces.home.cards.waitingLine", {
      defaultValue: "Waiting for your answer.",
    });
  }
  return t("spaces.home.cards.doneLine", { defaultValue: "Finished." });
}

export function SpaceHomeJobRow({
  agentTurns,
  conversationTarget,
  first,
  hideAnswer = false,
  hostKey,
  job,
  path,
  threadId,
}: {
  agentTurns: number;
  /** `path` plus whatever a desk needs to open AS a conversation. */
  conversationTarget: string;
  first: boolean;
  /** The card already has the composer — "Answer" would only open the same chat. */
  hideAnswer?: boolean;
  /** The conversation's artifact-pane key, when it has one. */
  hostKey: string | null;
  job: SpaceHomeJob;
  path: string;
  threadId: string | null;
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const continueRoom = useContinueRoomMutation(threadId ?? "");
  // An App release is its own row with its own verdict — a decision on the
  // App, not on the run — so it does not share the generic line and buttons.
  if (job.app_release) {
    // No divider above it: the notice carries its own frame, and a rule
    // touching its border reads as a broken box.
    return (
      <div data-testid="space-home-job-app-release">
        <SpaceHomeAppReleaseRow
          hostKey={hostKey}
          release={job.app_release}
          target={conversationTarget}
        />
      </div>
    );
  }
  const line = jobLine(job, agentTurns, t);
  const showContinue = job.state === "paused" && Boolean(threadId);
  const showOpen = job.state !== "waiting" || !hideAnswer;

  return (
    <div
      className={cn(
        "flex items-start gap-3 py-2.5",
        first ? null : "border-border-soft border-t"
      )}
      data-testid={`space-home-job-${job.state}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] text-foreground/90 leading-relaxed">
          {line}
        </p>
        {job.interrupt?.body ? (
          <p className="mt-1.5 rounded-[10px] bg-muted/60 px-3 py-2 text-[13px] text-muted-foreground">
            {job.interrupt.body}
          </p>
        ) : null}
        {job.interrupt?.tool_name ? (
          <p className="mt-1.5 font-mono text-[11.5px] text-muted-foreground">
            {job.interrupt.tool_name}
          </p>
        ) : null}
        {job.trigger === "cron" ? (
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            {t("spaces.home.cards.fromRoutine", {
              defaultValue: "from a routine",
            })}
          </p>
        ) : null}
      </div>
      {showContinue || showOpen ? (
        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          {showContinue ? (
            <Button
              disabled={continueRoom.isPending}
              onClick={() => continueRoom.mutate()}
              size="sm"
            >
              {t("spaces.home.cards.continue", {
                defaultValue: "Let it continue",
              })}
            </Button>
          ) : null}
          {showOpen ? (
            <Button onClick={() => navigate(path)} size="sm" variant="outline">
              {job.state === "waiting"
                ? t("spaces.home.cards.answer", { defaultValue: "Answer" })
                : job.state === "running"
                  ? t("spaces.home.cards.watch", { defaultValue: "Watch" })
                  : t("spaces.home.cards.open", { defaultValue: "Open" })}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
