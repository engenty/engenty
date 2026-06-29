"use client";

import { cn } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { AlertCircle, CheckCircle2, ChevronDown, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { Shimmer } from "../../../ai-elements/shimmer";
import { deriveAgentStatusTicker } from "./derive-agent-status-ticker.js";
import { formatElapsedSeconds } from "./format-elapsed-seconds.js";
import type {
  AgentStatusStep,
  AgentStatusTickerLabels,
  AgentStatusTickerSnapshot,
  DeriveAgentStatusTickerInput,
} from "./types.js";
import { useElapsedSeconds } from "./use-elapsed-seconds.js";

export type AgentStatusTickerProps =
  | (DeriveAgentStatusTickerInput & {
      className?: string;
      enableShimmer?: boolean;
      onExpandedChange?: (expanded: boolean) => void;
      snapshot?: undefined;
    })
  | {
      className?: string;
      enableShimmer?: boolean;
      labels?: AgentStatusTickerLabels;
      onExpandedChange?: (expanded: boolean) => void;
      snapshot: AgentStatusTickerSnapshot;
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
  enableShimmer,
  expanded,
  showShimmer,
  step,
  textClass,
}: {
  elapsedLabel?: string | null;
  enableShimmer: boolean;
  expanded: boolean;
  showShimmer: boolean;
  step: Pick<AgentStatusStep, "label">;
  textClass: string;
}) {
  const useShimmer = enableShimmer && showShimmer;
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
      {useShimmer ? (
        <Shimmer as="span" duration={2} spread={2}>
          {step.label}
        </Shimmer>
      ) : (
        <span>{step.label}</span>
      )}
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
  const { className, enableShimmer = true, onExpandedChange } = props;
  const [expanded, setExpanded] = useState(false);
  const inputLabels = "labels" in props ? props.labels : undefined;
  const snapshot =
    "snapshot" in props && props.snapshot != null
      ? props.snapshot
      : deriveAgentStatusTicker({
          activityBaselineSignature: props.activityBaselineSignature,
          chatStatus: props.chatStatus,
          errorMessage: props.errorMessage,
          labels: inputLabels,
          messages: props.messages,
          runStatus: props.runStatus,
          stale: props.stale,
          statusOnly: props.statusOnly,
        });
  const labels = {
    collapseSteps: "Hide recent steps",
    expandSteps: "Show recent steps",
    ...inputLabels,
  };

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

  const useShimmer = enableShimmer && snapshot.showShimmer;
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
            enableShimmer={enableShimmer}
            expanded={expanded}
            showShimmer={useShimmer}
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
