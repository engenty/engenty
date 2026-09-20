// What a suspended gate puts on screen.
//
// Every `approval_gate` suspends with ONE thing to render: an A2UI surface
// (`{ components, data }`, the same shape `show_ui` takes). The `surface` kind
// carries its own; the three shorthand kinds — confirm, field_updates, choice —
// are expanded here into the equivalent surface, so a card and a wizard page
// render one format and the graph author still gets the compact form.
//
// Server-safe: no React. Shared by the gate primitive (suspend time), the
// save-path validator and the `show_ui` tool (catalog + size checks).
import {
  A2UI_SURFACE_MAX_BYTES,
  validateEngentyA2uiComponents,
} from "@engenty/a2ui-catalog/spec";

export interface GateSurface {
  components: Record<string, unknown>[];
  data: Record<string, unknown>;
}

export type GateKind = "confirm" | "field_updates" | "choice" | "surface";

/** The event names the expanded shorthands emit. The card maps `reject` to `approved: false`. */
export const GATE_APPROVE_EVENT = "approve";
export const GATE_REJECT_EVENT = "reject";
export const GATE_SUBMIT_EVENT = "next";

function readable(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return JSON.stringify(value);
}

function button(id: string, label: string, event: string) {
  return { action: { event: { name: event } }, component: "Button", id, label };
}

/** `confirm`: the effect as facts, a reason field, approve / reject. */
function confirmSurface(payload: Record<string, unknown>): GateSurface {
  const rows = Object.entries(payload).map(([label, value]) => ({
    label,
    value: readable(value),
  }));
  return {
    components: [
      {
        children: [...(rows.length > 0 ? ["facts"] : []), "reason", "actions"],
        component: "Column",
        id: "root",
      },
      ...(rows.length > 0
        ? [{ component: "DetailGrid", id: "facts", rows }]
        : []),
      {
        component: "TextArea",
        id: "reason",
        label: "Note (optional)",
        value: { path: "/reason" },
      },
      { children: ["approve", "reject"], component: "Actions", id: "actions" },
      button("approve", "Approve", GATE_APPROVE_EVENT),
      button("reject", "Reject", GATE_REJECT_EVENT),
    ],
    data: { reason: "" },
  };
}

/** `field_updates`: every proposed field editable, prefilled with the patch. */
function fieldUpdatesSurface(payload: Record<string, unknown>): GateSurface {
  const fieldIds = Object.keys(payload).map((key, index) => `f${index}`);
  return {
    components: [
      {
        children: [...fieldIds, "actions"],
        component: "Form",
        id: "root",
        submit: { event: { name: GATE_APPROVE_EVENT } },
      },
      ...Object.keys(payload).map((key, index) => ({
        component: "TextField",
        id: fieldIds[index],
        label: key,
        value: { path: `/${key}` },
      })),
      { children: ["approve", "reject"], component: "Actions", id: "actions" },
      button("approve", "Apply", GATE_APPROVE_EVENT),
      button("reject", "Discard", GATE_REJECT_EVENT),
    ],
    data: Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [key, readable(value)])
    ),
  };
}

/** `choice`: pick one of `payload.options`. */
function choiceSurface(payload: Record<string, unknown>): GateSurface {
  const raw = Array.isArray(payload.options) ? payload.options : [];
  const options = raw.map((option) =>
    option && typeof option === "object"
      ? {
          label: readable((option as { label?: unknown }).label ?? option),
          value: readable((option as { value?: unknown }).value ?? option),
        }
      : { label: readable(option), value: readable(option) }
  );
  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  return {
    components: [
      {
        children: [...(prompt ? ["prompt"] : []), "choice", "actions"],
        component: "Form",
        id: "root",
        submit: { event: { name: GATE_SUBMIT_EVENT } },
      },
      ...(prompt
        ? [{ component: "Text", id: "prompt", text: prompt, variant: "body" }]
        : []),
      {
        component: "Select",
        id: "choice",
        label: "Choice",
        options,
        required: true,
        value: { path: "/choice" },
      },
      { children: ["next"], component: "Actions", id: "actions" },
      button("next", "Continue", GATE_SUBMIT_EVENT),
    ],
    data: { choice: "" },
  };
}

/**
 * The catalog + size checks, as a pure function over a surface. An unknown
 * component id is a validation error, not a broken card; an oversized surface
 * is refused before it is stored.
 */
export function checkGateSurface(input: {
  components: unknown;
  data?: unknown;
}): { error: string; issues?: unknown[] } | null {
  const issues = validateEngentyA2uiComponents(input.components);
  if (issues.length > 0) {
    return {
      error: "Invalid A2UI components — fix and retry.",
      issues: issues.slice(0, 8),
    };
  }
  const payloadBytes = Buffer.byteLength(
    JSON.stringify({ components: input.components, data: input.data }),
    "utf8"
  );
  if (payloadBytes > A2UI_SURFACE_MAX_BYTES) {
    return {
      error: `UI payload is ${payloadBytes} bytes; the limit is ${A2UI_SURFACE_MAX_BYTES}. Compose a smaller surface.`,
    };
  }
  return null;
}

export class GateSurfaceError extends Error {
  readonly issues: unknown[];

  constructor(message: string, issues: unknown[] = []) {
    super(message);
    this.name = "GateSurfaceError";
    this.issues = issues;
  }
}

/**
 * The surface a gate of `kind` renders for `payload`. Throws `GateSurfaceError`
 * when a `surface` payload does not pass the catalog checks — at suspend time
 * that fails the step loudly instead of parking a run nobody can answer.
 */
export function gateSurfaceFor(
  kind: GateKind,
  payload: Record<string, unknown>,
  data?: Record<string, unknown>
): GateSurface {
  const merge = (surface: GateSurface): GateSurface =>
    data ? { ...surface, data: { ...surface.data, ...data } } : surface;
  switch (kind) {
    case "confirm":
      return merge(confirmSurface(payload));
    case "field_updates":
      return merge(fieldUpdatesSurface(payload));
    case "choice":
      return merge(choiceSurface(payload));
    case "surface": {
      const components = payload.components;
      const own =
        payload.data && typeof payload.data === "object"
          ? (payload.data as Record<string, unknown>)
          : {};
      const merged = { ...own, ...data };
      const failure = checkGateSurface({ components, data: merged });
      if (failure) {
        throw new GateSurfaceError(failure.error, failure.issues ?? []);
      }
      return {
        components: components as Record<string, unknown>[],
        data: merged,
      };
    }
    default:
      return merge(confirmSurface(payload));
  }
}
