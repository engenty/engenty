"use client";

import { CopilotTranscript, type CopilotTranscriptProps } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@engenty/ui-core";
import { ChevronDown, Square } from "lucide-react";
import { useMemo, useState } from "react";
import { useTaskRunObserverContext } from "../context/task-run-observer-context.js";

/**
 * The run log itself — transcript plus the stop control, no chrome.
 *
 * Rendered INSIDE the run's own card in the runs list. It used to be a second
 * top-level panel that repeated the run id and carried its own status badge,
 * so one run appeared twice on the page with two badges sourced from two
 * different tables (and they could disagree). The run's identity and status
 * belong to the run card; only the log lives here.
 */
export function TaskRunObserverBody() {
  const { t } = useTranslation("tasks");
  const observer = useTaskRunObserverContext();
  const [briefOpen, setBriefOpen] = useState(false);

  // A headless run opens on its BRIEF — the whole rendered task, workspace
  // guidance and prior comments, hundreds of words the reader is standing on
  // the task page looking at already. Left in the transcript it pushed the
  // thing they opened this for (what the agent actually did) below the fold.
  // So the opening turn folds away and the run's own work leads.
  const [brief, rest] = useMemo(() => {
    const messages = observer.copilotMessages;
    const first = messages[0];
    return first?.role === "user"
      ? ([first, messages.slice(1)] as const)
      : ([null, messages] as const);
  }, [observer.copilotMessages]);

  if (!observer.view) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-md bg-muted/20 p-3">
      {observer.view.parentRunId ? (
        <p className="text-muted-foreground text-xs">
          {t("detail.runObserver.subRunOf", {
            id: observer.view.parentRunId.slice(0, 8),
          })}
        </p>
      ) : null}

      {brief ? (
        <Collapsible onOpenChange={setBriefOpen} open={briefOpen}>
          <CollapsibleTrigger className="flex w-full items-center gap-1 text-muted-foreground text-xs hover:text-foreground">
            <ChevronDown
              className={`size-3.5 transition-transform ${briefOpen ? "rotate-180" : ""}`}
            />
            {t("detail.runObserver.brief")}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <CopilotTranscript
              messages={[brief]}
              status="ready"
              surface="default"
            />
          </CollapsibleContent>
        </Collapsible>
      ) : observer.initialPrompt ? (
        // No transcript yet (the run is still starting): the run record's own
        // snapshot of the prompt is all there is to show.
        <section className="space-y-1 rounded-md bg-muted/30 p-3">
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {t("detail.runObserver.initialPrompt")}
          </p>
          <p className="whitespace-pre-wrap text-sm">
            {observer.initialPrompt}
          </p>
        </section>
      ) : null}

      {observer.error ? (
        <p className="text-destructive text-sm">{observer.error}</p>
      ) : null}

      <CopilotTranscript
        messages={rest}
        pendingUserText={observer.pendingUserText}
        status={observer.transcriptStatus as CopilotTranscriptProps["status"]}
        surface="default"
        thinkingLabel={t("detail.runObserver.working")}
      />

      {observer.isRunActive ? (
        <Button
          disabled={observer.status === "starting"}
          onClick={() => void observer.cancelActiveRun()}
          size="sm"
          type="button"
          variant="outline"
        >
          <Square className="mr-1.5 size-3.5" />
          {t("detail.runObserver.stopRun")}
        </Button>
      ) : null}
    </div>
  );
}
