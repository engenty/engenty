/**
 * Favoriten: pinned conversations of any kind, listed at the top of the Work
 * list in the same rows the sections use — a desk's blob and name, a room's
 * cluster, a DM's blob with its lock — so a pinned desk looks like the desk
 * it is, only nearer. Empty list is omitted (no empty heading). Click opens
 * the same place as the row below; drag reorders among pins or drops into a
 * section (unpinning).
 */

import type { ChatSpaceAudience } from "@engenty/ai-ui";
import type { SpaceConversationItem } from "@/lib/space-conversation-sections";
import type { SpaceRosterAgent } from "@/lib/use-space-roster-agents";
import { SpaceConversationRow } from "./SpaceConversationSection";
import {
  SpaceConversationDraggable,
  SpaceConversationDropZone,
} from "./space-conversation-dnd";

export const FAVORITES_CONTAINER_ID = "favorites";

export function SpaceFavorites({
  audience,
  items,
  rosterById,
  spaceKey,
}: {
  /** How far the space reaches — the tier of its desks and open rooms. */
  audience: ChatSpaceAudience | null;
  items: readonly SpaceConversationItem[];
  rosterById: ReadonlyMap<string, SpaceRosterAgent>;
  spaceKey: string;
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <SpaceConversationDropZone
      className="flex min-h-2 flex-col"
      id={FAVORITES_CONTAINER_ID}
      items={items.map((item) => item.key)}
    >
      {items.map((item) => (
        <SpaceConversationDraggable id={item.key} key={item.key}>
          <SpaceConversationRow
            audience={audience}
            isPinned
            item={item}
            rosterById={rosterById}
            sectionId={FAVORITES_CONTAINER_ID}
            spaceKey={spaceKey}
          />
        </SpaceConversationDraggable>
      ))}
    </SpaceConversationDropZone>
  );
}
