// The steps a wizard walks, read straight off the graph.
//
// A step is a gate node on the canvas.
// Nothing is invented: "Zurück" travels to the gate before this one, and a
// question's number is its place among the gates.

import {
  type StoredEntry,
  type StoredGraph,
  storedGraphToCanvas,
} from "../workflow-canvas/graph-model.js";

export interface WizardGateStep {
  /** Full resume path — enclosing sub-workflow ids, then the leaf. */
  path: string[];
  stepId: string;
  title: string;
}

const APPROVAL_GATE_TOOL_ID = "approval_gate";

/**
 * A title authored as a template ("Angebot „${stepResults.x.title}“
 * anlegen?") is filled at run time; read off the graph its placeholders
 * read as "…".
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

/** The gate before `stepId` — what "Zurück" travels to. */
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
