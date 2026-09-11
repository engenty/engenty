import type { SpaceGateContext } from "../../../ai/tools/engenty-tools/lib/space-gate.js";
import { isUnresolvedSpaceGate } from "../../../ai/tools/engenty-tools/lib/space-gate.js";

/**
 * JSON-safe Space carried on the graph request context.
 *
 * Sets do not survive Mastra's suspend snapshot, so the resolved surface is
 * stored as string arrays and rebuilt on read. `null` is intentional global.
 */
export type SerializedGraphSpace =
  | null
  | {
      claimed_space_id: string;
      kind: "unresolved";
      reason: "forbidden" | "not_found" | "unavailable";
    }
  | {
      agentIds: string[];
      allConnectorPrefixes: string[];
      connectorPrefixes: string[];
      kind: "resolved";
      moduleIds: string[];
      readOnlyModuleIds: string[];
      spaceId: string;
    };

export function serializeGraphSpace(
  space: SpaceGateContext | null
): SerializedGraphSpace {
  if (!space) {
    return null;
  }
  if (isUnresolvedSpaceGate(space)) {
    return {
      claimed_space_id: space.claimed_space_id,
      kind: "unresolved",
      reason: space.reason,
    };
  }
  return {
    agentIds: [...(space.agentIds ?? [])],
    allConnectorPrefixes: [...space.allConnectorPrefixes],
    connectorPrefixes: [...space.connectorPrefixes],
    kind: "resolved",
    moduleIds: [...space.moduleIds],
    readOnlyModuleIds: [...space.readOnlyModuleIds],
    spaceId: space.spaceId,
  };
}

export function deserializeGraphSpace(
  raw: unknown
): SpaceGateContext | null | undefined {
  if (raw === undefined) {
    return;
  }
  if (raw === null) {
    return null;
  }
  if (!raw || typeof raw !== "object") {
    return;
  }
  const value = raw as Record<string, unknown>;
  if (value.kind === "unresolved") {
    if (
      typeof value.claimed_space_id !== "string" ||
      (value.reason !== "forbidden" &&
        value.reason !== "not_found" &&
        value.reason !== "unavailable")
    ) {
      return;
    }
    return {
      claimed_space_id: value.claimed_space_id,
      kind: "unresolved",
      reason: value.reason,
    };
  }
  if (value.kind === "resolved" && typeof value.spaceId === "string") {
    return {
      agentIds: stringSet(value.agentIds),
      allConnectorPrefixes: stringSet(value.allConnectorPrefixes),
      connectorPrefixes: stringSet(value.connectorPrefixes),
      moduleIds: stringSet(value.moduleIds),
      readOnlyModuleIds: stringSet(value.readOnlyModuleIds),
      spaceId: value.spaceId,
    };
  }
  return;
}

function stringSet(value: unknown): Set<string> {
  return new Set(
    Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string")
      : []
  );
}
