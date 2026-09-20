"use client";

// The rail of steps a wizard walks, read straight off the graph.
//
// A step is a gate node on the canvas; its state is the run's node state.
// Nothing is invented for the rail: a gate inside a loop is drawn once and
// lights up again on every pass, which is what actually happens.

import { cn } from "@engenty/ui-core";
import { Check, Circle, Loader2 } from "lucide-react";
import { useMemo } from "react";
import {
  type StoredEntry,
  type StoredGraph,
  storedGraphToCanvas,
} from "../workflow-canvas/graph-model.js";
import type { GraphRunSnapshotDto } from "../workflow-canvas/workflow-api.js";

export interface WizardGateStep {
  /** Full resume path — enclosing sub-workflow ids, then the leaf. */
  path: string[];
  stepId: string;
  title: string;
}

const APPROVAL_GATE_TOOL_ID = "approval_gate";

/**
 * A gate title authored as a template ("Angebot „${stepResults.x.title}“
 * anlegen?") is filled at run time; on the rail its placeholders read as "…".
 */
function readableTitle(title: string): string {
  return title
    .replace(/\$\{[^}]*\}/g, "…")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** The constant or template `title` a mapping entry feeds the gate after it. */
function titleFromMapping(entry: StoredEntry | null): string | null {
  if (entry?.type !== "mapping" || typeof entry.mapConfig !== "string") {
    return null;
  }
  try {
    const config = JSON.parse(entry.mapConfig) as Record<string, unknown>;
    const source = config.title as
      | { template?: unknown; value?: unknown }
      | undefined;
    const title = source?.value ?? source?.template;
    return typeof title === "string" && title.trim() ? title : null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Every `approval_gate` step in graph order, with the path Mastra addresses
 * it by. Only a `workflow` entry adds a segment: a loop, a branch or a
 * parallel block has no step identity of its own, the step inside it does.
 */
export function gateStepsFromGraph(graph: StoredGraph): WizardGateStep[] {
  const nodes = storedGraphToCanvas(graph).nodes;
  const titleByStepId = new Map<string, string>();
  for (const node of nodes) {
    if (node.data.kind !== "gate") {
      continue;
    }
    for (const entryId of node.data.entryIds) {
      titleByStepId.set(entryId, node.data.title);
    }
  }
  const steps: WizardGateStep[] = [];
  const walk = (entries: StoredEntry[], prefix: string[]) => {
    let previous: StoredEntry | null = null;
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const id = asString(entry.id);
      if (
        entry.type === "tool" &&
        entry.toolId === APPROVAL_GATE_TOOL_ID &&
        id
      ) {
        // The canvas names top-level gates; a gate inside an inline workflow
        // is named by the mapping right before it, the same way the engine
        // feeds it.
        steps.push({
          path: [...prefix, id],
          stepId: id,
          title: readableTitle(
            titleByStepId.get(id) ?? titleFromMapping(previous) ?? id
          ),
        });
        previous = entry;
        continue;
      }
      previous = entry;
      if (entry.type === "workflow" && Array.isArray(entry.graph)) {
        // An inline nested workflow: its gates resume by path through it.
        walk(entry.graph as StoredEntry[], id ? [...prefix, id] : prefix);
        continue;
      }
      if (Array.isArray(entry.steps)) {
        walk(entry.steps as StoredEntry[], prefix);
      } else if (entry.step && typeof entry.step === "object") {
        walk([entry.step as StoredEntry], prefix);
      }
    }
  };
  walk(graph.graph ?? [], []);
  return steps;
}

/** The step before `stepId` in the rail — what "Zurück" travels to. */
export function previousGateStep(
  steps: readonly WizardGateStep[],
  stepId: string | null
): WizardGateStep | null {
  if (!stepId) {
    return null;
  }
  const index = steps.findIndex((step) => step.stepId === stepId);
  return index > 0 ? (steps[index - 1] ?? null) : null;
}

export interface WizardProgressProps {
  className?: string;
  /** The gate currently asking, if any. */
  currentStepId: string | null;
  graph: StoredGraph;
  nodes: GraphRunSnapshotDto["nodes"] | undefined;
}

export function WizardProgress({
  className,
  currentStepId,
  graph,
  nodes,
}: WizardProgressProps) {
  const steps = useMemo(() => gateStepsFromGraph(graph), [graph]);
  if (steps.length === 0) {
    return null;
  }
  return (
    <ol
      aria-label="progress"
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}
    >
      {steps.map((step, index) => {
        const state = nodes?.[step.stepId]?.state;
        const current = step.stepId === currentStepId;
        const done = state === "done" && !current;
        return (
          <li
            aria-current={current ? "step" : undefined}
            className={cn(
              "flex items-center gap-1.5 text-xs",
              current
                ? "font-medium text-foreground"
                : done
                  ? "text-muted-foreground"
                  : "text-muted-foreground/70"
            )}
            key={`${step.path.join("/")}-${index}`}
          >
            {current ? (
              <Loader2
                aria-hidden
                className="size-3.5 animate-pulse text-primary"
              />
            ) : done ? (
              <Check
                aria-hidden
                className="size-3.5 text-emerald-600 dark:text-emerald-400"
              />
            ) : (
              <Circle aria-hidden className="size-3" />
            )}
            <span className="truncate">{step.title}</span>
          </li>
        );
      })}
    </ol>
  );
}
