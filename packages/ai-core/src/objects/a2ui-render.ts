/**
 * Marker payload under `output._meta.engenty.a2ui` for declarative A2UI
 * surfaces (docs/wip/generative-ui.md §5b "Carriage in our stack"). Carries
 * the ordered v0.9 wire messages (createSurface → updateComponents →
 * updateDataModel) so replay re-feeds them through the renderer's
 * MessageProcessor — the same replay story as every other card. Same envelope
 * convention as `object_render` and `mcp_app`.
 *
 * `live` is optional: when present, the chat card is still a frozen snapshot,
 * and the workspace end-pane replaces one surface in place (and may refresh
 * it when the source rows change).
 */

export interface A2uiLiveInboxDashboard {
  connection_id?: string;
  included: string[];
  kind: "inbox_dashboard";
}

export type A2uiLiveMeta = A2uiLiveInboxDashboard;

export interface A2uiRenderMeta {
  /** The stored artifact this surface previews; its title line opens it. */
  artifact_id?: string;
  catalog_id: string;
  live?: A2uiLiveMeta;
  /** Ordered A2UI v0.9 messages, opaque to the host. */
  messages: Record<string, unknown>[];
  surface_id: string;
  title?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readLive(value: unknown): A2uiLiveMeta | undefined {
  if (!isRecord(value) || value.kind !== "inbox_dashboard") {
    return;
  }
  const included = Array.isArray(value.included)
    ? value.included.filter((id): id is string => typeof id === "string")
    : [];
  const connectionId =
    typeof value.connection_id === "string" ? value.connection_id : undefined;
  return {
    included,
    kind: "inbox_dashboard",
    ...(connectionId ? { connection_id: connectionId } : {}),
  };
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
  const live = readLive(a2ui.live);
  return {
    catalog_id: catalogId,
    messages,
    surface_id: surfaceId,
    ...(typeof a2ui.title === "string" ? { title: a2ui.title } : {}),
    ...(typeof a2ui.artifact_id === "string" && a2ui.artifact_id.trim()
      ? { artifact_id: a2ui.artifact_id.trim() }
      : {}),
    ...(live ? { live } : {}),
  };
}
