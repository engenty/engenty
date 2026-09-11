// The shared "a model is writing your flow" view — briefing on top, live
// status with a ticking clock, and the steps appearing as they stream. Used by
// both the create dialog (drafting) and the fix dialog (repairing): the two
// runs emit the same JSON-only reply, so they earn the same window into it.

import { useTranslation } from "@engenty/i18n/ui";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type DraftedStepPreview,
  extractDraftedSteps,
} from "./draft-progress.js";

export function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/** Seconds since `running` last became true; 0 while idle. */
export function useElapsedSeconds(running: boolean): number {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!running) {
      return;
    }
    setElapsedSeconds(0);
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setElapsedSeconds(Math.round((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);
  return elapsedSeconds;
}

/**
 * The drafted steps, re-extracted as the reply grows. Throttled: the reply
 * reaches tens of kilobytes and reparsing it on every streamed token would
 * spend more on progress than on progress's subject.
 */
export function useDraftedSteps(
  text: string | undefined
): DraftedStepPreview[] {
  const [steps, setSteps] = useState<DraftedStepPreview[]>([]);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (text === undefined) {
      setSteps([]);
      return;
    }
    if (pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    let alive = true;
    const timer = setTimeout(() => {
      extractDraftedSteps(text)
        .then((next) => {
          if (alive) {
            // The extractor is append-only across growing prefixes, so a
            // length check is enough to avoid re-render churn.
            setSteps((prev) => (next.length > prev.length ? next : prev));
          }
        })
        .finally(() => {
          pendingRef.current = false;
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
      pendingRef.current = false;
    };
  }, [text]);

  return steps;
}

export function DraftProgressView({
  approxTokens,
  briefingText,
  briefingTitle,
  elapsedSeconds,
  statusLine,
  steps,
}: {
  approxTokens: number;
  briefingText: string;
  briefingTitle: string;
  elapsedSeconds: number;
  statusLine: string;
  steps: DraftedStepPreview[];
}) {
  const { t } = useTranslation("ai-ui");
  return (
    <div className="space-y-4">
      <div className="rounded-md bg-muted/40 px-3 py-2.5">
        <p className="font-medium text-sm">{briefingTitle}</p>
        <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
          {briefingText}
        </p>
      </div>

      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin" />
        <span className="min-w-0 flex-1 truncate">{statusLine}</span>
        <span className="shrink-0 tabular-nums">
          {formatElapsed(elapsedSeconds)}
        </span>
        {/* Suppressed while tiny: the thinking phase emits almost no text, and
            "≈ 1 token" next to a minutes-old timer reads as a stall. */}
        {approxTokens >= 25 ? (
          <span className="shrink-0 whitespace-nowrap tabular-nums">
            {t("workflows.createDialog.progress.tokens", {
              count: approxTokens,
            })}
          </span>
        ) : null}
      </div>

      {steps.length > 0 ? (
        <ol className="max-h-64 space-y-1 overflow-y-auto rounded-md border bg-muted/40 px-3 py-2">
          {steps.map((step, index) => (
            <li
              className={
                index === steps.length - 1
                  ? "text-foreground text-xs"
                  : "text-muted-foreground text-xs"
              }
              key={step.key}
            >
              <span className="mr-1.5 tabular-nums">{index + 1}.</span>
              {step.label}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
