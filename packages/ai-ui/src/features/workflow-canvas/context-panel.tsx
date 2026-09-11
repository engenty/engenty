"use client";

// The Action's CONTEXT: shared state, the request-context contract, and
// metadata — everything the definition carries that is not a step.
//
// Input and Result are drawn as nodes because a run passes THROUGH them.
// These three apply to every step at once, so a shape on the canvas would be a
// lie — there is no edge into shared state. They get a rail instead, and it is
// the only place they are reachable.
import { Button, cn } from "@engenty/ui-core";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { WorkspaceCodeEditor } from "../agents-workspace/workspace-code-editor.js";
import { FieldRows, fieldsToSchema, schemaToFields } from "./contract-panel.js";
import type { StoredGraph } from "./graph-model.js";

/**
 * Keys engenty reads off `metadata` — at module load for a shipped Action,
 * from the row for one authored here. Editing them on the graph changes
 * nothing, so the rail says so rather than letting someone find out.
 */
const DERIVED_KEYS = [
  "title",
  "owner_agent_id",
  "context_type",
  "allowed_tools",
  "skills",
];

export function ContextPanel({
  busy = false,
  graph,
  onClose,
  onSave,
  readOnly = false,
}: {
  busy?: boolean;
  graph: StoredGraph;
  onClose?: () => void;
  /** Receives the full graph with these fields edited — mint it as the next version. */
  onSave: (next: StoredGraph) => void;
  /** Bundled Action: the file is the definition, so this reads only. */
  readOnly?: boolean;
}) {
  const initial = useMemo(
    () => ({
      metadata: JSON.stringify(graph.metadata ?? {}, null, 2),
      requestContext: schemaToFields(graph.requestContextSchema),
      state: schemaToFields(graph.stateSchema),
    }),
    [graph]
  );
  const [stateFields, setStateFields] = useState(initial.state.fields);
  const [contextFields, setContextFields] = useState(
    initial.requestContext.fields
  );
  const [metadata, setMetadata] = useState(initial.metadata);

  // Parsed on every keystroke rather than on save: a rail that lets you type a
  // broken object and only objects at the end has already wasted the edit.
  const metadataError = (() => {
    try {
      const parsed = JSON.parse(metadata) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return "Metadata must be a JSON object.";
      }
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Invalid JSON";
    }
  })();

  const dirty =
    JSON.stringify(stateFields) !== JSON.stringify(initial.state.fields) ||
    JSON.stringify(contextFields) !==
      JSON.stringify(initial.requestContext.fields) ||
    metadata !== initial.metadata;

  const save = () => {
    if (metadataError) {
      return;
    }
    const next: StoredGraph = { ...graph };
    // All three are optional in the format. Writing an empty object schema for
    // a field nobody filled in would put noise in the stored definition and
    // make an untouched Action read as one that declares empty state.
    if (stateFields.length > 0) {
      next.stateSchema = fieldsToSchema(stateFields, initial.state.carry);
    } else {
      next.stateSchema = undefined;
    }
    if (contextFields.length > 0) {
      next.requestContextSchema = fieldsToSchema(
        contextFields,
        initial.requestContext.carry
      );
    } else {
      next.requestContextSchema = undefined;
    }
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    if (Object.keys(parsed).length > 0) {
      next.metadata = parsed;
    } else {
      next.metadata = undefined;
    }
    onSave(next);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="font-medium text-sm">Context</p>
          <p className="mt-0.5 text-muted-foreground text-xs leading-snug">
            What the whole Action carries, rather than one step.
          </p>
        </div>
        {onClose ? (
          <Button
            aria-label="Close"
            onClick={onClose}
            size="icon"
            variant="ghost"
          >
            <X aria-hidden className="size-4" />
          </Button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <section>
          <h3 className="mb-1 font-medium text-sm">State</h3>
          <p className="mb-2 text-muted-foreground text-xs leading-snug">
            Values every step can read and write for the length of one run.
          </p>
          <FieldRows
            fields={stateFields}
            idPrefix="state"
            onChange={setStateFields}
            readOnly={readOnly}
          />
        </section>
        <section>
          <h3 className="mb-1 font-medium text-sm">Request context</h3>
          <p className="mb-2 text-muted-foreground text-xs leading-snug">
            What the steps expect to find on the run's context — set by whoever
            starts the run, never by a step.
          </p>
          <FieldRows
            fields={contextFields}
            idPrefix="context"
            onChange={setContextFields}
            readOnly={readOnly}
          />
        </section>
        <section>
          <h3 className="mb-1 font-medium text-sm">Metadata</h3>
          <p className="mb-2 text-muted-foreground text-xs leading-snug">
            Arbitrary JSON, carried through storage untouched.{" "}
            {DERIVED_KEYS.join(", ")} are read when the Action is registered
            {readOnly ? "." : " — changing them here does not move the Action."}
          </p>
          {/* The one field here that is free-form JSON rather than a typed
            row, so it gets the same editor the code view uses — brackets and
            strings coloured, and a parse error visible while you type. */}
          <div
            className={cn(
              "flex h-52 overflow-hidden rounded-md border",
              metadataError && "border-destructive"
            )}
          >
            <WorkspaceCodeEditor
              filePath="metadata.json"
              onChange={setMetadata}
              readOnly={readOnly}
              value={metadata}
            />
          </div>
          {metadataError ? (
            <p className="mt-1 text-destructive text-xs">{metadataError}</p>
          ) : null}
        </section>
        {readOnly ? null : (
          <Button
            disabled={!dirty || busy || Boolean(metadataError)}
            onClick={save}
            size="sm"
            type="button"
          >
            {busy ? "Saving…" : "Save as next version"}
          </Button>
        )}
      </div>
    </div>
  );
}
