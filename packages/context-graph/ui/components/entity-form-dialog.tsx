import { useMutation, useQueryClient } from "@engenty/query-client";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { EntityRow, OntologyResponse } from "../api.js";
import { createEntity, updateEntity } from "../api.js";

interface Props {
  entity: EntityRow | null;
  onClose: () => void;
  ontology: OntologyResponse;
  open: boolean;
}

export function EntityFormDialog({ entity, ontology, onClose, open }: Props) {
  const qc = useQueryClient();
  const isEdit = !!entity;

  const [type, setType] = useState(entity?.type ?? "");
  const [name, setName] = useState(entity?.name ?? "");
  const [attrsJson, setAttrsJson] = useState(
    entity ? JSON.stringify(entity.attributes ?? {}, null, 2) : "{}"
  );
  const [attrsError, setAttrsError] = useState("");

  // The dialog stays mounted, so re-sync the form whenever it opens or the
  // target entity changes — otherwise the initial (empty) state sticks.
  useEffect(() => {
    if (!open) {
      return;
    }
    setType(entity?.type ?? "");
    setName(entity?.name ?? "");
    setAttrsJson(
      entity ? JSON.stringify(entity.attributes ?? {}, null, 2) : "{}"
    );
    setAttrsError("");
  }, [open, entity]);

  function parseAttrs(): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(attrsJson || "{}");
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        setAttrsError("Must be a JSON object");
        return null;
      }
      setAttrsError("");
      return parsed as Record<string, unknown>;
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
      if (isEdit) {
        return updateEntity(entity.id, {
          name: name.trim() || null,
          attributes: attrs,
        });
      }
      return createEntity({
        type,
        name: name.trim() || null,
        attributes: attrs,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["context-graph", "entities"] });
      void qc.invalidateQueries({ queryKey: ["context-graph", "edges"] });
      toast.success(isEdit ? "Entity updated" : "Entity created");
      onClose();
    },
    onError: (e) => toast.error(String(e)),
  });

  const selectedTypeMeta = ontology.entityTypes.find((t) => t.id === type);

  return (
    <Dialog onOpenChange={(o) => !o && onClose()} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Entity" : "New Entity"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select onValueChange={setType} value={type}>
                <SelectTrigger>
                  <SelectValue placeholder="Select entity type…" />
                </SelectTrigger>
                <SelectContent>
                  {ontology.entityTypes.map((t) => (
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
          )}

          {isEdit && (
            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="rounded-md border bg-muted/50 px-3 py-2 text-muted-foreground text-sm">
                {selectedTypeMeta?.displayName ?? entity.type}
                <span className="ml-1.5 font-mono text-xs">
                  ({entity.type})
                </span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional display name"
              value={name}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Attributes (JSON)</Label>
            <textarea
              className="h-32 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
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
            disabled={!(isEdit || type) || mut.isPending}
            onClick={() => mut.mutate()}
            type="button"
          >
            {mut.isPending ? "Saving…" : isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
