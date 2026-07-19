/**
 * Marker payload under `output._meta.engenty.a2ui` for declarative A2UI
 * surfaces (docs/wip/generative-ui.md §5b "Carriage in our stack"). Carries
 * the ordered v0.9 wire messages (createSurface → updateComponents →
 * updateDataModel) so replay re-feeds them through the renderer's
 * MessageProcessor — the same replay story as every other card. Same envelope
 * convention as `object_render` and `mcp_app`.
 */

export interface A2uiRenderMeta {
  catalog_id: string;
  /** Ordered A2UI v0.9 messages, opaque to the host. */
  messages: Record<string, unknown>[];
  surface_id: string;
  title?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function readA2uiRenderMeta(output: unknown): A2uiRenderMeta | null {
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
  const a2ui = engenty.a2ui;
  if (!isRecord(a2ui)) {
    return null;
  }
  const catalogId = a2ui.catalog_id;
  const surfaceId = a2ui.surface_id;
  if (typeof catalogId !== "string" || typeof surfaceId !== "string") {
    return null;
  }
  const messages = Array.isArray(a2ui.messages)
    ? a2ui.messages.filter(isRecord)
    : [];
  if (messages.length === 0) {
    return null;
  }
  return {
    catalog_id: catalogId,
    messages,
    surface_id: surfaceId,
    ...(typeof a2ui.title === "string" ? { title: a2ui.title } : {}),
  };
}
