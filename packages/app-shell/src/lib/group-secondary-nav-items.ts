import type { SecondaryNavLinkItem } from "../components/app-layout/types.js";

export type SecondaryNavGroup =
  | { item: SecondaryNavLinkItem; type: "item" }
  | { type: "separator" }
  | { heading: string; items: SecondaryNavLinkItem[]; type: "section" };

/**
 * Adjacent unheaded links become one stack so Settings can use the same
 * `gap-3` between sections that the space Work list uses (Inbox, then
 * Agents / Modules / People). Separators are spacing, not a painted line.
 */
export type SecondaryNavCluster =
  | { items: SecondaryNavLinkItem[]; type: "items" }
  | { heading: string; items: SecondaryNavLinkItem[]; type: "section" };

export function clusterSecondaryNavGroups(
  groups: readonly SecondaryNavGroup[]
): SecondaryNavCluster[] {
  const clusters: SecondaryNavCluster[] = [];
  for (const group of groups) {
    if (group.type === "separator") {
      continue;
    }
    if (group.type === "item") {
      const last = clusters.at(-1);
      if (last?.type === "items") {
        last.items.push(group.item);
      } else {
        clusters.push({ type: "items", items: [group.item] });
      }
      continue;
    }
    clusters.push({
      heading: group.heading,
      items: group.items,
      type: "section",
    });
  }
  return clusters;
}

/**
 * Fold a flat secondary-nav list (core links, optional separator, then
 * `heading` + link runs) into groups so category headings can collapse.
 */
export function groupSecondaryNavItems(
  items: SecondaryNavLinkItem[]
): SecondaryNavGroup[] {
  const groups: SecondaryNavGroup[] = [];
  let current: { heading: string; items: SecondaryNavLinkItem[] } | null = null;

  const flush = () => {
    if (!current) {
      return;
    }
    groups.push({
      type: "section",
      heading: current.heading,
      items: current.items,
    });
    current = null;
  };

  for (const item of items) {
    if (item.type === "separator") {
      flush();
      groups.push({ type: "separator" });
      continue;
    }
    if (item.type === "heading") {
      flush();
      current = { heading: item.label, items: [] };
      continue;
    }
    if (current) {
      current.items.push(item);
      continue;
    }
    groups.push({ type: "item", item });
  }
  flush();
  return groups;
}
