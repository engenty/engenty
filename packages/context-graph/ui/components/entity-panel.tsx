import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
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
} from "@engenty/ui-core";
import { Edit2, ExternalLink, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { EntityRow, OntologyResponse } from "../api.js";
import { deleteEdge, deleteEntity, getEntityDetail } from "../api.js";

interface Props {
  entityId: string;
  onClose: () => void;
  onEdit: (entity: EntityRow) => void;
  onSelectEntity: (id: string) => void;
  ontology: OntologyResponse;
}

export function EntityPanel({
  entityId,
  ontology,
  onClose,
  onEdit,
  onSelectEntity,
}: Props) {
  const qc = useQueryClient();
  const [confirmDeleteEntity, setConfirmDeleteEntity] = useState(false);
  const [deletingEdgeId, setDeletingEdgeId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["context-graph", "entity", entityId],
    queryFn: ({ signal }) => getEntityDetail(entityId, signal),
    staleTime: 15_000,
  });

  const entityType = data
    ? ontology.entityTypes.find((t) => t.id === data.entity.type)
    : undefined;

  const deleteMut = useMutation({
    mutationFn: () => deleteEntity(entityId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["context-graph"] });
      toast.success("Entity deleted");
      onClose();
    },
    onError: (e) => toast.error(String(e)),
  });

  const deleteEdgeMut = useMutation({
    mutationFn: (id: string) => deleteEdge(id),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["context-graph", "entity", entityId],
      });
      void qc.invalidateQueries({ queryKey: ["context-graph", "edges"] });
      toast.success("Edge removed");
    },
    onError: (e) => toast.error(String(e)),
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  if (!data) {
    return null;
  }
  const { entity, outgoing, incoming, connectedNames } = data;
  const attrKeys = Object.keys(entity.attributes ?? {});

  const edgeTypeLabel = (type: string) =>
    ontology.edgeTypes.find((t) => t.id === type)?.displayName ??
    type.split(".").pop() ??
    type;
  const nameOf = (id: string) => connectedNames?.[id] ?? `${id.slice(0, 8)}…`;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-2 border-b p-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-sm">
            {entity.name ?? entity.id.slice(0, 12)}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <Badge className="text-xxs" variant="secondary">
              {entityType?.displayName ?? entity.type}
            </Badge>
            {entity.external_ref && (
              <Badge className="text-xxs" variant="outline">
                <ExternalLink className="mr-1 h-2.5 w-2.5" />
                {entity.external_ref.module}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            className="h-7 w-7"
            onClick={() => onEdit(entity)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            className="h-7 w-7 text-destructive hover:text-destructive"
            disabled={deleteMut.isPending}
            onClick={() => setConfirmDeleteEntity(true)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            className="h-7 w-7"
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Attributes */}
        {attrKeys.length > 0 && (
          <section className="border-b p-3">
            <div className="mb-1.5 font-medium text-muted-foreground text-xxs uppercase tracking-wide">
              Attributes
            </div>
            <dl className="space-y-1">
              {attrKeys.map((k) => (
                <div className="flex gap-2 text-xs" key={k}>
                  <dt className="min-w-0 shrink-0 font-mono text-muted-foreground">
                    {k}
                  </dt>
                  <dd className="min-w-0 truncate">
                    {String(entity.attributes[k])}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* Outgoing edges */}
        {outgoing.length > 0 && (
          <EdgeList
            edges={outgoing}
            edgeTypeLabel={edgeTypeLabel}
            label="Out"
            nameOf={nameOf}
            onDelete={(id) => setDeletingEdgeId(id)}
            onSelectEntity={onSelectEntity}
          />
        )}

        {/* Incoming edges */}
        {incoming.length > 0 && (
          <EdgeList
            edges={incoming}
            edgeTypeLabel={edgeTypeLabel}
            label="In"
            nameOf={nameOf}
            onDelete={(id) => setDeletingEdgeId(id)}
            onSelectEntity={onSelectEntity}
          />
        )}

        {attrKeys.length === 0 &&
          outgoing.length === 0 &&
          incoming.length === 0 && (
            <div className="p-3 text-muted-foreground text-xs">
              No attributes or connections.
            </div>
          )}
      </div>

      <AlertDialog
        onOpenChange={(o) => !o && setConfirmDeleteEntity(false)}
        open={confirmDeleteEntity}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entity?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the entity and all of its edges. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmDeleteEntity(false);
                deleteMut.mutate();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(o) => !o && setDeletingEdgeId(null)}
        open={deletingEdgeId !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this connection?</AlertDialogTitle>
            <AlertDialogDescription>
              The edge will be deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!deletingEdgeId}
              onClick={() => {
                if (deletingEdgeId) {
                  deleteEdgeMut.mutate(deletingEdgeId);
                }
                setDeletingEdgeId(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EdgeList({
  edges,
  edgeTypeLabel,
  label,
  nameOf,
  onDelete,
  onSelectEntity,
}: {
  edges: { id: string; type: string; subject_id: string; object_id: string }[];
  edgeTypeLabel: (type: string) => string;
  label: string;
  nameOf: (id: string) => string;
  onDelete: (id: string) => void;
  onSelectEntity: (id: string) => void;
}) {
  const isOut = label === "Out";
  return (
    <section className="border-b p-3">
      <div className="mb-1.5 font-medium text-muted-foreground text-xxs uppercase tracking-wide">
        {isOut ? "Outgoing" : "Incoming"}
      </div>
      <ul className="space-y-1.5">
        {edges.map((e) => {
          const otherId = isOut ? e.object_id : e.subject_id;
          return (
            <li className="flex items-center gap-2" key={e.id}>
              <button
                className="min-w-0 flex-1 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted"
                onClick={() => onSelectEntity(otherId)}
                title={`Open ${nameOf(otherId)}`}
                type="button"
              >
                <div className="truncate font-medium text-xs hover:underline">
                  {nameOf(otherId)}
                </div>
                <div className="truncate text-muted-foreground text-xxs">
                  {isOut ? edgeTypeLabel(e.type) : `${edgeTypeLabel(e.type)} →`}
                </div>
              </button>
              <Button
                className="h-5 w-5 shrink-0 text-destructive hover:text-destructive"
                onClick={() => onDelete(e.id)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
