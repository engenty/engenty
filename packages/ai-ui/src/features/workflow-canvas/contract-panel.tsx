"use client";

// One end of the flow's contract — its input or its result — edited as a FORM.
//
// The "no manual node editing" rule does not extend here: a contract is not a
// step, and prompting a model to add a parameter is the wrong grammar for a
// typed field list. Saving mints the NEXT version through the same route every
// other edit uses, so validation and the human publish gate stay untouched.
//
// One end at a time, because this rail IS the inspector for the node you
// clicked: opening Input and being shown the result too would answer a
// question nobody asked.
import { Button, Checkbox, Input, Label } from "@engenty/ui-core";
import { Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { StoredGraph } from "./graph-model.js";

type FieldType = "string" | "number" | "boolean";

export interface ContractField {
  description: string;
  name: string;
  required: boolean;
  type: FieldType;
}

/** JSON-schema object → editable rows. Unknown subtrees survive round-trip via `carry`. */
export function schemaToFields(schema: Record<string, unknown> | undefined): {
  carry: Record<string, unknown>;
  fields: ContractField[];
} {
  const properties = (schema?.properties ?? {}) as Record<
    string,
    Record<string, unknown> | undefined
  >;
  const required = Array.isArray(schema?.required)
    ? (schema?.required as unknown[]).filter(
        (name): name is string => typeof name === "string"
      )
    : [];
  const fields: ContractField[] = [];
  const carry: Record<string, unknown> = {};
  for (const [name, property] of Object.entries(properties)) {
    const type = property?.type;
    if (type === "string" || type === "number" || type === "boolean") {
      fields.push({
        description:
          typeof property?.description === "string" ? property.description : "",
        name,
        required: required.includes(name),
        type,
      });
    } else {
      // A shape this form cannot edit (array, nested object) is kept verbatim
      // rather than silently dropped on save.
      carry[name] = property;
    }
  }
  return { carry, fields };
}

export function fieldsToSchema(
  fields: ContractField[],
  carry: Record<string, unknown>
): Record<string, unknown> {
  const properties: Record<string, unknown> = { ...carry };
  const required: string[] = [];
  for (const field of fields) {
    const name = field.name.trim();
    if (!name) {
      continue;
    }
    properties[name] = {
      type: field.type,
      ...(field.description.trim()
        ? { description: field.description.trim() }
        : {}),
    };
    if (field.required) {
      required.push(name);
    }
  }
  return {
    properties,
    type: "object",
    ...(required.length > 0 ? { required } : {}),
  };
}

export function FieldRows({
  fields,
  idPrefix,
  onChange,
  readOnly = false,
}: {
  fields: ContractField[];
  idPrefix: string;
  onChange: (next: ContractField[]) => void;
  /** Bundled Action: the file is the definition, so this reads only. */
  readOnly?: boolean;
}) {
  const update = (index: number, patch: Partial<ContractField>) => {
    onChange(
      fields.map((field, at) => (at === index ? { ...field, ...patch } : field))
    );
  };
  if (readOnly && fields.length === 0) {
    return <p className="text-muted-foreground text-xs">None declared.</p>;
  }
  return (
    <div className="space-y-2">
      {fields.map((field, index) => (
        <div
          className="flex flex-wrap items-center gap-2"
          key={`${idPrefix}-${index}`}
        >
          <Input
            aria-label="Field name"
            className="h-8 w-36 font-mono text-xs"
            disabled={readOnly}
            onChange={(event) => update(index, { name: event.target.value })}
            placeholder="name"
            value={field.name}
          />
          <select
            aria-label="Field type"
            className="h-8 rounded-md border border-input bg-background px-1.5 text-xs"
            disabled={readOnly}
            onChange={(event) =>
              update(index, { type: event.target.value as FieldType })
            }
            value={field.type}
          >
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
          </select>
          <Label className="flex items-center gap-1.5 font-normal text-xs">
            <Checkbox
              checked={field.required}
              disabled={readOnly}
              onCheckedChange={(checked) =>
                update(index, { required: checked === true })
              }
            />
            required
          </Label>
          <Input
            aria-label="Field description"
            className="h-8 min-w-40 flex-1 text-xs"
            disabled={readOnly}
            onChange={(event) =>
              update(index, { description: event.target.value })
            }
            placeholder="description"
            value={field.description}
          />
          {readOnly ? null : (
            <Button
              aria-label="Remove field"
              className="h-8 w-8 p-0"
              onClick={() => onChange(fields.filter((_, at) => at !== index))}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Trash2 aria-hidden className="size-3.5" />
            </Button>
          )}
        </div>
      ))}
      {readOnly ? null : (
        <Button
          className="h-7 text-xs"
          onClick={() =>
            onChange([
              ...fields,
              { description: "", name: "", required: false, type: "string" },
            ])
          }
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus aria-hidden className="mr-1 size-3" />
          Add field
        </Button>
      )}
    </div>
  );
}

export type ContractSide = "input" | "output";

const SIDE_COPY: Record<
  ContractSide,
  {
    description: string;
    schemaKey: "inputSchema" | "outputSchema";
    title: string;
  }
> = {
  input: {
    description:
      "What a run of this workflow takes. Empty means it runs without input.",
    schemaKey: "inputSchema",
    title: "Input",
  },
  output: {
    description:
      "What it promises back. A declared result is checked when a run ends; empty keeps the answer prose.",
    schemaKey: "outputSchema",
    title: "Result",
  },
};

export function ContractPanel({
  busy = false,
  graph,
  onClose,
  onSave,
  readOnly = false,
  side,
}: {
  busy?: boolean;
  graph: StoredGraph;
  onClose?: () => void;
  /** Receives the full graph with this end edited — mint it as the next version. */
  onSave: (next: StoredGraph) => void;
  readOnly?: boolean;
  side: ContractSide;
}) {
  const copy = SIDE_COPY[side];
  const initial = useMemo(
    () => schemaToFields(graph[copy.schemaKey]),
    [copy.schemaKey, graph]
  );
  const [fields, setFields] = useState(initial.fields);

  const dirty = JSON.stringify(fields) !== JSON.stringify(initial.fields);

  return (
    // Same rail shape as the node inspector: this IS the inspector for the
    // contract node you clicked, so it opens and closes the same way.
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="font-medium text-sm">{copy.title}</p>
          <p className="mt-0.5 text-muted-foreground text-xs leading-snug">
            {copy.description}
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
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <FieldRows
          fields={fields}
          idPrefix={side}
          onChange={setFields}
          readOnly={readOnly}
        />
        {readOnly ? null : (
          <Button
            disabled={!dirty || busy}
            onClick={() =>
              onSave({
                ...graph,
                [copy.schemaKey]: fieldsToSchema(fields, initial.carry),
              })
            }
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
