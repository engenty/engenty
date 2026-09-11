import type { ReactNode } from "react";
import type { ActionDraft } from "./workflow-draft";

// The action spec, read-only: an action is a module-shipped workflow, so this
// card only renders what the module declared.
interface ActionSpecificationCardProps {
  draft: ActionDraft;
  labels: {
    actionKey: string;
    agentId: string;
    allowedTools: string;
    constraintsColumn: string;
    contextType: string;
    descriptionColumn: string;
    inputSchema: string;
    moduleId: string;
    /** Shown when an optional field has no value. */
    notSet: string;
    propertyColumn: string;
    skillKeys: string;
    typeColumn: string;
  };
}

function SpecRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <li className="text-foreground">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-muted-foreground">: </span>
      {children}
    </li>
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function summarizeJsonSchemaProperty(def: unknown): {
  constraints: string;
  description: string | null;
  typeLabel: string;
} {
  if (!isPlainObject(def)) {
    return {
      constraints: "",
      description: null,
      typeLabel: typeof def === "string" ? def : "—",
    };
  }
  const typeRaw = def.type;
  let typeLabel = Array.isArray(typeRaw)
    ? typeRaw.map(String).join(" | ")
    : typeof typeRaw === "string"
      ? typeRaw
      : "object";
  if (typeLabel === "array" && isPlainObject(def.items)) {
    const items = def.items as Record<string, unknown>;
    const itemType = items.type;
    const itemEnum = Array.isArray(items.enum)
      ? items.enum.map(String).join(" | ")
      : null;
    typeLabel = itemEnum
      ? `array<enum: ${itemEnum}>`
      : typeof itemType === "string"
        ? `array<${itemType}>`
        : "array";
  }
  const description =
    typeof def.description === "string" ? def.description : null;
  const parts: string[] = [];
  if (typeof def.minLength === "number") {
    parts.push(`minLength: ${def.minLength}`);
  }
  if (typeof def.maxLength === "number") {
    parts.push(`maxLength: ${def.maxLength}`);
  }
  if (def.format) {
    parts.push(`format: ${String(def.format)}`);
  }
  if (Array.isArray(def.enum)) {
    parts.push(`enum: ${def.enum.map(String).join(", ")}`);
  }
  if (def.default !== undefined) {
    parts.push(`default: ${JSON.stringify(def.default)}`);
  }
  if (def.additionalProperties === false) {
    parts.push("additionalProperties: false");
  }
  return {
    constraints: parts.join(" · "),
    description,
    typeLabel,
  };
}

function CompactJsonSnippet({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  return (
    <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded border border-border-soft bg-background/50 px-2 py-1.5 font-mono text-[11px] text-foreground/90 leading-snug">
      {text}
    </pre>
  );
}

export function CompactInputSchemaTable({
  labels,
  schema,
}: {
  labels: {
    constraintsColumn: string;
    descriptionColumn: string;
    propertyColumn: string;
    typeColumn: string;
  };
  schema: Record<string, unknown>;
}) {
  const rootDescription =
    typeof schema.description === "string" ? schema.description : null;
  const propsRaw = schema.properties;
  if (!isPlainObject(propsRaw)) {
    return <CompactJsonSnippet value={schema} />;
  }
  const entries = Object.entries(propsRaw);
  if (entries.length === 0) {
    return (
      <div className="mt-1 space-y-1">
        {rootDescription ? (
          <p className="text-[11px] text-muted-foreground leading-snug">
            {rootDescription}
          </p>
        ) : null}
        <CompactJsonSnippet value={schema} />
      </div>
    );
  }
  const required = new Set(
    Array.isArray(schema.required) ? schema.required.map((k) => String(k)) : []
  );
  return (
    <div className="mt-1 space-y-1.5">
      {rootDescription ? (
        <p className="text-[11px] text-muted-foreground leading-snug">
          {rootDescription}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded border border-border-soft bg-background/40">
        <table className="w-full min-w-[28rem] border-collapse text-left text-[11px] leading-snug">
          <thead>
            <tr className="border-border-soft border-b bg-muted/30">
              <th className="px-2 py-1.5 font-medium text-muted-foreground">
                {labels.propertyColumn}
              </th>
              <th className="px-2 py-1.5 font-medium text-muted-foreground">
                {labels.typeColumn}
              </th>
              <th className="px-2 py-1.5 font-medium text-muted-foreground">
                {labels.descriptionColumn}
              </th>
              <th className="px-2 py-1.5 font-medium text-muted-foreground">
                {labels.constraintsColumn}
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([propKey, propDef]) => {
              const { constraints, description, typeLabel } =
                summarizeJsonSchemaProperty(propDef);
              return (
                <tr
                  className="border-border-soft border-b last:border-0"
                  key={propKey}
                >
                  <td className="px-2 py-1.5 font-mono text-foreground">
                    {propKey}
                    {required.has(propKey) ? (
                      <span className="ml-0.5 text-destructive">*</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-muted-foreground">
                    {typeLabel}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {description ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {constraints || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SpecValue({ empty, value }: { empty: string; value: string }) {
  return value.trim() ? (
    <span className="text-foreground">{value}</span>
  ) : (
    <span className="text-muted-foreground">{empty}</span>
  );
}

export function ActionSpecificationCard({
  draft,
  labels,
}: ActionSpecificationCardProps) {
  return (
    <div className="mb-6 rounded-md border border-border-soft bg-card p-3.5 text-sm shadow-sm">
      <ul className="space-y-1 font-mono text-[11px] leading-relaxed tracking-tight">
        <SpecRow label={labels.actionKey}>
          <SpecValue empty={labels.notSet} value={draft.action_key} />
        </SpecRow>
        <SpecRow label={labels.agentId}>
          <SpecValue empty={labels.notSet} value={draft.agent_id} />
        </SpecRow>
        <SpecRow label={labels.moduleId}>
          <SpecValue empty={labels.notSet} value={draft.module_id} />
        </SpecRow>
        <SpecRow label={labels.contextType}>
          <SpecValue empty={labels.notSet} value={draft.context_type} />
        </SpecRow>
        <SpecRow label={labels.skillKeys}>
          <SpecValue empty={labels.notSet} value={draft.skills.join(", ")} />
        </SpecRow>
        <SpecRow label={labels.allowedTools}>
          <SpecValue
            empty={labels.notSet}
            value={draft.allowed_tools.join(" ")}
          />
        </SpecRow>
      </ul>
      <div className="mt-2.5 border-border-soft border-t pt-2">
        <p className="font-mono text-[11px] text-muted-foreground tracking-tight">
          {labels.inputSchema}
        </p>
        <CompactInputSchemaTable
          labels={{
            constraintsColumn: labels.constraintsColumn,
            descriptionColumn: labels.descriptionColumn,
            propertyColumn: labels.propertyColumn,
            typeColumn: labels.typeColumn,
          }}
          schema={draft.input_schema_json}
        />
      </div>
    </div>
  );
}
