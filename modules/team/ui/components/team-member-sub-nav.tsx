import { useTranslation } from "@engenty/i18n/ui";
import { TabsList, TabsTrigger } from "@engenty/ui-core";
import type { TeamMemberDetailTab } from "../member-detail-tabs.js";

/** The built-in core tab, always first. Extension tabs come from the registry. */
const PROFILE_TAB = {
  id: "profile",
  labelKey: "detail.tabs.profile",
  labelDefault: "Profile",
} as const;

/**
 * Member-detail section tabs. `visibleTabs` is the already-filtered extension
 * list from `useVisibleTeamMemberDetailTabs` — the single reactive source of
 * truth, so the nav and its owning page never disagree on which tabs exist.
 */
export function TeamMemberSubNav({
  visibleTabs,
}: {
  visibleTabs: readonly TeamMemberDetailTab[];
}) {
  const { t } = useTranslation("team");

  return (
    <TabsList
      className="-mb-px h-auto w-fit border-0 bg-transparent p-0"
      variant="line"
    >
      <TabsTrigger value={PROFILE_TAB.id}>
        {t(PROFILE_TAB.labelKey, { defaultValue: PROFILE_TAB.labelDefault })}
      </TabsTrigger>
      {visibleTabs.map((tab) => (
        <TabsTrigger key={tab.id} value={tab.id}>
          {t(tab.labelKey, { defaultValue: tab.labelDefault })}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
