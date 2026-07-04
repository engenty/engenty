/**
 * UI-side mirror of the backend policy layering in
 * `@engenty/connections-sdk` (`policy.ts`):
 *   action-id override → group override → group default.
 * The group default arrives on each catalog action as `default_policy`.
 */
import type {
  CatalogAction,
  ConnectionPolicy,
  ConnectionPolicyOverride,
  ConnectorActionGroup,
} from "../api.js";

export const GROUP_ORDER: ConnectorActionGroup[] = [
  "read",
  "write",
  "destructive",
];

export type PolicySource = "action" | "group" | "default";

export function groupSelector(group: ConnectorActionGroup): string {
  return `group:${group}`;
}

export function findOverride(
  overrides: readonly ConnectionPolicyOverride[],
  selector: string
): ConnectionPolicyOverride | undefined {
  return overrides.find((o) => o.selector === selector);
}

/** Effective group-level policy: group override, else the group default. */
export function effectiveGroupPolicy(params: {
  /** Default policy of the group (same for every action in the group). */
  defaultPolicy: ConnectionPolicy;
  group: ConnectorActionGroup;
  overrides: readonly ConnectionPolicyOverride[];
}): { overridden: boolean; policy: ConnectionPolicy } {
  const override = findOverride(params.overrides, groupSelector(params.group));
  return {
    overridden: override !== undefined,
    policy: override?.policy ?? params.defaultPolicy,
  };
}

/** Effective per-action policy with the layer that produced it. */
export function effectiveActionPolicy(params: {
  action: Pick<CatalogAction, "default_policy" | "group" | "id">;
  overrides: readonly ConnectionPolicyOverride[];
}): { policy: ConnectionPolicy; source: PolicySource } {
  const byAction = findOverride(params.overrides, params.action.id);
  if (byAction) {
    return { policy: byAction.policy, source: "action" };
  }
  const byGroup = findOverride(
    params.overrides,
    groupSelector(params.action.group)
  );
  if (byGroup) {
    return { policy: byGroup.policy, source: "group" };
  }
  return { policy: params.action.default_policy, source: "default" };
}

/** Actions of one group, preserving catalog order. */
export function actionsInGroup(
  actions: readonly CatalogAction[],
  group: ConnectorActionGroup
): CatalogAction[] {
  return actions.filter((a) => a.group === group);
}
