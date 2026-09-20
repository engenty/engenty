// The Workflow library is the list of shared runnables in this workspace.
//
// It merges two sources into one list: declared Actions (a workflow shipped
// by a module) and authored Flows (a graph drawn in the canvas). They are one
// runtime — a module workflow compiles to a one-node flow the first time it
// is pressed — so where a runnable came from is a FILTER, not a place.
//
// The dedup that makes that work: a compiled flow carries `source_workflow_id`,
// so its module workflow must not also appear as a separate row.
//
// The library holds only shared definitions: a specialist-owned graph or
// action lives on its specialist's page, never here.
import { rankRecordsLexically } from "@engenty/search-index";
import type { AiRegisteredAction } from "../../lib/admin/ai-runtime-types.js";
import type {
  WorkflowDto,
  WorkflowStatus,
  WorkflowSurface,
} from "./workflow-api.js";

/** `declared` = a module workflow with no compiled flow yet (nobody has pressed it). */
export type FlowEntryStatus = WorkflowStatus | "declared";
export type FlowStatusFilter = FlowEntryStatus | "all";
/** Where the runnable was written: a module workflow, or the canvas. */
export type FlowEntrySource = "module" | "authored";
export type FlowSourceFilter = FlowEntrySource | "all";

export const FLOW_FILTER_ALL = "all";
/** Subject filter value matching flows that are bound to no entity type. */
export const FLOW_SUBJECT_NONE = "__none__";

export interface WorkflowCatalogEntry {
  contextType: string | null;
  description: string | null;
  /** The stored graph, when this tenant has one; null while only declared. */
  graph: WorkflowDto | null;
  /** Row identity — the graph id, or the workflow's id before first compile. */
  id: string;
  moduleId: string | null;
  name: string;
  source: FlowEntrySource;
  /**
   * `wizard` = walked one page per gate by the person who starts it. Known
   * once the row exists; a declared-only module workflow reads as chat until
   * the reconcile writes it. Absent means chat.
   */
  surface?: WorkflowSurface;
  /** The module workflow behind this row, when there is one. */
  workflowId: string | null;
}

export interface FlowFilterState {
  searchQuery: string;
  sourceFilter: FlowSourceFilter;
  statusFilter: FlowStatusFilter;
  subjectFilter: string;
}

export function flowEntryStatus(entry: WorkflowCatalogEntry): FlowEntryStatus {
  return entry.graph?.status ?? "declared";
}

function graphEntry(graph: WorkflowDto): WorkflowCatalogEntry {
  const workflowId = graph.source_workflow_id ?? null;
  return {
    workflowId,
    contextType: graph.context_type,
    description: graph.description,
    graph,
    id: graph.id,
    moduleId: graph.module_id,
    // `title` is the display name; `name` stays the stable key.
    name: graph.title ?? graph.name,
    source: workflowId ? "module" : "authored",
    surface: graph.surface ?? "chat",
  };
}

function actionEntry(action: AiRegisteredAction): WorkflowCatalogEntry {
  return {
    workflowId: action.id,
    contextType: action.context_type,
    description: action.description,
    graph: null,
    id: action.id,
    moduleId: action.module_id,
    name: action.name,
    source: "module",
  };
}

/**
 * Library rows only. A specialist-owned graph belongs to its specialist's
 * page; null `owner_agent_id` marks the shared library subset.
 */
export function libraryWorkflows(
  graphs: readonly WorkflowDto[]
): WorkflowDto[] {
  return graphs.filter((graph) => graph.owner_agent_id == null);
}

/** Library rows only — a specialist-owned action lives on its specialist's page. */
export function libraryActions(
  actions: readonly AiRegisteredAction[]
): AiRegisteredAction[] {
  return actions.filter((action) => action.agent_id == null);
}

/**
 * One list from both sources. A module workflow that has already been
 * compiled is represented by its flow (which is what actually runs), never
 * twice.
 */
export function buildFlowCatalog(
  graphs: readonly WorkflowDto[],
  actions: readonly AiRegisteredAction[]
): WorkflowCatalogEntry[] {
  const compiled = new Set(
    graphs.map((graph) => graph.source_workflow_id).filter(Boolean) as string[]
  );
  return [
    ...graphs.map(graphEntry),
    ...actions.filter((a) => !compiled.has(a.id)).map(actionEntry),
  ].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Subjects present in the data, not a fixed list: which entity types have flows
 * is a property of this workspace, and offering a filter that matches nothing
 * is noise.
 */
export function getFlowSubjects(
  entries: readonly WorkflowCatalogEntry[]
): string[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.contextType) {
      seen.add(entry.contextType);
    }
  }
  return [...seen].sort();
}

export function filterFlows(
  entries: readonly WorkflowCatalogEntry[],
  state: FlowFilterState
): WorkflowCatalogEntry[] {
  const scoped = entries.filter((entry) => {
    if (
      state.statusFilter !== "all" &&
      flowEntryStatus(entry) !== state.statusFilter
    ) {
      return false;
    }
    if (state.sourceFilter !== "all" && entry.source !== state.sourceFilter) {
      return false;
    }
    if (state.subjectFilter === FLOW_SUBJECT_NONE) {
      if (entry.contextType) {
        return false;
      }
    } else if (
      state.subjectFilter !== FLOW_FILTER_ALL &&
      entry.contextType !== state.subjectFilter
    ) {
      return false;
    }
    return true;
  });
  const query = state.searchQuery.trim();
  if (!query) {
    return [...scoped];
  }
  return rankRecordsLexically(scoped, query, (entry) => ({
    description: entry.description ?? "",
    id: entry.id,
    name: entry.name,
    source: entry.source,
  }));
}
