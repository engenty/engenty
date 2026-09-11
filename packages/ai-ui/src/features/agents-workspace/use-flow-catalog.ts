// One catalog of runnables for every workspace surface.
//
// Both sources are fetched here — stored graphs and declared module workflows —
// and merged into the rows the Flows catalog and the sidebar both show, so a
// runnable can never appear in one place and not the other. TanStack dedupes
// the two queries across every caller on the page.
import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAiWorkflowsQuery } from "../../lib/admin/ai-runtime-queries.js";
import {
  buildFlowCatalog,
  type WorkflowCatalogEntry,
} from "../workflow-canvas/workflow-flows-state.js";
import { useWorkflowListQuery } from "../workflow-canvas/workflow-queries.js";
import { buildWorkflowDetailPath } from "./agent-workspace-url-state.js";

export function useFlowCatalog(): {
  flows: WorkflowCatalogEntry[];
  flowsLoading: boolean;
} {
  const graphsQuery = useWorkflowListQuery();
  const actionsQuery = useAiWorkflowsQuery();

  const flows = useMemo(
    () =>
      buildFlowCatalog(
        graphsQuery.data?.graphs ?? [],
        actionsQuery.data?.workflows ?? []
      ),
    [graphsQuery.data?.graphs, actionsQuery.data?.workflows]
  );

  return {
    flows,
    flowsLoading: graphsQuery.isLoading || actionsQuery.isLoading,
  };
}

/**
 * Open a catalog row. The row is the ACTION: a declared module workflow opens
 * its own page (whose Steps tab shows the compiled graph); only an action
 * authored on the canvas is addressed by its graph id.
 */
export function useSelectFlow(): (entry: WorkflowCatalogEntry) => void {
  const navigate = useNavigate();
  return useCallback(
    (entry: WorkflowCatalogEntry) => {
      navigate(buildWorkflowDetailPath(entry.workflowId ?? entry.id), {
        replace: true,
      });
    },
    [navigate]
  );
}

/** True when this row is the one the current page is showing. */
export function isFlowEntrySelected(
  entry: WorkflowCatalogEntry,
  selectedFlowId: string
): boolean {
  if (!selectedFlowId) {
    return false;
  }
  // A compiled action is reachable under either id: the catalog row carries the
  // graph id, the workflow's detail page knows only its own.
  return entry.id === selectedFlowId || entry.workflowId === selectedFlowId;
}
