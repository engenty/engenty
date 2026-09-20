// Right rail: what this node actually does, in its own terms.
//
// The inspector shows a node's real arguments rather than raw JSON, because the
// arguments ARE the meaning — an agent node's brief, a tool node's operation, a
// gate's question. Raw JSON stays available behind a disclosure for the cases
// where someone needs the truth rather than the summary, and it is rendered in
// the same editor as the code view so its structure reads at a glance.
import { Badge, Button, cn, ScrollArea, Separator } from "@engenty/ui-core";
import { Braces, ListTree, X } from "lucide-react";
import { useState } from "react";
import { GateSurfaceCard } from "../wizard/gate-surface-card.js";
import type { CanvasNodeData, CanvasNodeKind } from "./graph-model.js";
import { JsonView } from "./json-view.js";
import type { GateSurfaceDto, GraphIssueDto } from "./workflow-api.js";

const KIND_TITLE: Record<CanvasNodeKind, string> = {
  agent: "Agent step",
  apply: "Apply updates",
  artifact: "Artifact",
  branch: "Branch",
  gate: "Approval gate",
  input: "Input",
  loop: "For each",
  output: "Result",
  parallel: "Parallel",
  render: "Show",
  subaction: "Workflow",
  tool: "Tool call",
  transform: "Transform",
  unknown: "Step",
  wait: "Wait",
};

const KIND_EXPLAINER: Record<CanvasNodeKind, string> = {
  agent:
    "Runs a specialist on this brief. The only place in the flow where judgment happens.",
  apply: "Writes the approved field patch to this run's subject.",
  artifact:
    "Produces a deliverable the person can open and download. It appears in their chat with this workflow's specialist.",
  branch: "Routes the flow on a condition. No model turn.",
  gate: "Pauses the run until a human decides. Nothing downstream happens first. In a wizard this is one page.",
  input:
    "What a press must provide. Validated before the run starts, and rendered as the run form.",
  loop: "Repeats the inner step for every item.",
  output:
    "The shape the run's result must match, checked when the run settles — a mismatch voids the run's verdict.",
  parallel: "Runs these steps at the same time.",
  render:
    "Draws a card in the specialist's chat. No model turn — it shows what earlier steps already produced.",
  subaction: "Runs another workflow as one step.",
  tool: "Calls a module operation with the run's service scope.",
  transform: "Reshapes data between steps. No model turn.",
  unknown: "Unrecognized step.",
  wait: "Parks the run until the time comes. Costs nothing while waiting.",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * The page a `surface` gate draws, when its constants carry one. The three
 * shorthand kinds (confirm, field_updates, choice) are expanded into a surface
 * on the server at suspend time; the inspector shows their constants as they
 * are written. A payload mapped from an earlier step is a reference string
 * here and is validated when the run reaches the gate.
 */
function gateSurfaceOf(args: Record<string, unknown>): GateSurfaceDto | null {
  if (args.kind !== "surface" || !isPlainObject(args.payload)) {
    return null;
  }
  const { components, data } = args.payload;
  if (!Array.isArray(components)) {
    return null;
  }
  return {
    components: components.filter(isPlainObject),
    ...(isPlainObject(data) ? { data } : {}),
  };
}

/** A JSON-Schema-shaped object: something with a `properties` map. */
function isSchemaLike(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value) && isPlainObject(value.properties);
}

/** `string`, `string[]`, `enum(a | b)`, `object` — one readable type word. */
function schemaTypeLabel(def: Record<string, unknown>): string {
  if (Array.isArray(def.enum)) {
    return `enum(${def.enum.map((v) => String(v)).join(" | ")})`;
  }
  const type = typeof def.type === "string" ? def.type : "any";
  if (type === "array") {
    const items = isPlainObject(def.items) ? def.items : {};
    return `${schemaTypeLabel(items)}[]`;
  }
  return type;
}

function SchemaFields({
  depth = 0,
  schema,
}: {
  depth?: number;
  schema: Record<string, unknown>;
}) {
  const properties = isPlainObject(schema.properties) ? schema.properties : {};
  const required = new Set(
    Array.isArray(schema.required) ? schema.required.map(String) : []
  );
  return (
    <div
      className={cn(
        "space-y-2",
        depth > 0 && "border-border-soft border-l pl-2.5"
      )}
    >
      {Object.entries(properties).map(([name, rawDef]) => {
        const def: Record<string, unknown> = isPlainObject(rawDef)
          ? rawDef
          : {};
        const items = isPlainObject(def.items) ? def.items : null;
        // Not the type guard: negating a guard over its own type narrows to
        // `never`, and both branches here are already plain objects.
        const nested = isPlainObject(def.properties)
          ? def
          : items && isPlainObject(items.properties)
            ? items
            : null;
        return (
          <div key={name}>
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span className="font-mono text-[11px]">
                {name}
                {required.has(name) ? (
                  <span className="text-destructive" title="required">
                    *
                  </span>
                ) : null}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {schemaTypeLabel(def)}
              </span>
            </div>
            {typeof def.description === "string" && def.description ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
                {def.description}
              </p>
            ) : null}
            {nested ? (
              <div className="mt-1.5">
                <SchemaFields depth={depth + 1} schema={nested} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** A schema argument: rendered as fields, with the raw JSON behind a toggle. */
function SchemaArg({ value }: { value: Record<string, unknown> }) {
  const [showJson, setShowJson] = useState(false);
  return (
    <div className="mt-1 rounded-md bg-muted/60 px-2.5 py-2">
      <div className="mb-1.5 flex justify-end gap-0.5">
        <button
          aria-label="Show as fields"
          aria-pressed={!showJson}
          className={cn(
            "rounded p-1 transition-colors",
            showJson
              ? "text-muted-foreground hover:text-foreground"
              : "bg-background text-foreground shadow-sm"
          )}
          onClick={() => setShowJson(false)}
          type="button"
        >
          <ListTree className="size-3.5" />
        </button>
        <button
          aria-label="Show as JSON"
          aria-pressed={showJson}
          className={cn(
            "rounded p-1 transition-colors",
            showJson
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setShowJson(true)}
          type="button"
        >
          <Braces className="size-3.5" />
        </button>
      </div>
      {showJson ? <JsonView value={value} /> : <SchemaFields schema={value} />}
    </div>
  );
}

export interface NodeInspectorProps {
  issues?: GraphIssueDto[];
  node: CanvasNodeData | null;
  onClose: () => void;
}

export function NodeInspector({
  issues = [],
  node,
  onClose,
}: NodeInspectorProps) {
  if (!node) {
    return null;
  }
  const nodeIssues = issues.filter(
    (issue) => issue.entryId && node.entryIds.includes(issue.entryId)
  );
  const surface = node.kind === "gate" ? gateSurfaceOf(node.args) : null;
  // The page IS the payload — drawing it twice (card and JSON) says nothing.
  const args = Object.entries(node.args).filter(
    ([key]) => !(surface && key === "payload")
  );

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l bg-card">
      <header className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="font-medium text-sm">{KIND_TITLE[node.kind]}</p>
          <p className="mt-0.5 truncate text-muted-foreground text-xs">
            {node.title}
          </p>
        </div>
        <Button
          aria-label="Close inspector"
          onClick={onClose}
          size="icon"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-4 py-4">
          <p className="text-muted-foreground text-xs leading-relaxed">
            {KIND_EXPLAINER[node.kind]}
          </p>

          {nodeIssues.length > 0 ? (
            <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="font-medium text-destructive text-xs">
                {nodeIssues.length === 1
                  ? "1 problem"
                  : `${nodeIssues.length} problems`}
              </p>
              <ul className="space-y-1.5">
                {nodeIssues.map((issue) => (
                  <li
                    className="text-xs leading-snug"
                    key={issue.path + issue.code}
                  >
                    <Badge className="mr-1.5 align-middle" variant="outline">
                      {issue.code}
                    </Badge>
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {surface ? (
            <div className="space-y-2">
              <Separator />
              <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                page
              </p>
              <GateSurfaceCard
                className="rounded-md border"
                gate={{
                  kind: "surface",
                  surface,
                  ...(typeof node.args.title === "string"
                    ? { title: node.args.title }
                    : {}),
                }}
                onSubmit={() => undefined}
                readOnly
              />
            </div>
          ) : null}

          {args.length > 0 ? (
            <div className="space-y-3">
              <Separator />
              {args.map(([key, value]) => (
                <div key={key}>
                  <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                    {key.replace(/_/g, " ")}
                  </p>
                  {isSchemaLike(value) ? (
                    <SchemaArg value={value} />
                  ) : typeof value === "string" ? (
                    // An agent's brief or a gate's question — prose, not
                    // structure. Colouring it would imply syntax it has none of.
                    <p className="mt-1 whitespace-pre-wrap break-words rounded-md bg-muted/60 px-2.5 py-2 text-[11px] leading-relaxed">
                      {value}
                    </p>
                  ) : (
                    <div className="mt-1">
                      <JsonView value={value} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              This step takes its input from the step before it.
            </p>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
