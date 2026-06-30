"use client";

import { CopilotTranscript, type CopilotTranscriptProps } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Card,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@engenty/ui-core";
import { ChevronDown, Square, X } from "lucide-react";
import { useTaskRunObserverContext } from "../context/task-run-observer-context.js";

export function TaskRunObserverPanel() {
  const { t } = useTranslation("tasks");
  const observer = useTaskRunObserverContext();

  if (!observer.view) {
    return null;
  }

  const showStop = observer.isRunActive;
  const statusLabel = observer.isRunActive
    ? t("detail.runObserver.working")
    : observer.transcriptStatus === "error"
      ? t("detail.runObserver.failed")
      : t("detail.runObserver.finished");

  return (
    <Collapsible
      className="space-y-2"
      onOpenChange={observer.setExpanded}
      open={observer.expanded}
    >
      <div className="flex items-center justify-between gap-2">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${observer.expanded ? "rotate-180" : ""}`}
          />
          <div className="min-w-0">
            <h2 className="font-medium text-sm">
              {t("detail.runObserver.title")}
            </h2>
            <p className="truncate text-muted-foreground text-xs">
              {t("detail.runObserver.runId", {
                id: observer.view.runId.slice(0, 8),
              })}
            </p>
          </div>
        </CollapsibleTrigger>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={observer.isRunActive ? "default" : "secondary"}>
            {statusLabel}
          </Badge>
          <Button
            aria-label={t("detail.runObserver.close")}
            className="size-8"
            onClick={observer.closeObserver}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <CollapsibleContent>
        <Card className="space-y-3 p-3" variant="form">
          {observer.view.parentRunId ? (
            <p className="text-muted-foreground text-xs">
              {t("detail.runObserver.subRunOf", {
                id: observer.view.parentRunId.slice(0, 8),
              })}
            </p>
          ) : null}

          {observer.initialPrompt ? (
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
            messages={observer.copilotMessages}
            pendingUserText={observer.pendingUserText}
            status={
              observer.transcriptStatus as CopilotTranscriptProps["status"]
            }
            surface="default"
            thinkingLabel={t("detail.runObserver.working")}
          />

          {showStop ? (
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
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}
