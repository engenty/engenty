/**
 * JSON Schema object → one engenty A2UI form surface (server-safe, no React).
 * A step whose input is described by a schema gets a `Form` of bound inputs
 * plus a submit Button; the data model is keyed by property name at `/<name>`.
 */

export interface JsonSchemaProperty {
  default?: unknown;
  description?: string;
  enum?: unknown[];
  format?: string;
  items?: JsonSchemaProperty;
  maximum?: number;
  maxLength?: number;
  minimum?: number;
  multipleOf?: number;
  properties?: Record<string, JsonSchemaProperty>;
  title?: string;
  type?: string | string[];
  "x-enum-labels"?: Record<string, string> | string[];
  "x-ref"?: string;
  [key: string]: unknown;
}

export interface JsonSchemaObject {
  description?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  title?: string;
  type?: "object";
}

export interface FormSurfaceOptions {
  submitEvent?: string;
  submitLabel?: string;
  title?: string;
}

export interface FormSurface {
  components: Record<string, unknown>[];
  data: Record<string, unknown>;
}

const LONG_TEXT_THRESHOLD = 200;

function primaryType(type: string | string[] | undefined): string | undefined {
  if (Array.isArray(type)) {
    return type.find((t) => t !== "null");
  }
  return type;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function enumOptions(
  values: unknown[],
  labels: JsonSchemaProperty["x-enum-labels"]
): { label: string; value: string }[] {
  return values.map((raw, index) => {
    const value = String(raw);
    let label = value;
    if (Array.isArray(labels)) {
      label = labels[index] ?? value;
    } else if (labels && typeof labels === "object") {
      label = labels[value] ?? value;
    }
    return { label, value };
  });
}

function fieldBase(
  name: string,
  prop: JsonSchemaProperty,
  required: boolean
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: `field-${name}`,
    label: prop.title ?? name,
    value: { path: `/${name}` },
  };
  if (prop.description) {
    base.help = prop.description;
  }
  if (required) {
    base.required = true;
  }
  return base;
}

function stringField(
  base: Record<string, unknown>,
  prop: JsonSchemaProperty
): Record<string, unknown> {
  if (typeof prop["x-ref"] === "string") {
    return { ...base, component: "ObjectPicker", entity: prop["x-ref"] };
  }
  if (prop.format === "date") {
    return { ...base, component: "DateInput" };
  }
  if (
    prop.format === "long" ||
    (typeof prop.maxLength === "number" && prop.maxLength > LONG_TEXT_THRESHOLD)
  ) {
    return { ...base, component: "TextArea" };
  }
  return { ...base, component: "TextField" };
}

function numberField(
  base: Record<string, unknown>,
  prop: JsonSchemaProperty,
  integer: boolean
): Record<string, unknown> {
  const field: Record<string, unknown> = { ...base, component: "NumberField" };
  if (typeof prop.minimum === "number") {
    field.min = prop.minimum;
  }
  if (typeof prop.maximum === "number") {
    field.max = prop.maximum;
  }
  if (typeof prop.multipleOf === "number") {
    field.step = prop.multipleOf;
  } else if (integer) {
    field.step = 1;
  }
  return field;
}

/** Map one schema property onto a catalog input; `null` = JSON fallback. */
function fieldFor(
  name: string,
  prop: JsonSchemaProperty,
  required: boolean
): { component: Record<string, unknown>; json: boolean } {
  const base = fieldBase(name, prop, required);
  const type = primaryType(prop.type);

  if (Array.isArray(prop.enum) && prop.enum.length > 0) {
    return {
      component: {
        ...base,
        component: "Select",
        options: enumOptions(prop.enum, prop["x-enum-labels"]),
      },
      json: false,
    };
  }
  if (type === "string" || (type === undefined && !prop.properties)) {
    return { component: stringField(base, prop), json: false };
  }
  if (type === "number" || type === "integer") {
    return {
      component: numberField(base, prop, type === "integer"),
      json: false,
    };
  }
  if (type === "boolean") {
    return { component: { ...base, component: "CheckBox" }, json: false };
  }
  if (
    type === "array" &&
    prop.items &&
    Array.isArray(prop.items.enum) &&
    prop.items.enum.length > 0
  ) {
    return {
      component: {
        ...base,
        component: "MultipleChoice",
        options: enumOptions(prop.items.enum, prop.items["x-enum-labels"]),
      },
      json: false,
    };
  }
  return {
    component: {
      ...base,
      component: "TextArea",
      help: prop.description ?? "JSON",
      rows: 6,
    },
    json: true,
  };
}

/**
 * Build the form surface for a JSON Schema object. `values` (a previous
 * answer) win over schema `default`s; both land in the data model so the
 * inputs render prefilled. Unknown or nested-object properties become a
 * TextArea holding JSON.
 */
export function formSurfaceFromSchema(
  schema: JsonSchemaObject,
  values?: Record<string, unknown>,
  options?: FormSurfaceOptions
): FormSurface {
  const required = new Set(
    isStringList(schema.required) ? schema.required : []
  );
  const properties = schema.properties ?? {};
  const submitEvent = options?.submitEvent ?? "next";
  const submitLabel = options?.submitLabel ?? "Continue";
  const title = options?.title ?? schema.title;

  const components: Record<string, unknown>[] = [];
  const data: Record<string, unknown> = {};
  const childIds: string[] = [];

  if (title) {
    components.push({
      component: "Text",
      id: "title",
      text: title,
      variant: "h3",
    });
    childIds.push("title");
  }

  for (const [name, prop] of Object.entries(properties)) {
    const { component, json } = fieldFor(name, prop, required.has(name));
    components.push(component);
    childIds.push(component.id as string);

    const value = values?.[name] === undefined ? prop.default : values?.[name];
    if (value === undefined) {
      continue;
    }
    data[name] =
      json && typeof value !== "string"
        ? JSON.stringify(value, null, 2)
        : value;
  }

  components.push(
    { children: ["submit"], component: "Actions", id: "actions" },
    {
      action: { event: { name: submitEvent } },
      component: "Button",
      id: "submit",
      label: submitLabel,
    }
  );
  childIds.push("actions");

  components.unshift({
    children: childIds,
    component: "Form",
    id: "root",
    submit: { event: { name: submitEvent } },
  });

  return { components, data };
}
