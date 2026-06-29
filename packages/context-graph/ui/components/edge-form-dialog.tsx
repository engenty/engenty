import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { OntologyResponse } from "../api.js";
import { createEdge, getEntities } from "../api.js";

interface Props {
  onClose: () => void;
  ontology: OntologyResponse;
  open: boolean;
  preselectedSubjectId?: string;
}

export function EdgeFormDialog({
  onClose,
  ontology,
  open,
  preselectedSubjectId,
}: Props) {
  const qc = useQueryClient();

  const [edgeType, setEdgeType] = useState("");
  const [subjectId, setSubjectId] = useState(preselectedSubjectId ?? "");
  const [objectId, setObjectId] = useState("");
  const [attrsJson, setAttrsJson] = useState("{}");
  const [attrsError, setAttrsError] = useState("");

  // The dialog stays mounted — reset the form each time it opens so it doesn't
  // show stale values or a stale preselected subject from a previous use.
  useEffect(() => {
    if (!open) {
      return;
    }
    setEdgeType("");
    setSubjectId(preselectedSubjectId ?? "");
    setObjectId("");
    setAttrsJson("{}");
    setAttrsError("");
  }, [open, preselectedSubjectId]);

  const entitiesQuery = useQuery({
    queryKey: ["context-graph", "entities", ""],
    queryFn: ({ signal }) => getEntities({}, signal),
    staleTime: 30_000,
    enabled: open,
  });

  const entities = entitiesQuery.data ?? [];

  const selectedEdgeTypeMeta = ontology.edgeTypes.find(
    (t) => t.id === edgeType
  );

  // Filter subject / object candidates by edge type constraints
  const subjectCandidates = selectedEdgeTypeMeta
    ? entities.filter((e) => selectedEdgeTypeMeta.subjectTypes.includes(e.type))
    : entities;
  const objectCandidates = selectedEdgeTypeMeta
    ? entities.filter((e) => selectedEdgeTypeMeta.objectTypes.includes(e.type))
    : entities;

  function parseAttrs(): Record<string, unknown> | null {
    try {
      const p = JSON.parse(attrsJson || "{}");
      if (typeof p !== "object" || p === null || Array.isArray(p)) {
        setAttrsError("Must be a JSON object");
        return null;
      }
      setAttrsError("");
      return p as Record<string, unknown>;
    } catch {
      setAttrsError("Invalid JSON");
      return null;
    }
  }

  const mut = useMutation({
    mutationFn: async () => {
      const attrs = parseAttrs();
      if (attrs === null) {
        throw new Error("Fix attributes JSON first");
      }
      if (!(edgeType && subjectId && objectId)) {
        throw new Error("All fields required");
      }
      return createEdge({
        type: edgeType,
        subjectId,
        objectId,
        attributes: attrs,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["context-graph", "edges"] });
      void qc.invalidateQueries({ queryKey: ["context-graph", "entity"] });
      toast.success("Edge created");
      onClose();
    },
    onError: (e) => toast.error(String(e)),
  });

  const entityLabel = (id: string) => {
    const e = entities.find((x) => x.id === id);
    return e
      ? (e.name ?? e.type.split(".").pop() ?? id.slice(0, 8))
      : id.slice(0, 8);
  };

  return (
    <Dialog onOpenChange={(o) => !o && onClose()} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Edge</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Edge Type</Label>
            <Select
              onValueChange={(v) => {
                setEdgeType(v);
                setSubjectId("");
                setObjectId("");
              }}
              value={edgeType}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select edge type…" />
              </SelectTrigger>
              <SelectContent>
                {ontology.edgeTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.displayName}
                    <span className="ml-1.5 text-muted-foreground text-xs">
                      ({t.id})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Subject (From)</Label>
            <Select onValueChange={setSubjectId} value={subjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select entity…" />
              </SelectTrigger>
              <SelectContent>
                {subjectCandidates.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {entityLabel(e.id)}
                    <span className="ml-1.5 text-muted-foreground text-xs">
                      {e.type.split(".").pop()}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Object (To)</Label>
            <Select onValueChange={setObjectId} value={objectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select entity…" />
              </SelectTrigger>
              <SelectContent>
                {objectCandidates.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {entityLabel(e.id)}
                    <span className="ml-1.5 text-muted-foreground text-xs">
                      {e.type.split(".").pop()}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Attributes (JSON, optional)</Label>
            <textarea
              className="h-20 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              onChange={(e) => {
                setAttrsJson(e.target.value);
                setAttrsError("");
              }}
              spellCheck={false}
              value={attrsJson}
            />
            {attrsError && (
              <p className="text-destructive text-xs">{attrsError}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!(edgeType && subjectId && objectId) || mut.isPending}
            onClick={() => mut.mutate()}
            type="button"
          >
            {mut.isPending ? "Creating…" : "Create Edge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
