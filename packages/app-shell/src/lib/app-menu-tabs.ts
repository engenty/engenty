export interface AppMenuLabels {
  about: string;
  actions: string;
  all: string;
  empty: string;
  loading: string;
  search: string;
  settings: string;
  spaceEmpty: string;
}

export const APP_MENU_LABELS: AppMenuLabels = {
  about: "About",
  actions: "Actions",
  all: "All",
  empty: "No results found.",
  loading: "Loading…",
  search: "Search apps…",
  settings: "Settings",
  spaceEmpty: "Nothing in this space yet.",
};

export interface AppMenuSpaceTab {
  color?: string | null;
  icon?: string | null;
  id: string;
  key: string;
  name: string;
}

/**
 * Tabs after All: the space you are in, then recently opened, then every
 * other space you can enter. Recency only orders the row — it does not
 * hide spaces.
 */
export function latestAppMenuSpaces<
  T extends { id: string; key: string; name?: string },
>(input: {
  currentKey?: string | null;
  recentIds: readonly string[];
  spaces: readonly T[];
}): T[] {
  const byId = new Map(input.spaces.map((space) => [space.id, space]));
  const byKey = new Map(input.spaces.map((space) => [space.key, space]));
  const ordered: T[] = [];
  const seen = new Set<string>();
  const push = (space: T | undefined) => {
    if (!space || seen.has(space.id)) {
      return;
    }
    seen.add(space.id);
    ordered.push(space);
  };
  if (input.currentKey) {
    push(byKey.get(input.currentKey));
  }
  for (const id of input.recentIds) {
    push(byId.get(id));
  }
  const rest = input.spaces
    .filter((space) => !seen.has(space.id))
    .sort((left, right) =>
      (left.name ?? left.key).localeCompare(right.name ?? right.key)
    );
  for (const space of rest) {
    push(space);
  }
  return ordered;
}

export interface AppMenuCaret {
  selectionEnd: number;
  selectionStart: number;
  value: string;
}

/**
 * Left/right move the tab row. Inside a search field they still move the
 * caret until it is already at that edge (or the field is empty).
 */
export function appMenuTabStep(
  key: string,
  caret: AppMenuCaret | null
): -1 | 1 | null {
  if (key !== "ArrowLeft" && key !== "ArrowRight") {
    return null;
  }
  const step = key === "ArrowLeft" ? -1 : 1;
  if (!caret) {
    return step;
  }
  if (caret.selectionStart !== caret.selectionEnd) {
    return null;
  }
  if (step < 0 && caret.selectionStart > 0) {
    return null;
  }
  if (step > 0 && caret.selectionEnd < caret.value.length) {
    return null;
  }
  return step;
}

export function caretFromKeyTarget(
  target: EventTarget | null
): AppMenuCaret | null {
  if (
    !(
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    )
  ) {
    return null;
  }
  return {
    selectionEnd: target.selectionEnd ?? 0,
    selectionStart: target.selectionStart ?? 0,
    value: target.value,
  };
}
