import {
  useContributionRegistry,
  useFeatureFlags,
} from "@engenty/ui-plugin-sdk";
import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  type TeamMemberDetailTab,
  teamMemberDetailTabRegistry,
} from "../member-detail-tabs.js";
import { getTeamPluginsApi } from "../plugins.js";

/** Built-in core tab id, owned by the base detail route (no url suffix). */
const PROFILE_TAB_ID = "profile";

/**
 * Reactive source of truth for the extension tabs on the member detail page.
 *
 * Tabs are contributed by plugins (`work` by team, `hr`/`time` by team-hr) at
 * init time, which can land after a consumer has already mounted. Subscribing
 * to the registry (instead of reading it synchronously in render) means a late
 * registration re-renders the nav, so contributed tabs never silently vanish.
 * Visibility still depends on plugin enablement + feature flags, both folded in
 * here so every consumer (sub-nav, pages) sees the same filtered list.
 */
export function useVisibleTeamMemberDetailTabs(): TeamMemberDetailTab[] {
  const allTabs = useContributionRegistry(teamMemberDetailTabRegistry);
  const pluginsApi = getTeamPluginsApi();
  const { resolved: featureFlags } = useFeatureFlags();

  return useMemo(
    () =>
      allTabs.filter((tab) =>
        tab.isVisible ? tab.isVisible({ pluginsApi, featureFlags }) : true
      ),
    [allTabs, pluginsApi, featureFlags]
  );
}

/**
 * Shared section-tab navigation for the member-detail pages. Resolves the active
 * tab from the current URL suffix and routes by each tab's `urlSuffix`, so the
 * profile page and the team-hr HR page navigate identically (no bespoke,
 * partial handlers that silently drop tabs like `time`).
 */
export function useTeamMemberDetailTabNav(
  id: string | undefined,
  visibleTabs: readonly TeamMemberDetailTab[]
): { activeTab: string; onTabChange: (value: string) => void } {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = useMemo(() => {
    const base = `/mdl/team/${id}`;
    const suffix = location.pathname.startsWith(base)
      ? location.pathname.slice(base.length).replace(/^\//, "")
      : "";
    return (
      visibleTabs.find((tab) => tab.urlSuffix === suffix)?.id ?? PROFILE_TAB_ID
    );
  }, [location.pathname, id, visibleTabs]);

  const onTabChange = useCallback(
    (value: string) => {
      if (value === PROFILE_TAB_ID) {
        navigate(`/mdl/team/${id}`);
        return;
      }
      const suffix = visibleTabs.find((tab) => tab.id === value)?.urlSuffix;
      navigate(suffix ? `/mdl/team/${id}/${suffix}` : `/mdl/team/${id}`);
    },
    [id, navigate, visibleTabs]
  );

  return { activeTab, onTabChange };
}
