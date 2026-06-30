import type { OrgTreeNode } from "../api.js";

export const MANAGER_NONE = "__none__";

export interface ManagerPickerOption {
  display_name: string;
  org_node_id: string;
  profile_id: string | null;
}

export function flattenHumanOrgNodes(
  nodes: OrgTreeNode[]
): ManagerPickerOption[] {
  const out: ManagerPickerOption[] = [];
  const walk = (list: OrgTreeNode[]) => {
    for (const node of list) {
      if (node.kind === "human") {
        out.push({
          org_node_id: node.id,
          display_name: node.display_name,
          profile_id: node.profile_id,
        });
      }
      if (node.reports.length > 0) {
        walk(node.reports);
      }
    }
  };
  walk(nodes);
  return out;
}

export function buildManagerPickerOptions(
  nodes: OrgTreeNode[],
  excludeProfileId: string | null
): ManagerPickerOption[] {
  return flattenHumanOrgNodes(nodes)
    .filter(
      (option) => !excludeProfileId || option.profile_id !== excludeProfileId
    )
    .sort((a, b) =>
      a.display_name.localeCompare(b.display_name, undefined, {
        sensitivity: "base",
      })
    );
}

export function reportsToIdFromPickerValue(value: string): string | null {
  return value === MANAGER_NONE ? null : value;
}

export function pickerValueFromReportsToId(
  reportsToId: string | null | undefined
): string {
  return reportsToId ?? MANAGER_NONE;
}
