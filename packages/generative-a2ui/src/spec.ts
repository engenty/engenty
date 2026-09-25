/**
 * Server-safe contract of the engenty A2UI catalog (docs/wip/generative-ui.md
 * §5/§5b): component names, the prompt guide the `show_ui` tool embeds, and a
 * dependency-free validator run agent-side BEFORE anything reaches the user —
 * an unknown component id is a validation error, not a broken card. Client
 * rendering imports the full catalog from the package root; this module has
 * no React and no @a2ui dependency so apps/ai can import it directly.
 */

export {
  aggregateInboxDashboard,
  composeInboxDashboard,
  DASHBOARD_BLOCKS,
  DASHBOARD_THREAD_LIMIT,
  type DashboardBlockId,
  type DashboardMailItem,
  type DashboardMetric,
  type InboxDashboardData,
  type InboxDashboardThread,
  inboxDashboardCandidates,
} from "./compose.js";
export {
  assembleSurface,
  type ComposedSurface,
  type ComposeSurfaceInput,
  composeSurface,
  type SurfaceCandidate,
  type SurfaceGroup,
} from "./compose-surface.js";
export {
  type FormSurface,
  type FormSurfaceOptions,
  formSurfaceFromSchema,
  type JsonSchemaObject,
  type JsonSchemaProperty,
} from "./form-from-schema.js";

export const ENGENTY_A2UI_CATALOG_ID = "engenty:core/v1";

/** Upper bound for one serialized surface (components + data), shared by the tool and the validator. */
export const A2UI_SURFACE_MAX_BYTES = 65_536;

/** The components this build renders. */
export const ENGENTY_A2UI_COMPONENT_NAMES = [
  "List",
  "Row",
  "DetailGrid",
  "Badge",
  "Actions",
  "Button",
  "Text",
  "Form",
  "TextField",
  "TextArea",
  "NumberField",
  "Select",
  "MultipleChoice",
  "CheckBox",
  "DateInput",
  "ObjectPicker",
  "Column",
  "Inline",
  "Card",
  "Divider",
  "Callout",
  "Markdown",
  "Image",
  "Table",
  "Document",
  "Grid",
  "Metric",
  "BarChart",
  "LineChart",
  "AreaChart",
  "DonutChart",
] as const;

export type EngentyA2uiComponentName =
  (typeof ENGENTY_A2UI_COMPONENT_NAMES)[number];

/** Components whose `value` binds two-way into the data model. */
export const ENGENTY_A2UI_INPUT_NAMES = [
  "TextField",
  "TextArea",
  "NumberField",
  "Select",
  "MultipleChoice",
  "CheckBox",
  "DateInput",
  "ObjectPicker",
] as const;

/**
 * Compact per-component prop guide for the model. Bindable props accept a
 * literal or a JSON-Pointer binding `{"path": "/foo/0/bar"}` into the data
 * model; actions are `{"event": {"name": "...", "context": {...}}}`.
 */
export const ENGENTY_A2UI_PROMPT_GUIDE = [
  "Components (flat list, children reference siblings by id; exactly one component must have id 'root'):",
  "- List { children: string[] } — vertical stack of rows/sections.",
  "- Row { title, subtitle?, meta?, objectRef?, badge?, action?, wrap?, children?: string[] } — one list row; title and subtitle stay on one line unless wrap: true. Set objectRef to an engenty ref '<module>:<entity>:<id>' (or bind it: { path: '/ref' }) to render the LIVE native record row (title/subtitle then ignored); clicking it opens the record.",
  "- DetailGrid { rows: [{ label, value }] } — label/value facts grid.",
  "- Badge { label, tone?: 'default'|'info'|'success'|'warning' }.",
  "- Actions { children: string[] } — horizontal button group.",
  "- Button { label, action: { event: { name, context? } } }.",
  "- Text { text, variant?: 'h3'|'h4'|'body'|'muted' }.",
  "- Form { children: string[], submit?: { event: { name } } } — groups inputs; Enter or the submit action sends the step. Put Actions with a Button inside whose event name is the step's outcome (e.g. 'next', 'ok', 'revise').",
  "- TextField { value: {path}, label?, help?, placeholder?, required?, disabled? } — single-line text.",
  "- TextArea { value: {path}, label?, help?, placeholder?, rows?, required?, disabled? } — multi-line text.",
  "- NumberField { value: {path}, label?, help?, min?, max?, step?, required?, disabled? } — writes a number.",
  "- Select { value: {path}, options: [{ value, label }], label?, help?, placeholder?, required?, disabled? } — single choice; writes the option value.",
  "- MultipleChoice { value: {path}, options: [{ value, label }], style?: 'list'|'chips', label?, help?, required?, disabled? } — writes a string array.",
  "- CheckBox { value: {path}, label, help?, required?, disabled? } — writes a boolean.",
  "- DateInput { value: {path}, label?, help?, min?, max?, required?, disabled? } — writes an ISO date 'YYYY-MM-DD'.",
  "- ObjectPicker { value: {path}, entity, label?, help?, required?, disabled? } — picks a record of an engenty entity; writes its ref '<module>:<entity>:<id>'.",
  "- Column { children: string[], gap?: 'sm'|'md'|'lg' } — vertical stack.",
  "- Inline { children: string[], gap?: 'sm'|'md'|'lg' } — side-by-side, wrapping; for two or three short fields on one line.",
  "- Card { children: string[], title? } — bordered section.",
  "- Divider {} — horizontal rule.",
  "- Callout { text, tone?: 'info'|'success'|'warning'|'danger' } — highlighted note.",
  "- Markdown { text } — markdown body (headings, lists, bold, code, links; no raw HTML).",
  "- Image { url, alt?, width?, height? } — width/height in px when known.",
  "- Table { columns: [{ key, label, align?: 'start'|'end' }], rows: [{ ... }] | {path} } — read-only grid; a column key may reach into a row ('content_json/amount').",
  "- Document { artifactRef } — renders the artifact with that id.",
  "- Grid { children: string[], columns?: 2|3|4 } — dashboard tile row.",
  "- Metric { label, value, caption?, tone?: 'default'|'success'|'warning', sparkline?: [{ label, value }] | {path} } — KPI tile with optional sparkline.",
  "- BarChart { title?, height?, points?: [{ label, value }] | {path}, series?: [{ name, points }] | {path}, action? } — click a bar to send the action with context.label.",
  "- LineChart { title?, height?, points?, series?, action? } — click a point to send the action with context.label and context.series.",
  "- AreaChart { title?, height?, points?, series?, action? } — Ember-filled time series.",
  "- DonutChart { title?, height?, slices: [{ label, value }] | {path}, center?, action? } — click a slice to send the action with context.label.",
  'Bindable string props (title, subtitle, meta, label, value, text, url, artifactRef) accept either a literal string or {"path": "/json/pointer"} into the data model.',
  'Repeating a row: instead of a static children array, a container (List, Column, Card, Form) takes "children": {"componentId": "<row id>", "path": "/items"} — the row component is rendered once per array item and ITS bindings are relative to that item ({"path": "title"}, {"path": "content_json/amount"}). That is how N positions are shown, and how they are EDITED: inputs inside the row write back into the array. The row component is declared once in the flat list like any other.',
  'Inputs bind with "value": {"path": "/field"} and write what the user enters into the data model at that path; seed defaults through the data model.',
  "When the surface is a step, the whole data model comes back with the event name of the pressed Button (or the Form's submit action): {event: 'next', data: {field: ...}}. Mark mandatory inputs required: true — an empty required input blocks the submit client-side.",
  "Actions: 'open_object' with context {ref} opens the record beside the chat; 'open_artifact' with context {artifact_id} opens a stored artifact in full in the side pane; any other event name is sent back to you as a user message.",
  "A result the person keeps: store the whole asset with artifact_write, then show a teaser here (Card with the title, the two or three key facts or a short Markdown summary, and a Button 'Open' whose action is open_artifact with that artifact_id); pass the same artifact_id to show_ui so the teaser's title line opens it too.",
].join("\n");

export interface A2uiValidationIssue {
  componentId?: string;
  message: string;
}

interface ComponentEntry {
  children: string[];
  component: string;
  id: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function collectChildIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  // A dynamic list template renders one copy of `componentId` per item of the
  // array at `path`; the copy's own bindings are relative to that item.
  if (isRecord(value) && typeof value.componentId === "string") {
    return [value.componentId];
  }
  return [];
}

function isActionShape(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const event = value.event;
  return isRecord(event) && typeof event.name === "string" && event.name !== "";
}

/**
 * Collect every data binding `{ path }` below a prop value. A binding is a
 * record whose only key is `path`; child lists are skipped because a template
 * list carries a relative path by design.
 */
function collectBindingPaths(value: unknown, out: unknown[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectBindingPaths(item, out);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === "path") {
    out.push(value.path);
    return;
  }
  for (const nested of Object.values(value)) {
    collectBindingPaths(nested, out);
  }
}

function isOptionList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((o) => isRecord(o) && typeof o.value === "string")
  );
}

function validateComponentProps(
  raw: Record<string, unknown>,
  id: string,
  component: string,
  issues: A2uiValidationIssue[]
): void {
  const bindings: unknown[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (key === "id" || key === "component" || key === "children") {
      continue;
    }
    collectBindingPaths(value, bindings);
  }
  for (const path of bindings) {
    // Absolute ("/total") or, inside a list template's row, relative to the
    // row ("content_json/title") — both are JSON pointers to the binder.
    if (typeof path !== "string" || path.trim() === "" || /\s/.test(path)) {
      issues.push({
        componentId: id,
        message: `binding path '${String(path)}' must be a JSON pointer ('/total' from the root, or 'qty' relative to a list template's row)`,
      });
    }
  }

  if (isRecord(raw.children) && !Array.isArray(raw.children)) {
    const template = raw.children;
    if (
      typeof template.componentId !== "string" ||
      typeof template.path !== "string" ||
      !template.path.startsWith("/")
    ) {
      issues.push({
        componentId: id,
        message:
          "a dynamic children list must be { componentId, path } with an absolute path to an array",
      });
    }
  }

  switch (component) {
    case "Form": {
      if (Array.isArray(raw.submit)) {
        issues.push({
          componentId: id,
          message: "Form takes at most one submit action",
        });
      } else if (raw.submit !== undefined && !isActionShape(raw.submit)) {
        issues.push({
          componentId: id,
          message: "Form submit must be an action { event: { name } }",
        });
      }
      break;
    }
    case "Select":
    case "MultipleChoice": {
      if (!isOptionList(raw.options)) {
        issues.push({
          componentId: id,
          message: `${component} needs a non-empty options array of { value, label }`,
        });
      }
      break;
    }
    case "ObjectPicker": {
      if (typeof raw.entity !== "string" || !raw.entity.trim()) {
        issues.push({
          componentId: id,
          message: "ObjectPicker needs a string entity",
        });
      }
      break;
    }
    case "Table": {
      const columns = raw.columns;
      if (
        !Array.isArray(columns) ||
        columns.length === 0 ||
        !columns.every((c) => isRecord(c) && typeof c.key === "string")
      ) {
        issues.push({
          componentId: id,
          message: "Table needs a non-empty columns array of { key, label }",
        });
      }
      break;
    }
    default:
      break;
  }
}

/** A Form nested inside another Form would give the step two submit paths. */
function validateFormNesting(
  entries: ComponentEntry[],
  issues: A2uiValidationIssue[]
): void {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  for (const form of entries) {
    if (form.component !== "Form") {
      continue;
    }
    const seen = new Set<string>([form.id]);
    const stack = [...form.children];
    while (stack.length > 0) {
      const next = stack.pop() as string;
      if (seen.has(next)) {
        continue;
      }
      seen.add(next);
      const entry = byId.get(next);
      if (!entry) {
        continue;
      }
      if (entry.component === "Form") {
        issues.push({
          componentId: form.id,
          message: `Form '${form.id}' contains another Form '${entry.id}' — one Form per step`,
        });
        continue;
      }
      stack.push(...entry.children);
    }
  }
}

/**
 * Validate a flat component list against the catalog contract. Returns issues
 * (empty = valid). Checks: record shape, unique string ids, known component
 * names, a `root` component, child references that resolve (static lists and
 * the { componentId, path } template alike), binding paths that are JSON
 * pointers, and the per-component prop rules (Form
 * submit, Select/MultipleChoice options, ObjectPicker entity, Table columns).
 */
export function validateEngentyA2uiComponents(
  components: unknown
): A2uiValidationIssue[] {
  const issues: A2uiValidationIssue[] = [];
  if (!Array.isArray(components) || components.length === 0) {
    return [{ message: "components must be a non-empty array" }];
  }
  const known = new Set<string>(ENGENTY_A2UI_COMPONENT_NAMES);
  const entries: ComponentEntry[] = [];
  const seenIds = new Set<string>();

  for (const raw of components) {
    if (!isRecord(raw)) {
      issues.push({ message: "each component must be an object" });
      continue;
    }
    const id = raw.id;
    const component = raw.component;
    if (typeof id !== "string" || !id.trim()) {
      issues.push({ message: "component is missing a string 'id'" });
      continue;
    }
    if (seenIds.has(id)) {
      issues.push({
        componentId: id,
        message: `duplicate component id '${id}'`,
      });
      continue;
    }
    seenIds.add(id);
    if (typeof component !== "string" || !known.has(component)) {
      issues.push({
        componentId: id,
        message: `unknown component '${String(component)}' — allowed: ${ENGENTY_A2UI_COMPONENT_NAMES.join(", ")}`,
      });
      continue;
    }
    validateComponentProps(raw, id, component, issues);
    entries.push({ children: collectChildIds(raw.children), component, id });
  }

  if (!seenIds.has("root") && issues.length === 0) {
    issues.push({ message: "exactly one component must have id 'root'" });
  }

  for (const entry of entries) {
    for (const childId of entry.children) {
      if (!seenIds.has(childId)) {
        issues.push({
          componentId: entry.id,
          message: `child '${childId}' does not reference a component id`,
        });
      }
    }
  }

  validateFormNesting(entries, issues);

  return issues;
}

/** A2UI v0.9 wire messages the emitter builds and the renderer replays. */
export interface EngentyA2uiMessages {
  messages: Record<string, unknown>[];
  surfaceId: string;
}

/**
 * Assemble the ordered v0.9 message list for a validated component list —
 * createSurface → updateComponents → optional updateDataModel (§5b).
 */
export function buildEngentyA2uiMessages(params: {
  components: Record<string, unknown>[];
  data?: Record<string, unknown>;
  surfaceId: string;
}): EngentyA2uiMessages {
  const { components, data, surfaceId } = params;
  const messages: Record<string, unknown>[] = [
    {
      version: "v0.9",
      createSurface: {
        surfaceId,
        catalogId: ENGENTY_A2UI_CATALOG_ID,
        sendDataModel: false,
      },
    },
    {
      version: "v0.9",
      updateComponents: { surfaceId, components },
    },
  ];
  if (data && Object.keys(data).length > 0) {
    messages.push({
      version: "v0.9",
      updateDataModel: { surfaceId, path: "/", value: data },
    });
  }
  return { messages, surfaceId };
}
