/**
 * Which spaces the rail shows, and which sit behind the overflow chooser
 * (PLAN-spaces.md Phase 5a ②).
 *
 * One pure function so the budget rule can be argued with in tests rather than
 * in a browser: a hidden current space is promoted without reshuffling spaces
 * that are already visible, a small tenant never hides tiles, and the overflow
 * control carries the hidden spaces' indicators — a chooser that silently
 * swallows a mention is worse than a long rail.
 */

/** Below this, show everything: hiding one or two tiles costs more attention than it saves. */
export const RAIL_SPACE_NO_STACK_MAX = 4;

/** Visible shared tiles once overflow kicks in; hidden current spaces take one slot. */
export const RAIL_SPACE_BUDGET = 3;

export interface RailSpace {
  color?: string | null;
  icon?: string | null;
  id: string;
  /**
   * The viewer's own personal space (PLAN-spaces.md Phase P). At most one of
   * these can be present, because the list the caller passes is already
   * membership-filtered server-side and a user owns at most one.
   */
  isPersonal?: boolean;
  key: string;
  name: string;
}

/** Per-space unread state, resolved by the caller. */
export interface RailSpaceIndicator {
  /** Direct mentions / assignments. A COUNT is only ever this. */
  mentions?: number;
  /** Any unread activity → a dot. */
  unread?: boolean;
}

export interface RailSpaceTile extends RailSpace {
  indicator: RailSpaceIndicator;
  isCurrent: boolean;
}

export interface ResolveRailSpacesInput {
  currentSpaceId?: string | null;
  /** Per-space indicators, keyed by space id. Absent = quiet. */
  indicators?: Record<string, RailSpaceIndicator | undefined>;
  /** Recency order, newest first (`spacesRecentOrder`). */
  recent?: readonly string[];
  /** Every space in the tenant — see the note on membership below. */
  spaces: readonly RailSpace[];
}

export interface ResolveRailSpacesResult {
  /** Whether the current space had to be promoted from the hidden list. */
  currentPromoted: boolean;
  /** Spaces past the budget — the overflow chooser lists these (and the visible ones). */
  hidden: RailSpaceTile[];
  /** Total past the budget. The `⋯` control only appears when this is ≥ 2. */
  hiddenTotal: number;
  /** Rolled-up indicator for the overflow control. */
  stackIndicator: RailSpaceIndicator;
  /** Tiles rendered directly on the rail, in order. */
  visible: RailSpaceTile[];
}

/**
 * The candidate set is "spaces the user may enter", and it arrives already
 * filtered: `/api/spaces` applies the membership rule server-side, because the
 * server lane's JWT subject is the nil UUID and no policy can do it there
 * (PLAN-spaces.md Phase P2). This function must never widen that set — it
 * orders and budgets what it is handed, nothing more.
 *
 * (An earlier version of this comment said there was no per-space access control
 * at all. That was true until Phase P and is now exactly backwards.)
 *
 * **The personal space is pinned first and exempt from the budget**, which
 * amends Phase 5a's "the current space is always first": your own space is the
 * one place you always want one click away, and it is the fallback the shell
 * lands on. Shared spaces keep their recency order while visible; only a
 * current space that would otherwise be hidden is promoted.
 */
export function resolveRailSpaces(
  input: ResolveRailSpacesInput
): ResolveRailSpacesResult {
  const byId = new Map(input.spaces.map((space) => [space.id, space] as const));
  const indicatorFor = (id: string): RailSpaceIndicator =>
    input.indicators?.[id] ?? {};

  const personal = input.spaces.find((space) => space.isPersonal) ?? null;

  const ordered: RailSpace[] = [];
  const taken = new Set<string>();
  if (personal) {
    // Claimed before anything else so the passes below cannot place it a second
    // time — it is rendered separately, outside the budget.
    taken.add(personal.id);
  }
  const take = (id: string | null | undefined) => {
    if (!id || taken.has(id)) {
      return;
    }
    const space = byId.get(id);
    if (!space) {
      // A recency entry for a space that was deleted (or that this user can no
      // longer see) is normal, not an error — skip it silently.
      return;
    }
    taken.add(id);
    ordered.push(space);
  };

  // 1. recents, newest first.
  for (const id of input.recent ?? []) {
    take(id);
  }
  // 2. everything else, in the order the caller listed them (default first,
  //    then alphabetical — `listSpaces` already sorts that way).
  for (const space of input.spaces) {
    take(space.id);
  }

  // The budget governs the SHARED spaces only. Counting the pinned personal tile
  // against it would mean acquiring a personal space silently pushed a space you
  // use off the rail and into the overflow chooser.
  const budget =
    ordered.length <= RAIL_SPACE_NO_STACK_MAX
      ? ordered.length
      : RAIL_SPACE_BUDGET;
  const currentIndex = input.currentSpaceId
    ? ordered.findIndex((space) => space.id === input.currentSpaceId)
    : -1;
  const currentPromoted = currentIndex >= budget && currentIndex >= 0;
  if (currentPromoted) {
    const [current] = ordered.splice(currentIndex, 1);
    if (current) {
      ordered.unshift(current);
    }
  }

  const toTile = (space: RailSpace): RailSpaceTile => ({
    ...space,
    indicator: indicatorFor(space.id),
    isCurrent: space.id === input.currentSpaceId,
  });

  const visible = [
    ...(personal ? [toTile(personal)] : []),
    ...ordered.slice(0, budget).map(toTile),
  ];
  const hiddenAll = ordered.slice(budget).map(toTile);

  return {
    currentPromoted,
    hidden: hiddenAll,
    hiddenTotal: hiddenAll.length,
    stackIndicator: rollUpIndicators(hiddenAll),
    visible,
  };
}

/**
 * The overflow control's indicator.
 *
 * A dot if ANY hidden space has activity; a count only for mentions, summed.
 * The asymmetry is the point: a count on a *place* is a sum of unrelated things
 * and teaches people to ignore it, but a mention is addressed to you
 * personally and must survive being hidden behind the overflow control.
 */
export function rollUpIndicators(
  tiles: readonly { indicator: RailSpaceIndicator }[]
): RailSpaceIndicator {
  let mentions = 0;
  let unread = false;
  for (const tile of tiles) {
    mentions += tile.indicator.mentions ?? 0;
    unread = unread || Boolean(tile.indicator.unread);
  }
  return {
    ...(mentions > 0 ? { mentions } : {}),
    ...(unread ? { unread: true } : {}),
  };
}

/** Two-letter fallback when a space has no icon. Never the accessible name. */
export function railSpaceInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    return (words[0] ?? "").slice(0, 2).toUpperCase();
  }
  return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
}

/** Uploaded (or remote) tile art, as opposed to an emoji or initials. */
export function isSpaceImageIcon(
  icon: string | null | undefined
): icon is string {
  if (!icon) {
    return false;
  }
  return (
    icon.startsWith("data:image/") ||
    icon.startsWith("https://") ||
    icon.startsWith("http://")
  );
}
