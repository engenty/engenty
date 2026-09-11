// What this specialist is supposed to do — ONE compact list, one row per
// ROUTINE: name, and what wakes it in a few words ("Every 30 minutes ·
// Webhook"). Everything runnable is a routine; the workflow is the flow
// inside it. A workflow nobody wrapped gets a row too: "Awaiting publish"
// while it is still a DRAFT, otherwise a published flow that runs on request.
//
// Both lists are read at TENANT scope. This panel is about the agent, not
// about one Space, and the two sides must agree on scope: a space-filtered
// routine list against the tenant-wide workflow list drops every routine
// that lives outside the open Space, and each of its workflows then reads as
// unwrapped.
//
// A row opens the routine's detail in place of the list, with a back link:
// its state, the action, the trigger inventory, its runs, Run now. A draft
// row opens the workflow as a large modal over the list, which carries the
// graph inspector, an instruction box for AI edits and Publish — so a hire's
// proposed workflow is reviewed and turned on without leaving the drawer.

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  CardSection,
  Skeleton,
} from "@engenty/ui-core";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  Plus,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RoutineCreateDialog } from "../routines/routine-create-dialog.js";
import {
  RoutineDetailBody,
  RoutineDetailStateRow,
} from "../routines/routine-detail-body.js";
import { RoutineEditor } from "../routines/routine-editor.js";
import {
  routineBelongsToAgent,
  routineTriggers,
} from "../routines/routine-shape.js";
import type { RoutineDto } from "../routines/routines-api.js";
import {
  useDeleteCustomRoutineMutation,
  useRoutinesListQuery,
} from "../routines/routines-queries.js";
import type { WorkflowDto } from "../workflow-canvas/workflow-api.js";
import { WorkflowModal } from "../workflow-canvas/workflow-modal.js";
import { useWorkflowListQuery } from "../workflow-canvas/workflow-queries.js";

/**
 * What wakes the routine, in one line: the enabled triggers' detail ("Every
 * 30 minutes", "/daily", "Webhook") joined with a middle dot, the kind's
 * name when a trigger has no detail. A routine nobody wakes says so.
 */
function triggerSummary(routine: RoutineDto, locale: string): string {
  const isDe = locale.startsWith("de");
  const parts = routineTriggers(routine, locale)
    .filter((trigger) => trigger.enabled)
    .map((trigger) => trigger.detail ?? trigger.label);
  if (parts.length === 0) {
    return isDe ? "Kein Auslöser" : "No trigger";
  }
  return parts.join(" · ");
}

export function AgentWorkSections({
  agentId,
  locale = "en",
}: {
  agentId: string;
  locale?: string;
}) {
  const isDe = locale.startsWith("de");
  const [searchParams, setSearchParams] = useSearchParams();
  const openRoutineId = searchParams.get("routine");
  // An Action opened FROM a routine renders in place — the routine lives in its
  // Space, and clicking into its Action must not eject the user to the admin
  // area. URL state, so back/forward and reload land where you were.
  const openActionId = searchParams.get("workflow");
  const [isEditing, setIsEditing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const deleteMutation = useDeleteCustomRoutineMutation();
  const routinesQuery = useRoutinesListQuery(true, "tenant");
  const graphsQuery = useWorkflowListQuery();

  const routines = useMemo(
    () =>
      (routinesQuery.data?.routines ?? []).filter((routine: RoutineDto) =>
        routineBelongsToAgent(routine, agentId)
      ),
    [agentId, routinesQuery.data?.routines]
  );

  // One card per ROUTINE, plus one per unwrapped draft. A proposed workflow
  // must be findable on the page of the agent it was proposed for, or nobody
  // ever publishes it — publishing then creates its routine and the draft
  // card becomes a routine card.
  const cards = useMemo(() => {
    const graphs = graphsQuery.data?.graphs ?? [];
    const entries: {
      graph: WorkflowDto | null;
      graphId: string;
      routine: RoutineDto | null;
    }[] = routines.map((routine) => ({
      graph: graphs.find((graph) => graph.id === routine.workflow_id) ?? null,
      graphId: routine.workflow_id,
      routine,
    }));
    const wrapped = new Set(routines.map((routine) => routine.workflow_id));
    for (const graph of graphs) {
      if (graph.owner_agent_id === agentId && !wrapped.has(graph.id)) {
        entries.push({ graph, graphId: graph.id, routine: null });
      }
    }
    return entries;
  }, [agentId, graphsQuery.data?.graphs, routines]);

  const selectRoutine = useCallback(
    (routineId: string | null) => {
      setIsEditing(false);
      const next = new URLSearchParams(searchParams);
      if (routineId) {
        next.set("routine", routineId);
      } else {
        next.delete("routine");
      }
      next.delete("workflow");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const selectAction = useCallback(
    (workflowId: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (workflowId) {
        next.set("workflow", workflowId);
      } else {
        next.delete("workflow");
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const openRoutine = useMemo(
    () =>
      openRoutineId
        ? (routines.find((routine) => routine.id === openRoutineId) ?? null)
        : null,
    [openRoutineId, routines]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) {
      return;
    }
    await deleteMutation.mutateAsync(pendingDelete);
    setPendingDelete(null);
    selectRoutine(null);
  }, [deleteMutation, pendingDelete, selectRoutine]);

  if (routinesQuery.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const deleteDialog = (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) {
          setPendingDelete(null);
        }
      }}
      open={!!pendingDelete}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isDe ? "Routine löschen?" : "Delete routine?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isDe
              ? "Die Routine wacht dann nicht mehr auf. Ihre bisherigen Läufe bleiben erhalten."
              : "It will stop waking up. Its past runs stay."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>
            {isDe ? "Abbrechen" : "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteMutation.isPending}
            onClick={handleConfirmDelete}
          >
            {isDe ? "Löschen" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // The Action opens as a large modal OVER whatever view is behind it — the
  // list or a routine's detail — so closing it lands you exactly where you
  // clicked. URL state, so back/forward and reload land here too.
  const actionModal = openActionId ? (
    <WorkflowModal
      graphId={openActionId}
      onOpenChange={(next) => {
        if (!next) {
          selectAction(null);
        }
      }}
      open
    />
  ) : null;

  // Mounted only while open: the dialog runs routine mutations.
  const createDialog = createOpen ? (
    <RoutineCreateDialog
      defaultAgentId={agentId}
      locale={locale}
      onOpenChange={setCreateOpen}
      open
    />
  ) : null;

  if (openRoutine) {
    return (
      <div className="space-y-4">
        {/* One back link, two meanings: out of the form while editing, out of
            the routine while reading. Editing is a state of this view, not a
            place you navigated to. */}
        <Button
          className="-ml-2 gap-1 text-muted-foreground"
          onClick={() =>
            isEditing ? setIsEditing(false) : selectRoutine(null)
          }
          size="sm"
          type="button"
          variant="ghost"
        >
          <ChevronLeft className="size-4" />
          {isEditing
            ? isDe
              ? "Bearbeiten abbrechen"
              : "Cancel editing"
            : isDe
              ? "Zurück"
              : "Back"}
        </Button>

        {/* The state row stays in BOTH modes — it is part of the routine's
            identity, and hiding it while editing was one of the jumps that
            made edit mode feel like a different screen. */}
        <RoutineDetailStateRow locale={locale} routine={openRoutine} />

        {/* The title and description are the form's first two fields, so the
            panel does not print them a second time above the inputs. */}
        {isEditing ? null : (
          <div className="space-y-1">
            <h2 className="font-semibold text-xl tracking-tight">
              {openRoutine.name}
            </h2>
            {openRoutine.description ? (
              <p className="text-muted-foreground text-sm">
                {openRoutine.description}
              </p>
            ) : null}
          </div>
        )}

        {isEditing ? (
          <RoutineEditor
            defaultAgentId={agentId}
            key={openRoutine.id}
            locale={locale}
            onCancel={() => setIsEditing(false)}
            onOpenAction={selectAction}
            onSaved={() => setIsEditing(false)}
            routineToEdit={openRoutine}
          />
        ) : (
          <RoutineDetailBody
            // The page is the specialist's; naming it again is noise.
            hideAgent
            locale={locale}
            onDeleteCustom={setPendingDelete}
            onEditCustom={() => setIsEditing(true)}
            onOpenAction={selectAction}
            routine={openRoutine}
          />
        )}
        {deleteDialog}
        {actionModal}
      </div>
    );
  }

  return (
    <>
      <CardSection
        cardVariant="flush"
        headerVariant="compact"
        title={
          <>
            {isDe ? "Routinen" : "Routines"}
            <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
              {cards.length}
            </span>
          </>
        }
        titleAction={
          <Button
            aria-label={isDe ? "Routine hinzufügen" : "Add routine"}
            className="size-6"
            onClick={() => setCreateOpen(true)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Plus className="size-3.5" />
          </Button>
        }
      >
        {cards.length === 0 ? (
          <p className="px-3 py-2 text-muted-foreground text-sm">
            {isDe
              ? "Keine Routinen — dieser Spezialist arbeitet, wenn du mit ihm sprichst."
              : "No routines yet — this specialist works when you talk to it."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {cards.map((card) => {
              const cardKey = card.routine?.id ?? card.graphId;
              const title =
                card.routine?.name ??
                card.graph?.title ??
                card.graph?.name ??
                card.graphId;
              // Publication state lives on the workflow. An absent
              // routine says nothing about it: a module workflow ships
              // published and is pressed, never scheduled.
              const isDraft = card.graph?.status === "draft";
              const paused = card.routine ? !card.routine.enabled : false;
              return (
                <li key={cardKey}>
                  {/* One row, one click: a routine opens its detail, a draft
                      opens the canvas that carries Publish. */}
                  <button
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                    onClick={() =>
                      card.routine
                        ? selectRoutine(card.routine.id)
                        : selectAction(card.graphId)
                    }
                    type="button"
                  >
                    <CalendarClock
                      className={`size-4 shrink-0 ${
                        isDraft || paused
                          ? "text-muted-foreground"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-sm">{title}</p>
                      <p className="truncate text-muted-foreground text-xs">
                        {card.routine
                          ? triggerSummary(card.routine, locale)
                          : isDraft
                            ? isDe
                              ? "Noch keine Routine — beim Veröffentlichen wird eine angelegt."
                              : "No routine yet — publishing creates one."
                            : isDe
                              ? "Keine Routine — läuft auf Anfrage."
                              : "No routine — runs on request."}
                      </p>
                    </div>
                    {/* A draft is WAITING ON A HUMAN — the row must say so. A
                        paused routine is muted and says so; active is the
                        normal state and needs no pill. */}
                    {isDraft ? (
                      <Badge
                        className="shrink-0 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        variant="outline"
                      >
                        {isDe
                          ? "Wartet auf Veröffentlichung"
                          : "Awaiting publish"}
                      </Badge>
                    ) : paused ? (
                      <Badge className="shrink-0" variant="outline">
                        <CirclePause className="size-3" />
                        {isDe ? "Pausiert" : "Paused"}
                      </Badge>
                    ) : null}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardSection>
      {deleteDialog}
      {actionModal}
      {createDialog}
    </>
  );
}
