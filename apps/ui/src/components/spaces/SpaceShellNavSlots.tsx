/**
 * The space level, handed to the app shell as route-level column content.
 *
 * These slots are the space's sidebar body. They deliberately do NOT go through
 * `usePageConfig`: that store is last-writer-wins on one global, and a module
 * page rendered inside the space writes its own config on every re-render, so
 * anything the space layout put there would be clobbered intermittently — the
 * worst kind of bug to reproduce. Passing them down the shell's props instead
 * makes the space level a fact of the ROUTE, which is what it is.
 *
 * The space is looked up by key from the URL rather than from
 * `useWorkspaceContext().currentSpace`, because that falls back to the tenant
 * default outside `/s/…` and so cannot tell us whether we are in a space at all.
 *
 * Switching spaces is the rail's job (current tile opens the chooser). The
 * column still *names* the space at every level — a label, not a control.
 * Inside a module the back-row sits under that name, so the space is not
 * replaced by a second copy of the module title.
 */
import { useUiContributions } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { SpaceModuleNavHeader } from "@/components/spaces/SpaceModuleNavHeader";
import { SpaceNavFooter } from "@/components/spaces/SpaceNavFooter";
import {
  SpaceNavCrumb,
  SpaceNavTitle,
} from "@/components/spaces/SpaceNavHeader";
import { SpaceNavTabs } from "@/components/spaces/SpaceNavTabs";
import { spaceNavLevel, spaceSectionFor } from "@/lib/space-nav";
import { spaceRootPath } from "@/lib/space-routes";
import { useSpacesQuery } from "@/lib/spaces-queries";

function useSpaceByKey(spaceKey: string) {
  const spacesQuery = useSpacesQuery();
  return useMemo(
    () => spacesQuery.data?.find((space) => space.key === spaceKey) ?? null,
    [spaceKey, spacesQuery.data]
  );
}

/** Column header at every space level: the space's name, not a switcher. */
export function SpaceNavTitleSlot({ spaceKey }: { spaceKey: string }) {
  const space = useSpaceByKey(spaceKey);
  return (
    <SpaceNavTitle
      color={space?.color}
      icon={space?.icon}
      name={space?.name ?? spaceKey}
    />
  );
}

/** Collapsed topbar: the space named in the trail, not a switcher. */
export function SpaceNavCrumbSlot({ spaceKey }: { spaceKey: string }) {
  const space = useSpaceByKey(spaceKey);
  const name = space?.name ?? spaceKey;
  return (
    <SpaceNavCrumb
      color={space?.color}
      icon={space?.icon}
      name={name}
      to={spaceRootPath(spaceKey)}
    />
  );
}

export function SpaceNavLeadingSlot({
  moduleId,
  segment,
  spaceKey,
}: {
  moduleId: string | undefined;
  segment: string | undefined;
  spaceKey: string;
}) {
  const space = useSpaceByKey(spaceKey);
  const { contributions } = useUiContributions();
  const spaceTabs = contributions.spaceTabs ?? [];
  // At the module level the body belongs entirely to that module's own nav —
  // the tabs and the mount list slid away with the back arrow. Copilot drills
  // in the same way: its thread list is that nav, not a mix-in on Work.
  if (moduleId && spaceNavLevel(moduleId, spaceTabs) === "module") {
    return (
      <SpaceModuleNavHeader
        moduleId={moduleId}
        spaceId={space?.id ?? null}
        spaceKey={spaceKey}
      />
    );
  }
  return (
    <SpaceNavTabs
      activeModuleId={moduleId}
      // `/api/spaces` is membership-filtered, so an owned space in that list is
      // the viewer's own personal one.
      isPersonal={space?.ownerUserId != null}
      section={spaceSectionFor({ moduleId, segment }, spaceTabs)}
      space={space}
      spaceId={space?.id ?? null}
      spaceKey={spaceKey}
    />
  );
}

/**
 * The column's footer: the space's Settings link.
 *
 * **Only on the space's OWN pages.** It used to render everywhere, on the
 * reasoning that Settings is the column's furniture rather than part of the
 * space level that slides away. That was wrong in practice: a module pins its
 * own settings entry to the foot of its nav, so with a module open the column
 * ended with two rows both labelled "Settings", one under the other, pointing
 * at different things — and the module's is the one being looked for there.
 *
 * The condition is "a module contributed a column", NOT `spaceNavLevel` — which
 * is what {@link SpaceNavLeadingSlot} keys off, and rightly, because that one is
 * about whether the tab strip stays. A plugin space tab (Plan) keeps the tabs
 * and so stays at the space LEVEL, but its column is still a module's column
 * with a module's footer in it, so it duplicated too.
 *
 * Copilot is the same: once you drill in, the column is Copilot's thread list,
 * not the space's, so the space's Settings row would sit under the wrong nav.
 */
export function SpaceNavFooterSlot({
  moduleId,
  spaceKey,
}: {
  moduleId: string | undefined;
  spaceKey: string;
}) {
  if (moduleId) {
    return null;
  }
  // The key comes straight from the URL, so the link renders on the first
  // frame — no waiting on the spaces query just to build a path out of a
  // segment we already have.
  return <SpaceNavFooter spaceKey={spaceKey} />;
}
