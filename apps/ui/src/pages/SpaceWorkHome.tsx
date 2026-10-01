/**
 * The space's home at `/s/<key>` — the sidebar, unfolded (PLAN-space-home.md).
 *
 * One card per conversation, in the sidebar's own order: Favoriten first, then
 * the personal sections, then the built-ins. A pinned row always has a card; an
 * unpinned one only while it is live (waiting, paused, running, or finished
 * since the last visit). Everything else is named in one line at the end.
 *
 * Beside the cards, the lists of nouns: the artifacts this person pinned,
 * the files they keep at hand, the modules the space mounts, and the extra
 * accounts those modules use. A module's own landing page (the Tasks
 * briefing, …) stays under its space tab, not here.
 *
 * Copilot stays the dock. The one composer here belongs to a pinned card with
 * nothing to answer, and it writes into that conversation, not to the Space.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { useSpaceAttention } from "@engenty/notifications-ui";
import {
  cn,
  DOC_SIDEBAR_WIDTH_TRANSITION_CLASS,
  DocSidebarLayout,
  uiPageScrollClassName,
  useDocSidebar,
} from "@engenty/ui-core";
import {
  type PageBreadcrumb,
  usePageConfig,
  useWorkspaceContext,
} from "@engenty/ui-plugin-sdk";
import { useCurrentUserProfile } from "@engenty/user-management-ui";
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { SpaceHomeArtifacts } from "@/components/space-home/SpaceHomeArtifacts";
import { SpaceHomeAttention } from "@/components/space-home/SpaceHomeAttention";
import { SpaceHomeCard } from "@/components/space-home/SpaceHomeCard";
import { SpaceHomeExtensions } from "@/components/space-home/SpaceHomeExtensions";
import { SpaceHomeFiles } from "@/components/space-home/SpaceHomeFiles";
import { SpaceHomeHeader } from "@/components/space-home/SpaceHomeHeader";
import { SpaceHomeHireEmptyCard } from "@/components/space-home/SpaceHomeHireEmptyCard";
import { SpaceHomeModules } from "@/components/space-home/SpaceHomeModules";
import { SpaceHomeQuietLine } from "@/components/space-home/SpaceHomeQuietLine";
import { SpaceHomeSectionHeading } from "@/components/space-home/SpaceHomeSectionHeading";
import { SpaceHomeSkills } from "@/components/space-home/SpaceHomeSkills";
import {
  SPACE_HOME_SIDEBAR_KEY,
  SpaceHomeTopbarActions,
} from "@/components/space-home/SpaceHomeTopbarActions";
import { SpaceHomeWorkflows } from "@/components/space-home/SpaceHomeWorkflows";
import { SpacePluginHomeSections } from "@/components/spaces/space-plugin-sections";
import type { SpaceHomeCard as SpaceHomeCardModel } from "@/lib/space-home-cards";
import { useSpacesQuery } from "@/lib/spaces-queries";
import { useEnsureHireWelcome } from "@/lib/use-ensure-hire-welcome";
import { useSpaceHome } from "@/lib/use-space-home";
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

export function SpaceWorkHome() {
  const { t } = useTranslation("common");
  const { spaceKey = "" } = useParams();
  const { isSuperAdmin, isTenantAdmin } = useWorkspaceContext();
  const canManage = Boolean(isTenantAdmin || isSuperAdmin);
  const sidebar = useDocSidebar(SPACE_HOME_SIDEBAR_KEY);
  // The rail beside the cards, as the project settings sit beside a project:
  // an inline column when there is room, an overlay sheet when not. Open, the
  // row (and the header over it) widens so the cards keep their measure.
  const rowClassName = cn(
    "mx-auto w-full px-page",
    DOC_SIDEBAR_WIDTH_TRANSITION_CLASS,
    sidebar.mode === "inline" && sidebar.open ? "max-w-6xl" : "max-w-4xl"
  );
  const spacesQuery = useSpacesQuery();
  const space = useMemo(
    () => spacesQuery.data?.find((entry) => entry.key === spaceKey) ?? null,
    [spaceKey, spacesQuery.data]
  );
  const { agents, isPending: rosterPending } = useSpaceRosterAgents(
    space?.id ?? null
  );
  const rosterById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents]
  );
  const mountedAgentIds = useMemo(
    () => new Set(agents.map((agent) => agent.id)),
    [agents]
  );
  const home = useSpaceHome(space?.id ?? null);
  const attention = useSpaceAttention();
  const deskAttention = (card: SpaceHomeCardModel) =>
    card.item.kind === "desk"
      ? (attention.byAgent.get(card.item.agent.id)?.length ?? 0)
      : 0;
  useEnsureHireWelcome({
    agents,
    ready: Boolean(space?.id) && !rosterPending && !home.isPending,
    spokenAgentIds: home.spokenAgentIds,
    spaceId: space?.id ?? null,
  });
  // First name only: the greeting is a hello, not an address label.
  const { displayName } = useCurrentUserProfile();
  const firstName = displayName.trim().split(/\s+/)[0] ?? "";
  const pinnedCards = home.cards.filter((card) => card.pinned);
  const otherCards = home.cards.filter((card) => !card.pinned);
  // Memoized: the shell compares action nodes by identity, so a fresh element
  // every render is an update loop.
  const pageActions = useMemo(
    () => (space ? <SpaceHomeTopbarActions space={space} /> : null),
    [space]
  );

  const greeting = greetingKey(new Date().getHours());

  usePageConfig({
    actions: pageActions,
    breadcrumbs: NO_BREADCRUMBS,
    contentStackBackground: "paper",
  });

  return (
    <div className={uiPageScrollClassName}>
      {space ? (
        <div className="@container w-full min-w-0">
          <SpaceHomeHeader
            canManage={canManage}
            className={rowClassName}
            space={space}
          />
          <DocSidebarLayout
            className={cn(rowClassName, "pt-5 pb-6")}
            resizable
            sidebar={
              <div className="flex min-w-0 flex-col gap-5">
                <SpaceHomeArtifacts spaceId={space.id} spaceKey={space.key} />
                <SpaceHomeWorkflows
                  mountedAgentIds={mountedAgentIds}
                  spaceKey={space.key}
                />
                <SpaceHomeFiles spaceId={space.id} spaceKey={space.key} />
                <SpacePluginHomeSections
                  slot="space.home.aside"
                  spaceId={space.id}
                  spaceKey={space.key}
                />
                <SpaceHomeModules spaceId={space.id} spaceKey={space.key} />
                <SpaceHomeExtensions spaceId={space.id} spaceKey={space.key} />
                <SpaceHomeSkills space={space} />
              </div>
            }
            sidebarLabel={t("spaces.home.sidebarLabel", {
              defaultValue: "In this space",
            })}
            storageKey={SPACE_HOME_SIDEBAR_KEY}
          >
            <div className="flex min-w-0 flex-col">
              {/* The hello sits under the header: the header names the space,
                  the greeting names the person. */}
              <p className="font-semibold text-lg tracking-tight">
                {firstName
                  ? t(`spaces.home.greetingNamed.${greeting}`, {
                      defaultValue: `${GREETINGS[greeting]}, {{name}}.`,
                      name: firstName,
                    })
                  : t(`spaces.home.greeting.${greeting}`, {
                      defaultValue: `${GREETINGS[greeting]}.`,
                    })}
              </p>
              {/* What waits for a person comes before every conversation. */}
              <SpaceHomeAttention
                items={attention.items}
                spaceKey={space.key}
              />
              {!rosterPending && agents.length === 0 ? (
                <SpaceHomeHireEmptyCard space={space} />
              ) : null}
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
                        attentionCount={deskAttention(card)}
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
                    {t("spaces.home.sections.active", {
                      defaultValue: "Active",
                    })}
                  </SpaceHomeSectionHeading>
                  <div className="flex flex-col gap-2.5">
                    {otherCards.map((card) => (
                      <SpaceHomeCard
                        attentionCount={deskAttention(card)}
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
              <SpacePluginHomeSections
                slot="space.home.main"
                spaceId={space.id}
                spaceKey={space.key}
              />
            </div>
          </DocSidebarLayout>
        </div>
      ) : null}
    </div>
  );
}
