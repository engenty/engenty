// CON-02 — per-connector write authority.
//
// Every non-read connector action maps to the single capability
// `module.connections.write` (see `runtime.ts`), so one grant spans
// Gmail-send + Slack-post + OneDrive-upload alike: a principal trusted to send
// mail can post to your channels. These helpers add a per-connector layer
// underneath that grant.
//
// The model is the one this codebase already uses for `moduleIds` and
// `scopes` (`policy.ts`: `auth.moduleIds.length > 0 && !includes(moduleId)`):
// EMPTY MEANS UNRESTRICTED, a non-empty set means restricted to it. So:
//
//   holds nothing under `module.connections.write.`  → every connector
//                                                      (exactly today's
//                                                      behaviour — existing
//                                                      grants keep working)
//   holds `module.connections.write.google-gmail`    → Gmail only
//   holds `module.connections.write.*`               → every connector,
//                                                      stated explicitly
//
// Note the consequence, which is the point rather than a quirk: adding a
// per-connector capability to a principal that already holds the broad one
// NARROWS them. The broad capability remains the entry ticket that core's
// operation gate checks; these say which connectors it may be spent on.

import { capabilityCovers } from "@engenty/plugin-sdk";
import type { ConnectorActionGroup } from "./types.js";

/**
 * The capability namespace a connector's actions sit under. `destructive`
 * folds into `write`, matching the operation-level requirement in `runtime.ts`
 * — one delete is not a separate grant from one send.
 */
export function connectorCapabilityBase(group: ConnectorActionGroup): string {
  return `module.connections.${group === "read" ? "read" : "write"}`;
}

/** `module.connections.write.google-gmail` — grantable, and never a wildcard. */
export function connectorCapability(
  group: ConnectorActionGroup,
  connectorId: string
): string {
  return `${connectorCapabilityBase(group)}.${connectorId}`;
}

/**
 * Whether `capabilities` permit this connector for this action group.
 *
 * Returns true when the principal names no connector at all in this group —
 * that is the pre-CON-02 world and every existing grant lands there.
 */
export function connectorScopeAllows(params: {
  capabilities: readonly string[];
  connectorId: string;
  group: ConnectorActionGroup;
}): boolean {
  const base = connectorCapabilityBase(params.group);
  const prefix = `${base}.`;
  const scoped = params.capabilities.filter((capability) =>
    capability.startsWith(prefix)
  );
  if (scoped.length === 0) {
    return true;
  }
  return capabilityCovers(
    [...params.capabilities],
    connectorCapability(params.group, params.connectorId)
  );
}

/**
 * Human-readable denial. Names the capability the caller would need rather
 * than just refusing, because the usual cause is a scoped role missing one
 * connector.
 */
export function connectorScopeDenialReason(params: {
  connectorId: string;
  connectorName: string;
  group: ConnectorActionGroup;
}): string {
  return `connection_connector_not_permitted: this role is scoped to specific connectors and ${params.connectorName} is not one of them (needs ${connectorCapability(params.group, params.connectorId)})`;
}
