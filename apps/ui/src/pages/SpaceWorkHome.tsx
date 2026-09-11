/**
 * The space's home at `/s/<key>` — the sidebar, unfolded (PLAN-space-home.md).
 *
 * One card per conversation, in the sidebar's own order: Favoriten first, then
 * the personal sections, then the built-ins. A pinned row always has a card; an
 * unpinned one only while it is live (waiting, paused, running, or finished
 * since the last visit). Everything else is named in one line at the end.
 *
 * Beside the cards, the two lists of nouns: the artifacts this person pinned
 * and the modules the space mounts. And below both — when a mounted plugin
 * opted in via `registerSpaceTab({ embedOnHome })` — that module's landing
 * page.
 *
 * Copilot stays the dock. The one composer here belongs to a pinned card with
 * nothing to answer, and it writes into that conversation, not to the Space.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, uiPageScrollClassName } from "@engenty/ui-core";
import {
  type PageBreadcrumb,
  PageHeaderProvider,
  usePageConfig,
  useUiContributions,
} from "@engenty/ui-plugin-sdk";
import { useCurrentUserProfile } from "@engenty/user-management-ui";
import { Pencil } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { SpaceHomeArtifacts } from "@/components/space-home/SpaceHomeArtifacts";
import { SpaceHomeCard } from "@/components/space-home/SpaceHomeCard";
import { SpaceHomeModules } from "@/components/space-home/SpaceHomeModules";
import { SpaceHomeQuietLine } from "@/components/space-home/SpaceHomeQuietLine";
import { SpaceHomeSectionHeading } from "@/components/space-home/SpaceHomeSectionHeading";
import { SpaceHomeTopbarActions } from "@/components/space-home/SpaceHomeTopbarActions";
import { SpaceNavTile } from "@/components/spaces/SpaceNavHeader";
import { spaceTabModuleId } from "@/lib/space-nav";
import { MODULE_ROUTE_PREFIX } from "@/lib/space-route-mirrors";
import { spaceSettingsPath } from "@/lib/space-routes";
import { useSpacesQuery } from "@/lib/spaces-queries";
import { useSpaceHome } from "@/lib/use-space-home";
import { useSpaceModules } from "@/lib/use-space-modules";
import { useSpaceRosterAgents } from "@/lib/use-space-roster-agents";

/** Stable identity — a fresh array each render would re-set the slot forever. */
const NO_BREADCRUMBS: PageBreadcrumb[] = [];

/** Morning / afternoon / evening, by the viewer's own clock. */
function greetingKey(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) {
    return "morning";
  }
  return hour < 18 ? "afternoon" : "evening";
}

const GREETINGS = {
  afternoon: "Good afternoon",
  evening: "Good evening",
  morning: "Good morning",
} as const;

function spaceTabRoutePath(tab: {
  moduleId?: string;
  path?: string;
  pluginId: string;
}): string {
  const moduleId = spaceTabModuleId(tab);
  return tab.path
    ? `${MODULE_ROUTE_PREFIX}${moduleId}/${tab.path}`
    : `${MODULE_ROUTE_PREFIX}${moduleId}`;
}

export function SpaceWorkHome() {
  const { t } = useTranslation("common");
  const { spaceKey = "" } = useParams();
  const spacesQuery = useSpacesQuery();
  const { contributions } = useUiContributions();
  const space = useMemo(
    () => spacesQuery.data?.find((entry) => entry.key === spaceKey) ?? null,
    [spaceKey, spacesQuery.data]
  );
  const { modules } = useSpaceModules(space?.id ?? null);
  const { agents } = useSpaceRosterAgents(space?.id ?? null);
  const rosterById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents]
  );
  const home = useSpaceHome(space?.id ?? null);
  // First name only: the greeting is a hello, not an address label.
  const { displayName } = useCurrentUserProfile();
  const firstName = displayName.trim().split(/\s+/)[0] ?? "";
  const pinnedCards = home.cards.filter((card) => card.pinned);
  const otherCards = home.cards.filter((card) => !card.pinned);
  const HomePage = useMemo(() => {
    const mounted = new Set(modules.map((module) => module.id));
    const homeTab = [...(contributions.spaceTabs ?? [])]
      .filter((tab) => tab.embedOnHome && mounted.has(spaceTabModuleId(tab)))
      .sort((left, right) => (left.order ?? 100) - (right.order ?? 100))[0];
    if (!homeTab) {
      return null;
    }
    const routePath = spaceTabRoutePath(homeTab);
    return (
      contributions.routes.find((route) => route.path === routePath)
        ?.component ?? null
    );
  }, [contributions.routes, contributions.spaceTabs, modules]);

  // Memoized: the shell compares action nodes by identity, so a fresh element
  // every render is an update loop.
  const pageActions = useMemo(
    () => (space ? <SpaceHomeTopbarActions space={space} /> : null),
    [space]
  );

  const greeting = greetingKey(new Date().getHours());

  // This page owns the shell chrome; a module embedded in it does not.
  usePageConfig({
    actions: pageActions,
    breadcrumbs: NO_BREADCRUMBS,
    contentStackBackground: "paper",
  });

  return (
    <div
      className={cn(
        uiPageScrollClassName,
        // The embed is its own `.ui-page-scroll`; keep one safe area, not two.
        HomePage ? "pb-0" : null
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl shrink-0 flex-col px-page pt-7 pb-6">
        {/* Short on purpose: the space is named twice over already — switcher
            and breadcrumb — so the greeting is the only heading. */}
        {space ? (
          <>
            {/* Whose home this is: the same tile the rail and the sidebar
                header show, the space's name, and what it is for. A person who
                did not set the space up has nowhere else to read that. */}
            <div className="group flex items-start gap-3.5 pb-5">
              <SpaceNavTile
                color={space.color}
                icon={space.icon}
                name={space.name}
                size="xl"
              />
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="truncate font-semibold text-[17px]">
                    {space.name}
                  </p>
                  {/* Editing the space is the one thing you do FROM its name.
                      Hidden until the header is hovered (and always there for
                      the keyboard), so identity stays identity at rest. */}
                  <Button
                    asChild
                    className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Link
                      aria-label={t("navigation.settings", {
                        defaultValue: "Settings",
                      })}
                      to={spaceSettingsPath(space.key)}
                    >
                      <Pencil aria-hidden className="size-3.5" />
                    </Link>
                  </Button>
                </div>
                {space.description?.trim() ? (
                  <p className="line-clamp-2 text-[13px] text-muted-foreground leading-relaxed">
                    {space.description}
                  </p>
                ) : null}
              </div>
            </div>
            <h1 className="font-semibold text-3xl tracking-tight">
              {firstName
                ? t(`spaces.home.greetingNamed.${greeting}`, {
                    defaultValue: `${GREETINGS[greeting]}, {{name}}.`,
                    name: firstName,
                  })
                : t(`spaces.home.greeting.${greeting}`, {
                    defaultValue: `${GREETINGS[greeting]}.`,
                  })}
            </h1>
          </>
        ) : null}
      </div>
      {space ? (
        <div className="mx-auto flex w-full max-w-6xl shrink-0 flex-col gap-5 px-page lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Favoriten first, always — the sidebar's own split, not a
                ranking. What follows is everything that is live right now. */}
            {pinnedCards.length > 0 ? (
              <>
                <SpaceHomeSectionHeading>
                  {t("spaces.home.sections.pinned", {
                    defaultValue: "Favourites",
                  })}
                </SpaceHomeSectionHeading>
                <div className="flex flex-col gap-2.5">
                  {pinnedCards.map((card) => (
                    <SpaceHomeCard
                      card={card}
                      key={card.item.key}
                      rosterById={rosterById}
                      space={space}
                    />
                  ))}
                </div>
              </>
            ) : null}
            {otherCards.length > 0 ? (
              <>
                <SpaceHomeSectionHeading>
                  {t("spaces.home.sections.active", { defaultValue: "Active" })}
                </SpaceHomeSectionHeading>
                <div className="flex flex-col gap-2.5">
                  {otherCards.map((card) => (
                    <SpaceHomeCard
                      card={card}
                      key={card.item.key}
                      rosterById={rosterById}
                      space={space}
                    />
                  ))}
                </div>
              </>
            ) : null}
            {home.quiet.length > 0 ? (
              <>
                <SpaceHomeSectionHeading>
                  {t("spaces.home.sections.quiet", {
                    defaultValue: "Inactive",
                  })}
                </SpaceHomeSectionHeading>
                <SpaceHomeQuietLine items={home.quiet} spaceKey={space.key} />
              </>
            ) : null}
          </div>
          <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-[322px]">
            <SpaceHomeArtifacts spaceId={space.id} spaceKey={space.key} />
            <SpaceHomeModules spaceId={space.id} spaceKey={space.key} />
          </aside>
        </div>
      ) : null}
      {HomePage ? (
        // A page-config BOUNDARY, not a styling wrapper. The embedded page
        // calls `usePageConfig` — crumb, module sidebar, "New" menu — which
        // belongs to that module's own page, not to the space root. Those
        // writes go through this context, so a second provider parks them in a
        // store nothing renders.
        //
        // `shrink-0` keeps the embed out of the flex leftover: plugin pages
        // ship the DESIGN.md scroll shell (`flex-1 min-h-0 overflow-y-auto`),
        // which would otherwise fill the remaining viewport and scroll on
        // their own while the greeting stayed pinned. This dashboard is the
        // only scroller; the embed sizes to content.
        <PageHeaderProvider>
          <div className="mt-6 w-full shrink-0">
            <HomePage />
          </div>
        </PageHeaderProvider>
      ) : null}
    </div>
  );
}
