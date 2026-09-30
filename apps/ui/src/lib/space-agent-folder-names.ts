/**
 * Agent folders (`/space/agent/<id>/`) are named by agent id on disk; people
 * see the agent's name. The catalog lives in apps/ai, so the mapping is here.
 */
import { useMemo } from "react";
import { useSpaceAgentCatalogQuery } from "@/lib/spaces-queries";

/** Agent id → display name; an id the catalog does not know maps to itself. */
export function useSpaceAgentNames(enabled = true): (id: string) => string {
  const catalog = useSpaceAgentCatalogQuery(enabled);
  return useMemo(() => {
    const names = new Map(
      (catalog.data ?? []).map((agent) => [agent.id, agent.name])
    );
    return (id: string) => names.get(id) || id;
  }, [catalog.data]);
}
