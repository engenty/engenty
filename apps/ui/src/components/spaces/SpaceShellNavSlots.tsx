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
 * column still *names* the space at every level, and that name is the link
 * home — there is no Dashboard row under it any more. Inside a module the
 * header is one row: a back arrow to the space, the space's tile, the
 * module's name.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { useUiContributions } from "@engenty/ui-plugin-sdk";
import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { SpaceNavFooter } from "@/components/spaces/SpaceNavFooter";
import {
  SpaceNavCrumb,
  SpaceNavTitle,
} from "@/components/spaces/SpaceNavHeader";
import { SpaceNavTabs } from "@/components/spaces/SpaceNavTabs";
import { spaceNavLevel, spaceSectionFor } from "@/lib/space-nav";
import { spaceModulePath, spaceRootPath } from "@/lib/space-routes";
import { useSpacesQuery } from "@/lib/spaces-queries";
import { useSpaceModules } from "@/lib/use-space-modules";

function useSpaceByKey(spaceKey: string) {
  const spacesQuery = useSpacesQuery();
  return useMemo(
    () => spacesQuery.data?.find((space) => space.key === spaceKey) ?? null,
    [spaceKey, spacesQuery.data]
  );
}

/**
 * Column header: the space's tile, then where you are. At the space's own
 * level that is the space's name, linking home; inside a module it is the
 * module's name, linking to the module root, with the way back to the space
 * as an arrow at the far left of the same row. The arrow returns to the space
 * root, never `history.back()`: it means "up one level".
 */
export function SpaceNavTitleSlot({
  moduleLevelId,
  spaceKey,
}: {
  /** The open module, when the column is at module level. */
  moduleLevelId?: string;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const space = useSpaceByKey(spaceKey);
  const { modules } = useSpaceModules(space?.id ?? null);
  const module = moduleLevelId
    ? modules.find((entry) => entry.id === moduleLevelId)
    : undefined;
  const atModule = Boolean(moduleLevelId);
  // ONE tree for both levels, so going into a module and back animates rather
  // than swapping rows: the arrow grows in from zero width and pushes the
  // tile over, and only the label's text changes.
  return (
    <div className="flex min-w-0 items-center">
      <div
        className={cn(
          "shrink-0 overflow-hidden transition-[width,margin,opacity] duration-200 ease-out",
          atModule ? "mr-0.5 -ml-1.5 w-7 opacity-100" : "w-0 opacity-0"
        )}
      >
        <Button
          aria-hidden={!atModule}
          aria-label={t("spaces.nav.backToSpace", { defaultValue: "Back" })}
          asChild
          className="size-7 text-muted-foreground hover:text-foreground"
          size="icon"
          tabIndex={atModule ? undefined : -1}
          variant="ghost"
        >
          <Link to={spaceRootPath(spaceKey)}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
      </div>
      <SpaceNavTitle
        color={space?.color}
        icon={space?.icon}
        label={moduleLevelId ? (module?.label ?? moduleLevelId) : undefined}
        name={space?.name ?? spaceKey}
        to={
          moduleLevelId
            ? spaceModulePath(spaceKey, moduleLevelId)
            : spaceRootPath(spaceKey)
        }
      />
    </div>
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
  // At the module level the body belongs to that module's own nav — the
  // space's section lists slide away, but its tab strip stays, so the other
  // sections are one click away from inside a module. The header row above
  // names the module and carries the way back. Copilot drills in the same
  // way: its thread list is that nav, not a mix-in on Work.
  const moduleLevel = Boolean(
    moduleId && spaceNavLevel(moduleId, spaceTabs) === "module"
  );
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
      tabsOnly={moduleLevel}
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
