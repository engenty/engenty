import { HOTKEY_GROUP } from "@engenty/ui-core";

export interface ShortcutListItem {
  description?: string;
  group: string;
  hotkey: string;
  id: string;
  name: string;
}

const GROUP_ORDER: readonly string[] = [
  HOTKEY_GROUP.general,
  HOTKEY_GROUP.lists,
  HOTKEY_GROUP.copilot,
];

export interface ShortcutListGroup {
  group: string;
  items: ShortcutListItem[];
}

export function shortcutItemsFromRegistrations(
  registrations: Array<{
    hotkey: string;
    id: string;
    options?: {
      meta?: { description?: string; group?: string; name?: string };
    };
  }>
): ShortcutListItem[] {
  return registrations.map((reg) => ({
    description: reg.options?.meta?.description,
    group: reg.options?.meta?.group ?? HOTKEY_GROUP.general,
    hotkey: String(reg.hotkey),
    id: reg.id,
    name: reg.options?.meta?.name ?? String(reg.hotkey),
  }));
}

export function groupShortcutItems(
  items: ShortcutListItem[]
): ShortcutListGroup[] {
  const byGroup = new Map<string, ShortcutListItem[]>();
  for (const item of items) {
    const existing = byGroup.get(item.group) ?? [];
    if (
      existing.some(
        (row) => row.hotkey === item.hotkey && row.name === item.name
      )
    ) {
      continue;
    }
    existing.push(item);
    byGroup.set(item.group, existing);
  }

  return [...byGroup.keys()]
    .sort((a, b) => {
      const aOrder = GROUP_ORDER.indexOf(a);
      const bOrder = GROUP_ORDER.indexOf(b);
      const aRank = aOrder === -1 ? GROUP_ORDER.length : aOrder;
      const bRank = bOrder === -1 ? GROUP_ORDER.length : bOrder;
      if (aRank !== bRank) {
        return aRank - bRank;
      }
      return a.localeCompare(b);
    })
    .map((group) => ({ group, items: byGroup.get(group) ?? [] }));
}
