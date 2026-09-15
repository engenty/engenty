"use client";

// Dedicated widget for sync Mastra sub-agent delegations (`agent-*` tools).
// Collapsible elevated card: collapsed = header + one truncated preview line
// (summary on success, error in destructive, input while running).

import { cn } from "@engenty/ui-core";
import {
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAgentDisplayNamesVersion } from "../../../ag-ui/agent-display-names.js";
import { resolveAgentDisplayName } from "../../../ag-ui/resolve-transcript-tool-display.js";
import {
  DelegatedArtifactRow,
  readDelegatedArtifactIds,
} from "../../../artifacts/delegated-artifact-row.js";
import {
  InlineAppArtifact,
  readDelegatedAppArtifactId,
} from "../../../artifacts/inline-app-artifact.js";
import {
  formatSubAgentInputText,
  formatSubAgentOutputText,
  resolveSubAgentCollapsedPreview,
} from "../../../copilot/sub-agent-run/sub-agent-run-display.js";
import {
  DEFAULT_SUB_AGENT_RUN_SECTION_LABELS,
  SubAgentLogPanel,
  SubAgentTextPanel,
} from "../sub-agent-run/sub-agent-run-sections.js";
import type { ToolCallCardProps, ToolCallState } from "./tool-call-card.types";

function readAgentId(toolName: string): string {
  return toolName.startsWith("agent-")
    ? toolName.slice("agent-".length)
    : toolName;
}

interface SubAgentDetail {
  artifacts?: Array<{ name: string; key: string }>;
}

function readSubAgentArtifacts(output: unknown): SubAgentDetail {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return {};
  }
  const artifacts = (output as Record<string, unknown>).artifacts;
  if (!Array.isArray(artifacts)) {
    return {};
  }
  return {
    artifacts: artifacts.filter(
      (a): a is { name: string; key: string } =>
        a !== null &&
        typeof a === "object" &&
        typeof a.name === "string" &&
        typeof a.key === "string"
    ),
  };
}

function resolveEffectiveState(
  state: ToolCallState,
  output: unknown,
  errorText?: string
): ToolCallState {
  if (state === "error" || errorText?.trim()) {
    return "error";
  }
  if (output !== undefined && (state === "running" || state === "pending")) {
    return "completed";
  }
  return state;
}

const SUB_AGENT_COLLAPSE_TRANSITION =
  "grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none";

function StatusBadge({ state }: { state: ToolCallState }) {
  if (state === "running" || state === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
        <Loader2 aria-hidden className="size-3 animate-spin" />
        Running
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive text-xs">
        <CircleAlert aria-hidden className="size-3" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
      <Check aria-hidden className="size-3" />
      Complete
    </span>
  );
}

export function SubAgentTaskToolCallCard({
  className,
  errorText,
  fullPageHref,
  fullPageLabel,
  input,
  output,
  progressLines,
  subAgentSectionLabels = DEFAULT_SUB_AGENT_RUN_SECTION_LABELS,
  state: stateProp,
  toolName,
}: ToolCallCardProps) {
  const sectionLabels = subAgentSectionLabels;
  // Re-render when the agent catalog lands, so a row drawn before it stops
  // showing the id.
  useAgentDisplayNamesVersion();
  const agentName = resolveAgentDisplayName(readAgentId(toolName));
  const state = resolveEffectiveState(
    stateProp ?? "completed",
    output,
    errorText
  );
  const isActive = state === "running" || state === "pending";
  const isFailed = state === "error";
  const [expanded, setExpanded] = useState(() => isActive || isFailed);
  const detail = readSubAgentArtifacts(output);
  const inputText = formatSubAgentInputText(input);
  const collapsedPreview = resolveSubAgentCollapsedPreview({
    errorText,
    input,
    output,
    state,
  });
  const outputText =
    errorText?.trim() || formatSubAgentOutputText(output) || null;
  const logLines = progressLines ?? [];
  const toggleExpanded = () => setExpanded((open) => !open);
  // The child built an App (app_build) — render it inline below the card,
  // outside the collapse: the deliverable belongs in the conversation, not
  // behind the drill-in.
  const appArtifactId = readDelegatedAppArtifactId(output);
  // Artifacts the child wrote or presented — offered here, where the person
  // reads, not only behind the child-thread drill-in.
  const artifactIds = isFailed ? [] : readDelegatedArtifactIds(output);

  return (
    <section
      aria-busy={isActive || undefined}
      className={cn(
        "w-full rounded-lg border border-border bg-card shadow-[var(--e-2)]",
        className
      )}
    >
      <button
        aria-expanded={expanded}
        className={cn(
          "flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left",
          "transition-colors hover:bg-muted/30",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          expanded && "border-border-soft border-b"
        )}
        data-testid="sub-agent-header-trigger"
        onClick={toggleExpanded}
        type="button"
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
            <Bot aria-hidden className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-foreground text-sm">{agentName}</p>
            <p className="text-muted-foreground text-xs">Sub-agent run</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge state={state} />
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 text-muted-foreground transition-transform duration-300 ease-in-out motion-reduce:transition-none",
              expanded && "rotate-180"
            )}
          />
        </div>
      </button>

      <div
        aria-hidden={expanded}
        className={cn(
          SUB_AGENT_COLLAPSE_TRANSITION,
          expanded ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
        )}
        data-collapsed={expanded}
        data-testid="sub-agent-preview-shell"
      >
        <div className="min-h-0 min-w-0 overflow-hidden">
          <button
            className={cn(
              "block w-full min-w-0 truncate px-3 py-2 text-left text-sm",
              "transition-colors hover:bg-muted/30",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              collapsedPreview.tone === "error"
                ? "text-destructive"
                : "text-muted-foreground"
            )}
            data-testid="sub-agent-preview-trigger"
            onClick={() => setExpanded(true)}
            type="button"
          >
            {collapsedPreview.text}
          </button>
        </div>
      </div>

      <div
        aria-hidden={!expanded}
        className={cn(
          SUB_AGENT_COLLAPSE_TRANSITION,
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
        data-collapsed={!expanded}
        data-testid="sub-agent-expanded-shell"
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-2 px-3 py-2.5">
            <SubAgentTextPanel
              emptyText="No input yet."
              label={sectionLabels.input}
              text={inputText}
            />

            <SubAgentTextPanel
              bodyClassName="font-mono text-xs"
              emptyText="No output yet."
              label={sectionLabels.output}
              text={outputText}
            />

            <SubAgentLogPanel
              emptyText="No log output yet."
              isActive={isActive}
              label={sectionLabels.log}
              lines={logLines}
            />

            {detail.artifacts && detail.artifacts.length > 0 ? (
              <p className="text-muted-foreground text-xs">
                Artifacts: {detail.artifacts.map((a) => a.name).join(", ")}
              </p>
            ) : null}
          </div>

          {fullPageHref ? (
            <div className="border-border-soft border-t px-3 py-2">
              <Link
                className="inline-flex items-center gap-1.5 text-primary text-xs underline-offset-4 hover:underline"
                tabIndex={expanded ? undefined : -1}
                to={fullPageHref}
              >
                <ExternalLink aria-hidden className="size-3.5" />
                {fullPageLabel ?? "Full view"}
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      {artifactIds.length > 0 ? (
        <div className="flex flex-col gap-1.5 px-3 pb-3">
          {artifactIds.map((artifactId) => (
            <DelegatedArtifactRow artifactId={artifactId} key={artifactId} />
          ))}
        </div>
      ) : null}

      {appArtifactId ? (
        <div className="px-3 pb-3">
          <InlineAppArtifact artifactId={appArtifactId} />
        </div>
      ) : null}
    </section>
  );
}
