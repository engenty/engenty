"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { AlertCircle, CheckCircle2, ChevronDown, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { deriveAgentStatusTicker } from "./derive-agent-status-ticker.js";
import { formatElapsedSeconds } from "./format-elapsed-seconds.js";
import type {
  AgentStatusStep,
  AgentStatusTickerLabels,
  AgentStatusTickerSnapshot,
  DeriveAgentStatusTickerInput,
} from "./types.js";
import { useElapsedSeconds } from "./use-elapsed-seconds.js";

export type AgentStatusTickerProps = Omit<
  DeriveAgentStatusTickerInput,
  "labels"
> & {
  className?: string;
  /** Overrides for the localized labels (e.g. the just-sent message). */
  labels?: Partial<AgentStatusTickerLabels>;
  onExpandedChange?: (expanded: boolean) => void;
};

function variantTextClass(variant: AgentStatusTickerSnapshot["variant"]) {
  switch (variant) {
    case "success":
      return "text-emerald-700 dark:text-emerald-200";
    case "destructive":
      return "text-destructive";
    case "active":
      return "text-foreground";
    default:
      return "text-muted-foreground";
  }
}

function StepGlyph({ snapshot }: { snapshot: AgentStatusTickerSnapshot }) {
  if (snapshot.showSpinner) {
    return (
      <AnimatedLoaderIcon
        aria-hidden
        className={cn("mt-0.5", variantTextClass(snapshot.variant))}
        play="always"
        size="xs"
      />
    );
  }
  switch (snapshot.outcome) {
    case "success":
      return (
        <CheckCircle2
          aria-hidden
          className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
        />
      );
    case "error":
      return (
        <AlertCircle
          aria-hidden
          className="mt-0.5 size-3.5 shrink-0 text-destructive"
        />
      );
    case "stale":
      return (
        <Clock
          aria-hidden
          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
        />
      );
    default:
      return null;
  }
}

function StepLine({
  elapsedLabel,
  expanded,
  step,
  textClass,
}: {
  elapsedLabel?: string | null;
  expanded: boolean;
  step: Pick<AgentStatusStep, "label">;
  textClass: string;
}) {
  return (
    <div
      className={cn(
        textClass,
        expanded ? "whitespace-pre-wrap" : "line-clamp-2"
      )}
    >
      {elapsedLabel ? (
        <span className="text-muted-foreground tabular-nums">
          {elapsedLabel} ·{" "}
        </span>
      ) : null}
      <span>{step.label}</span>
    </div>
  );
}

function RecentStepsList({
  recentSteps,
  textClass,
}: {
  recentSteps: readonly AgentStatusStep[];
  textClass: string;
}) {
  return (
    <ul className="space-y-1">
      {recentSteps.map((step, index) => (
        <li
          className={cn(
            textClass,
            index === 0 ? "text-foreground" : "text-muted-foreground"
          )}
          key={`${step.kind}:${step.label}:${index}`}
        >
          {step.label}
        </li>
      ))}
    </ul>
  );
}

export function AgentStatusTicker(props: AgentStatusTickerProps) {
  const { className, onExpandedChange } = props;
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation("ai-ui");
  const labels: AgentStatusTickerLabels = {
    collapseSteps: t("statusTicker.collapseSteps"),
    done: t("statusTicker.done"),
    error: t("statusTicker.error"),
    expandSteps: t("statusTicker.expandSteps"),
    somethingWentWrong: t("statusTicker.somethingWentWrong"),
    stale: t("statusTicker.stale"),
    thinking: t("statusTicker.thinking"),
    waiting: t("statusTicker.waiting"),
    ...props.labels,
  };
  const snapshot = deriveAgentStatusTicker({
    activityBaselineSignature: props.activityBaselineSignature,
    chatStatus: props.chatStatus,
    errorMessage: props.errorMessage,
    labels,
    messages: props.messages,
    runStatus: props.runStatus,
    stale: props.stale,
  });

  useEffect(() => {
    if (snapshot.outcome === "success" || snapshot.outcome === "error") {
      setExpanded(false);
      onExpandedChange?.(false);
    }
  }, [onExpandedChange, snapshot.outcome]);

  const toggleExpanded = () => {
    setExpanded((current) => {
      const next = !current;
      onExpandedChange?.(next);
      return next;
    });
  };

  const textClass = cn(
    "min-w-0 flex-1 text-sm",
    variantTextClass(snapshot.variant)
  );
  const showRecentSteps =
    expanded && snapshot.recentSteps.length > 1 && snapshot.canExpandSteps;

  const busy =
    snapshot.outcome === "running" || snapshot.outcome === "requested";
  const elapsedSeconds = useElapsedSeconds(busy);
  const elapsedLabel = busy ? formatElapsedSeconds(elapsedSeconds) : null;

  return (
    <div className={cn("flex min-w-0 items-start gap-2", className)}>
      <StepGlyph snapshot={snapshot} />
      <div className="min-w-0 flex-1">
        {showRecentSteps ? (
          <RecentStepsList
            recentSteps={snapshot.recentSteps}
            textClass={textClass}
          />
        ) : (
          <StepLine
            elapsedLabel={expanded ? null : elapsedLabel}
            expanded={expanded}
            step={{ label: expanded ? snapshot.fullLabel : snapshot.label }}
            textClass={textClass}
          />
        )}
      </div>
      {snapshot.canExpandSteps ? (
        <button
          aria-expanded={expanded}
          aria-label={expanded ? labels.collapseSteps : labels.expandSteps}
          className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          onClick={toggleExpanded}
          type="button"
        >
          <ChevronDown
            aria-hidden
            className={cn(
              "size-3.5 transition-transform duration-200",
              expanded && "rotate-180"
            )}
          />
        </button>
      ) : null}
    </div>
  );
}
