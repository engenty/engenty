import { EditableText } from "@engenty/ui-core";
import type { ReactNode } from "react";
import type { ActionDraft } from "./action-draft";

interface ActionSpecificationCardProps {
  draft: ActionDraft;
  isEditing: boolean;
  labels: {
    actionKey: string;
    agentId: string;
    contextType: string;
    defaultThreadMode: string;
    moduleId: string;
    /** Shown when an optional text field has no value in read-only mode. */
    notSet: string;
  };
  onActionKeyChange: (value: string) => void;
  onAgentIdChange: (value: string) => void;
  onContextTypeChange: (value: string) => void;
  onDefaultThreadModeChange: (value: string) => void;
  /**
   * Extra metadata in the same compact card (view mode only).
   * Omit while editing — those fields use the full editors below.
   */
  readonlyExtensions?: {
    constraintsColumn: string;
    descriptionColumn: string;
    inputSchemaLabel: string;
    instructionKeysLabel: string;
    notSet: string;
    propertyColumn: string;
    skillKeysLabel: string;
    allowedToolsLabel: string;
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

function editableValueClass(isEditing: boolean) {
  return isEditing
    ? "inline rounded-sm px-1 py-0.5 text-foreground"
    : "inline text-foreground";
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
    <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded border border-border/35 bg-background/50 px-2 py-1.5 font-mono text-[11px] text-foreground/90 leading-snug">
      {text}
    </pre>
  );
}

function CompactInputSchemaTable({
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
      <div className="overflow-x-auto rounded border border-border/35 bg-background/40">
        <table className="w-full min-w-[28rem] border-collapse text-left text-[11px] leading-snug">
          <thead>
            <tr className="border-border/40 border-b bg-muted/30">
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
                  className="border-border/25 border-b last:border-0"
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

export function ActionSpecificationCard({
  draft,
  isEditing,
  labels,
  onActionKeyChange,
  onAgentIdChange,
  onContextTypeChange,
  onDefaultThreadModeChange,
  readonlyExtensions,
}: ActionSpecificationCardProps) {
  const rx = isEditing ? undefined : readonlyExtensions;
  const hasAllowedTools = draft.allowed_tools.length > 0;
  const empty = rx?.notSet ?? labels.notSet;

  return (
    <div className="mb-6 rounded-md border border-border/60 bg-card p-3.5 text-sm shadow-sm">
      <ul className="space-y-1 font-mono text-[11px] leading-relaxed tracking-tight">
        <SpecRow label={labels.actionKey}>
          {isEditing ? (
            <EditableText
              as="span"
              className={editableValueClass(true)}
              isPreview={false}
              onSave={onActionKeyChange}
              onUpdate={onActionKeyChange}
              placeholder={labels.notSet}
              value={draft.action_key}
              variant="filled"
            />
          ) : draft.action_key.trim() ? (
            <span className="text-foreground">{draft.action_key}</span>
          ) : (
            <span className="text-muted-foreground">{labels.notSet}</span>
          )}
        </SpecRow>
        <SpecRow label={labels.agentId}>
          {isEditing ? (
            <EditableText
              as="span"
              className={editableValueClass(true)}
              isPreview={false}
              onSave={onAgentIdChange}
              onUpdate={onAgentIdChange}
              placeholder={labels.notSet}
              value={draft.agent_id}
              variant="filled"
            />
          ) : draft.agent_id.trim() ? (
            <span className="text-foreground">{draft.agent_id}</span>
          ) : (
            <span className="text-muted-foreground">{labels.notSet}</span>
          )}
        </SpecRow>
        <SpecRow label={labels.moduleId}>
          {draft.module_id.trim() ? (
            <span className="text-foreground">{draft.module_id}</span>
          ) : (
            <span className="text-muted-foreground">{labels.notSet}</span>
          )}
        </SpecRow>
        <SpecRow label={labels.defaultThreadMode}>
          {isEditing ? (
            <EditableText
              as="span"
              className={editableValueClass(true)}
              isPreview={false}
              onSave={onDefaultThreadModeChange}
              onUpdate={onDefaultThreadModeChange}
              placeholder={labels.notSet}
              value={draft.default_thread_mode}
              variant="filled"
            />
          ) : draft.default_thread_mode ? (
            <span className="text-foreground">{draft.default_thread_mode}</span>
          ) : (
            <span className="text-muted-foreground">{labels.notSet}</span>
          )}
        </SpecRow>
        <SpecRow label={labels.contextType}>
          {isEditing ? (
            <EditableText
              as="span"
              className={editableValueClass(true)}
              isPreview={false}
              onSave={onContextTypeChange}
              onUpdate={onContextTypeChange}
              placeholder={labels.notSet}
              value={draft.context_type}
              variant="filled"
            />
          ) : draft.context_type.trim() ? (
            <span className="text-foreground">{draft.context_type}</span>
          ) : (
            <span className="text-muted-foreground">{labels.notSet}</span>
          )}
        </SpecRow>
      </ul>

      {rx ? (
        <>
          <div aria-hidden className="my-2.5 h-px bg-border/45" />
          <ul className="space-y-1 font-mono text-[11px] leading-relaxed tracking-tight">
            <SpecRow label={rx.instructionKeysLabel}>
              {draft.instruction_keys.length > 0 ? (
                <span className="text-foreground">
                  {draft.instruction_keys.join(", ")}
                </span>
              ) : (
                <span className="text-muted-foreground">{empty}</span>
              )}
            </SpecRow>
            <SpecRow label={rx.skillKeysLabel}>
              {draft.skills.length > 0 ? (
                <span className="text-foreground">
                  {draft.skills.join(", ")}
                </span>
              ) : (
                <span className="text-muted-foreground">{empty}</span>
              )}
            </SpecRow>
            <SpecRow label={rx.allowedToolsLabel}>
              {hasAllowedTools ? (
                <span className="text-foreground">
                  {draft.allowed_tools.join(" ")}
                </span>
              ) : (
                <span className="text-muted-foreground">{empty}</span>
              )}
            </SpecRow>
          </ul>
          <div className="mt-2.5 border-border/35 border-t pt-2">
            <p className="font-mono text-[11px] text-muted-foreground tracking-tight">
              {rx.inputSchemaLabel}
            </p>
            <CompactInputSchemaTable
              labels={{
                constraintsColumn: rx.constraintsColumn,
                descriptionColumn: rx.descriptionColumn,
                propertyColumn: rx.propertyColumn,
                typeColumn: rx.typeColumn,
              }}
              schema={draft.input_schema_json}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
