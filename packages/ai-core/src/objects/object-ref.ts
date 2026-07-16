/**
 * Typed references to engenty objects (module entities) rendered in chat.
 *
 * Chat persists only the reference plus a minimal display snapshot — the
 * object's storage place (the module's own tables) stays canonical, and the
 * UI resolves live data client-side as the viewing user. Canonical string
 * form is `<module>:<entity>:<id>` (e.g. `contacts:contact:0198…`); the same
 * format backfills retrieval `entity_refs` so display and context-graph share
 * one identity scheme.
 */

export interface ObjectRef {
  /** UI plugin id that owns the entity ("contacts", "offers", "core"). */
  module: string;
  /** Entity type within the module ("contact", "offer", "user"). */
  entity: string;
  /** The object's id in the module's own storage. */
  id: string;
}

const REF_SEGMENT = /^[a-z0-9][a-z0-9_-]*$/i;

export function formatObjectRef(ref: ObjectRef): string {
  return `${ref.module}:${ref.entity}:${ref.id}`;
}

/** Registry key for widget lookup — the ref without its id. */
export function objectRefTypeKey(ref: Pick<ObjectRef, "module" | "entity">) {
  return `${ref.module}:${ref.entity}`;
}

export function parseObjectRef(value: string): ObjectRef | null {
  const parts = value.split(":");
  if (parts.length < 3) {
    return null;
  }
  const [module, entity, ...idParts] = parts;
  // Ids may themselves contain ":" (external ids) — only module/entity are
  // constrained segments.
  const id = idParts.join(":").trim();
  if (!(module && entity && id)) {
    return null;
  }
  if (!(REF_SEGMENT.test(module) && REF_SEGMENT.test(entity))) {
    return null;
  }
  return { module, entity, id };
}

/**
 * Minimal display snapshot carried alongside a ref in tool output. Fallback
 * only — never authoritative; native widgets resolve live data client-side.
 */
export interface ObjectDisplayItem {
  ref: string;
  title: string;
  subtitle?: string;
  status?: string;
}

export type ObjectDisplayHint = "inline" | "panel" | "expanded";

/**
 * Marker payload under `output._meta.engenty.object_render` that the generic
 * object-render tool-call card matches on (same envelope convention as
 * `_meta.engenty.mcp_app`). Display-only: kept small so the copy that flows
 * back through model context stays cheap.
 */
export interface ObjectRenderMeta {
  refs: string[];
  display: ObjectDisplayHint;
  items: ObjectDisplayItem[];
  title?: string;
  provenance?: { total?: number; query?: string };
  /** Refs that failed authz/resolution — surfaced, never rendered. */
  dropped?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const DISPLAY_HINTS: readonly ObjectDisplayHint[] = [
  "inline",
  "panel",
  "expanded",
];

export function readObjectRenderMeta(output: unknown): ObjectRenderMeta | null {
  if (!isRecord(output)) {
    return null;
  }
  const meta = output._meta;
  if (!isRecord(meta)) {
    return null;
  }
  const engenty = meta.engenty;
  if (!isRecord(engenty)) {
    return null;
  }
  const objectRender = engenty.object_render;
  if (!isRecord(objectRender)) {
    return null;
  }
  const refs = Array.isArray(objectRender.refs)
    ? objectRender.refs.filter((ref): ref is string => typeof ref === "string")
    : [];
  if (refs.length === 0) {
    return null;
  }
  const display = DISPLAY_HINTS.includes(
    objectRender.display as ObjectDisplayHint
  )
    ? (objectRender.display as ObjectDisplayHint)
    : "inline";
  const items = Array.isArray(objectRender.items)
    ? objectRender.items.flatMap((item): ObjectDisplayItem[] => {
        if (
          !(
            isRecord(item) &&
            typeof item.ref === "string" &&
            typeof item.title === "string"
          )
        ) {
          return [];
        }
        return [
          {
            ref: item.ref,
            title: item.title,
            ...(typeof item.subtitle === "string"
              ? { subtitle: item.subtitle }
              : {}),
            ...(typeof item.status === "string"
              ? { status: item.status }
              : {}),
          },
        ];
      })
    : [];
  const provenance = isRecord(objectRender.provenance)
    ? {
        ...(typeof objectRender.provenance.total === "number"
          ? { total: objectRender.provenance.total }
          : {}),
        ...(typeof objectRender.provenance.query === "string"
          ? { query: objectRender.provenance.query }
          : {}),
      }
    : undefined;
  return {
    refs,
    display,
    items,
    ...(typeof objectRender.title === "string"
      ? { title: objectRender.title }
      : {}),
    ...(provenance ? { provenance } : {}),
    ...(Array.isArray(objectRender.dropped)
      ? {
          dropped: objectRender.dropped.filter(
            (ref): ref is string => typeof ref === "string"
          ),
        }
      : {}),
  };
}
