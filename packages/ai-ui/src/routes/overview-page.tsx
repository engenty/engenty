// Overview dashboard at /admin/engenty (ui-6 §1). Composition only — pieces
// live in features/admin-overview/.

import { useShellSecondaryNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { type PageBreadcrumb, usePageConfig } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { CapabilityCards } from "../features/admin-overview/capability-cards";
import {
  OverviewFooterLinks,
  OverviewQuickActions,
} from "../features/admin-overview/overview-quick-actions";
import { OverviewRecentActivity } from "../features/admin-overview/overview-recent-activity";
import { WorkforceStrip } from "../features/admin-overview/workforce-strip";
import { AgentProposalsCard } from "../features/agent-proposals/agent-proposals-card";
import { useAgentsWorkspaceShellNav } from "../features/agents-workspace/use-agents-workspace-shell-nav";
import { useWorkspaceNavData } from "../features/agents-workspace/use-workspace-nav-data";

export function OverviewPage() {
  const { t } = useTranslation("ai-ui");
  const { secondaryNavOpen } = useShellSecondaryNav();
  const nav = useWorkspaceNavData();
  const moduleLabel = t("menu.engenty");

  const breadcrumbs = useMemo((): PageBreadcrumb[] => {
    if (secondaryNavOpen) {
      return [];
    }
    return [
      {
        compactKept: true,
        label: (
          <span className="truncate font-medium text-foreground">
            {moduleLabel}
          </span>
        ),
        menuLabel: moduleLabel,
      },
    ];
  }, [moduleLabel, secondaryNavOpen]);

  const shellNav = useAgentsWorkspaceShellNav({
    ...nav,
    isLandingPage: true,
    selectedAgentId: "",
  });

  usePageConfig({
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  return (
    <div className="min-h-0 flex-1 overflow-auto p-page">
      <div className="mx-auto max-w-5xl space-y-6">
        <OverviewQuickActions />
        <AgentProposalsCard />
        <WorkforceStrip />
        <CapabilityCards />
        <OverviewRecentActivity />
        <OverviewFooterLinks />
      </div>
    </div>
  );
}
