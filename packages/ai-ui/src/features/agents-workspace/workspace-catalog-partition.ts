import { isCoreAgentModuleId } from "../ai-settings/agent-catalog";

export interface CatalogModuleFolder<T> {
  items: T[];
  moduleId: string;
}

/** Core `module_id` items stay at root; others grouped by `module_id`, folders sorted by id. */
export function partitionCatalogByCoreModule<
  T extends { module_id: string; name: string },
>(items: T[]): { folders: CatalogModuleFolder<T>[]; root: T[] } {
  const root: T[] = [];
  const map = new Map<string, T[]>();
  for (const item of items) {
    if (isCoreAgentModuleId(item.module_id)) {
      root.push(item);
      continue;
    }
    const list = map.get(item.module_id) ?? [];
    list.push(item);
    map.set(item.module_id, list);
  }
  const folders = [...map.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([moduleId, folderItems]) => ({
      items: folderItems.toSorted((left, right) =>
        left.name.localeCompare(right.name)
      ),
      moduleId,
    }));
  return { folders, root };
}
