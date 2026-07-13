import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { BookUser, MoreVertical, Plus, RefreshCw, Share2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AskResult, EntityRow } from "../api.js";
import { CgAskBox } from "../components/cg-ask-box.js";
import { CgGraphControls } from "../components/cg-graph-controls.js";
import { CgGraphRenderer } from "../components/cg-graph-renderer.js";
import { EdgeFormDialog } from "../components/edge-form-dialog.js";
import { EntityFormDialog } from "../components/entity-form-dialog.js";
import { EntityPanel } from "../components/entity-panel.js";
import {
  type GraphFilter,
  useCgGraphData,
  useCgOntologyQuery,
} from "../components/use-cg-graph-data.js";

const EMPTY_FILTER: GraphFilter = { search: "", typeFilter: "" };

export function ContextGraphPage() {
  const navigate = useNavigate();
  const ontologyQuery = useCgOntologyQuery();
  const ontology = ontologyQuery.data ?? { entityTypes: [], edgeTypes: [] };

  const [filter, setFilter] = useState<GraphFilter>(EMPTY_FILTER);
  const [cameraResetNonce, setCameraResetNonce] = useState(0);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [askResult, setAskResult] = useState<AskResult | null>(null);
  const [editingEntity, setEditingEntity] = useState<EntityRow | null>(null);
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [showEdgeForm, setShowEdgeForm] = useState(false);

  const {
    nodes,
    edges,
    filteredNodeCount,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useCgGraphData(filter);

  const handleSelectNode = useCallback((nodeId: string | null) => {
    setSelectedEntityId(nodeId);
  }, []);

  const highlightNodeIds = useMemo(
    () => (askResult ? new Set(askResult.nodeIds) : null),
    [askResult]
  );
  const highlightEdgeIds = useMemo(
    () => (askResult ? new Set(askResult.edgeIds) : null),
    [askResult]
  );

  const handleAskResult = useCallback((result: AskResult) => {
    setAskResult(result);
    setSelectedEntityId(null);
    setCameraResetNonce((n) => n + 1);
  }, []);

  const handleClearAsk = useCallback(() => setAskResult(null), []);

  const handleReset = useCallback(() => {
    setFilter(EMPTY_FILTER);
    setCameraResetNonce((n) => n + 1);
  }, []);

  const handleReload = useCallback(() => {
    refetch();
    setCameraResetNonce((n) => n + 1);
  }, [refetch]);

  const handleEdit = useCallback((entity: EntityRow) => {
    setEditingEntity(entity);
    setShowEntityForm(true);
  }, []);

  const handleCloseEntityForm = useCallback(() => {
    setShowEntityForm(false);
    setEditingEntity(null);
  }, []);

  usePageConfig({
    actions: (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Graph actions"
            className={topbarIconButtonClassName}
            size="sm"
            variant="outline"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              setEditingEntity(null);
              setShowEntityForm(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Entity
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowEdgeForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Edge
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleReload}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Reload graph
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => navigate("/admin/context-graph/sources")}
          >
            <BookUser className="mr-2 h-4 w-4" />
            Sources…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    breadcrumbs: [{ label: "Admin" }, { label: "Context Graph" }],
    topbarChrome: "contentBlend",
  });

  if (isLoading) {
    return (
      <section className="relative flex h-full flex-col">
        <div className="flex flex-1 items-center justify-center gap-3 text-muted-foreground text-sm">
          <Share2 className="h-5 w-5 animate-pulse opacity-50" />
          Loading graph…
        </div>
        <Skeleton className="h-full w-full rounded-xl" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="flex h-full items-center justify-center text-destructive text-sm">
        {String(error)}
      </section>
    );
  }

  return (
    <section className="relative flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        {/* Graph area */}
        <div
          className="relative min-h-0 flex-1 transition-all"
          style={{ marginRight: selectedEntityId ? 380 : 0 }}
        >
          {nodes.length > 0 ? (
            <CgGraphRenderer
              cameraResetNonce={cameraResetNonce}
              edges={edges}
              highlightEdgeIds={highlightEdgeIds}
              highlightNodeIds={highlightNodeIds}
              nodes={nodes}
              onSelectNode={handleSelectNode}
              selectedNodeId={selectedEntityId}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <Share2 className="h-12 w-12 opacity-20" />
              <p className="text-sm">
                No entities yet. Create one to get started.
              </p>
            </div>
          )}

          <CgAskBox
            onClear={handleClearAsk}
            onResult={handleAskResult}
            result={askResult}
          />

          <CgGraphControls
            entityTypes={ontology.entityTypes}
            filter={filter}
            isReloading={isRefetching}
            nodeCount={filteredNodeCount}
            onChange={setFilter}
            onNewEdge={() => setShowEdgeForm(true)}
            onNewEntity={() => {
              setEditingEntity(null);
              setShowEntityForm(true);
            }}
            onReload={handleReload}
            onReset={handleReset}
          />

          {/* Hint */}
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-muted-foreground text-xxs backdrop-blur-sm">
            Click a node to inspect · drag to pan · scroll to zoom
          </div>
        </div>

        {/* Entity detail panel */}
        {selectedEntityId && (
          <div className="absolute inset-y-0 right-0 w-[380px] overflow-hidden border-l bg-background shadow-lg">
            <EntityPanel
              entityId={selectedEntityId}
              onClose={() => setSelectedEntityId(null)}
              onEdit={handleEdit}
              onSelectEntity={setSelectedEntityId}
              ontology={ontology}
            />
          </div>
        )}
      </div>

      <EntityFormDialog
        entity={editingEntity}
        onClose={handleCloseEntityForm}
        ontology={ontology}
        open={showEntityForm}
      />
      <EdgeFormDialog
        onClose={() => setShowEdgeForm(false)}
        ontology={ontology}
        open={showEdgeForm}
        preselectedSubjectId={selectedEntityId ?? undefined}
      />
    </section>
  );
}
