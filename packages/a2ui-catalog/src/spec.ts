/**
 * Server-safe contract of the engenty A2UI catalog (docs/wip/generative-ui.md
 * §5/§5b): component names, the prompt guide the `show_ui` tool embeds, and a
 * dependency-free validator run agent-side BEFORE anything reaches the user —
 * an unknown component id is a validation error, not a broken card. Client
 * rendering imports the full catalog from the package root; this module has
 * no React and no @a2ui dependency so apps/ai can import it directly.
 */

export const ENGENTY_A2UI_CATALOG_ID = "engenty:core/v1";

/** Q4 starter set — the components this build renders. */
export const ENGENTY_A2UI_COMPONENT_NAMES = [
  "List",
  "Row",
  "DetailGrid",
  "Badge",
  "Actions",
  "Button",
  "Text",
] as const;

export type EngentyA2uiComponentName =
  (typeof ENGENTY_A2UI_COMPONENT_NAMES)[number];

/**
 * Compact per-component prop guide for the model. Bindable props accept a
 * literal or a JSON-Pointer binding `{"path": "/foo/0/bar"}` into the data
 * model; actions are `{"event": {"name": "...", "context": {...}}}`.
 */
export const ENGENTY_A2UI_PROMPT_GUIDE = [
  "Components (flat list, children reference siblings by id; exactly one component must have id 'root'):",
  "- List { children: string[] } — vertical stack of rows/sections.",
  "- Row { title, subtitle?, meta?, objectRef?, badge?, action?, children?: string[] } — one list row. Set objectRef to an engenty ref '<module>:<entity>:<id>' to render the LIVE native record row (title/subtitle then ignored); clicking it opens the record.",
  "- DetailGrid { rows: [{ label, value }] } — label/value facts grid.",
  "- Badge { label, tone?: 'default'|'success'|'warning' }.",
  "- Actions { children: string[] } — horizontal button group.",
  "- Button { label, action: { event: { name, context? } } }.",
  "- Text { text, variant?: 'h3'|'h4'|'body'|'muted' }.",
  'Bindable string props (title, subtitle, meta, label, value, text) accept either a literal string or {"path": "/json/pointer"} into the data model.',
  "Actions: 'open_object' with context {ref} opens the record beside the chat; any other event name is sent back to you as a user message.",
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
  // Static child lists only — the show_ui surface builds explicit lists; a
  // dynamic template list ({ template, path }) is passed through unchecked.
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}

/**
 * Validate a flat component list against the catalog contract. Returns issues
 * (empty = valid). Checks: record shape, unique string ids, known component
 * names, a `root` component, and child references that resolve.
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
