import { type AiEffort, effortOfRole } from "@engenty/ai-core/browser";
import { useMemo } from "react";
import { useModelRoleBindingsQuery } from "../../lib/admin/ai-settings-queries.js";

/**
 * Which model backs each graded effort tier.
 *
 * Used by developer-mode surfaces that need to see the binding without opening
 * the settings page. `auto` is deliberately absent: it is the router sizing
 * the work, not a fixed model.
 */
export function useEffortModelBindings(
  enabled: boolean
): Partial<Record<AiEffort, string>> {
  const query = useModelRoleBindingsQuery({ enabled });
  return useMemo(() => {
    const map: Partial<Record<AiEffort, string>> = {};
    for (const binding of query.data?.items ?? []) {
      const effort = effortOfRole(binding.role);
      if (effort) {
        map[effort] = binding.model_id;
      }
    }
    return map;
  }, [query.data]);
}
