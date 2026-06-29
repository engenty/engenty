import {
  Checkbox,
  Input,
  Label,
  MultiSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";

export interface ActionInputField {
  /** For `type: "array"` with `items.enum` — the allowed item values. */
  arrayEnumValues?: string[];
  description?: string;
  /** Single-select enum (string/number property with `enum`). */
  enumValues?: string[];
  isArray: boolean;
  key: string;
  required: boolean;
  type: string;
}

/** Flattens an action `input_schema_json` into renderable top-level fields. */
export function deriveActionInputFields(
  schema: Record<string, unknown> | null | undefined
): ActionInputField[] {
  const properties = schema?.properties as
    | Record<
        string,
        {
          type?: string;
          description?: string;
          enum?: unknown[];
          items?: { enum?: unknown[] };
        }
      >
    | undefined;
  if (!properties) {
    return [];
  }
  const required = new Set((schema?.required as string[] | undefined) ?? []);
  return Object.entries(properties).map(([key, prop]) => {
    const isArray = prop.type === "array";
    return {
      arrayEnumValues:
        isArray && Array.isArray(prop.items?.enum)
          ? prop.items.enum.map((entry) => String(entry))
          : undefined,
      description: prop.description,
      enumValues:
        !isArray && Array.isArray(prop.enum)
          ? prop.enum.map((entry) => String(entry))
          : undefined,
      isArray,
      key,
      required: required.has(key),
      type: prop.type ?? "string",
    };
  });
}

interface ActionInputFormProps {
  fields: ActionInputField[];
  onChange: (key: string, value: unknown) => void;
  values: Record<string, unknown>;
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

export function ActionInputForm({
  fields,
  values,
  onChange,
}: ActionInputFormProps) {
  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <div className="grid gap-1.5" key={field.key}>
          <Label
            className="font-medium text-sm"
            htmlFor={`action-in-${field.key}`}
          >
            {field.key}
            {field.required ? (
              <span className="ml-1 text-destructive">*</span>
            ) : null}
          </Label>
          {field.isArray && field.arrayEnumValues ? (
            <MultiSelect
              defaultValue={asArray(values[field.key])}
              hideSelectAll
              onValueChange={(value) => onChange(field.key, value)}
              options={field.arrayEnumValues.map((option) => ({
                label: option,
                value: option,
              }))}
              resetOnDefaultValueChange
              showClear
            />
          ) : field.isArray ? (
            <Input
              id={`action-in-${field.key}`}
              onChange={(event) => onChange(field.key, event.target.value)}
              placeholder="comma-separated"
              value={
                Array.isArray(values[field.key])
                  ? (values[field.key] as string[]).join(", ")
                  : ((values[field.key] as string | undefined) ?? "")
              }
            />
          ) : field.enumValues ? (
            <Select
              onValueChange={(value) => onChange(field.key, value)}
              value={(values[field.key] as string | undefined) ?? ""}
            >
              <SelectTrigger id={`action-in-${field.key}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {field.enumValues.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : field.type === "boolean" ? (
            <Checkbox
              checked={Boolean(values[field.key])}
              id={`action-in-${field.key}`}
              onCheckedChange={(checked) =>
                onChange(field.key, checked === true)
              }
            />
          ) : (
            <Input
              id={`action-in-${field.key}`}
              onChange={(event) => onChange(field.key, event.target.value)}
              type={
                field.type === "number" || field.type === "integer"
                  ? "number"
                  : "text"
              }
              value={(values[field.key] as string | number | undefined) ?? ""}
            />
          )}
          {field.description ? (
            <p className="text-muted-foreground text-xs">{field.description}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Coerces raw form values to the JSON types declared in the schema. */
export function coerceActionInput(
  fields: ActionInputField[],
  values: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.key];
    if (field.isArray) {
      const arr = Array.isArray(raw)
        ? raw.map(String)
        : typeof raw === "string"
          ? raw
              .split(/[,\n]/)
              .map((part) => part.trim())
              .filter(Boolean)
          : [];
      if (arr.length > 0) {
        out[field.key] = arr;
      }
      continue;
    }
    if (field.type === "boolean") {
      if (raw === true) {
        out[field.key] = true;
      }
      continue;
    }
    if (raw === undefined || raw === null || raw === "") {
      continue;
    }
    if (field.type === "number" || field.type === "integer") {
      const num = Number(raw);
      if (!Number.isNaN(num)) {
        out[field.key] = num;
      }
      continue;
    }
    out[field.key] = raw;
  }
  return out;
}
