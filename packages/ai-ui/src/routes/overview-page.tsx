// Overview dashboard at /admin/engenty (ui-6 §1). Composition only — pieces
// live in features/admin-overview/. Plan-briefing layout: hub cards, then
// workforce + recent activity.

import { useShellSecondaryNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { type PageBreadcrumb, usePageConfig } from "@engenty/ui-plugin-sdk";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OverviewHubCards } from "../features/admin-overview/overview-hub-cards";
import { OverviewFooterLinks } from "../features/admin-overview/overview-quick-actions";
import { OverviewRecentActivity } from "../features/admin-overview/overview-recent-activity";
import { WorkforceStrip } from "../features/admin-overview/workforce-strip";
import { AgentProposalsCard } from "../features/agent-proposals/agent-proposals-card";
import {
  buildSkillDetailPath,
  buildWorkflowDetailPath,
} from "../features/agents-workspace/agent-workspace-paths";
import { EngentyCanvasPageChrome } from "../features/agents-workspace/engenty-catalog-page-chrome";
import { useAgentsWorkspaceShellNav } from "../features/agents-workspace/use-agents-workspace-shell-nav";
import { useWorkspaceNavData } from "../features/agents-workspace/use-workspace-nav-data";
import { ENGENTY_OPEN_SKILL_DETAIL_EDIT } from "../features/agents-workspace/workspace-navigation-state";
import { CreateSkillModal } from "../features/skills/create-skill-modal";
import { InstallSkillModal } from "../features/skills/install-skill-modal";
import { CreateWorkflowDialog } from "../features/workflow-canvas/create-workflow-dialog";
import { useAiSkillsQuery } from "../lib/admin/ai-runtime-queries";

export function OverviewPage() {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();
  const { secondaryNavOpen } = useShellSecondaryNav();
  const nav = useWorkspaceNavData();
  const moduleLabel = t("menu.engenty");
  const skillsQuery = useAiSkillsQuery();
  const [createSkillOpen, setCreateSkillOpen] = useState(false);
  const [installSkillOpen, setInstallSkillOpen] = useState(false);
  const [createFlowOpen, setCreateFlowOpen] = useState(false);

  const existingSkillNames = useMemo(
    () => new Set((skillsQuery.data?.skills ?? []).map((skill) => skill.name)),
    [skillsQuery.data?.skills]
  );

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
    actions: (
      <Button
        className="gap-1.5"
        onClick={() => setInstallSkillOpen(true)}
        size="sm"
        variant="outline"
      >
        <Download className="size-4" />
        {t("overview.quickActions.installSkill")}
      </Button>
    ),
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarOverlap: true,
  });

  return (
    <EngentyCanvasPageChrome
      description={t("copilotAdminLinks.description")}
      title={t("copilotAdminLinks.title")}
    >
      <CreateSkillModal
        existingSkillNames={existingSkillNames}
        onCreated={(skillName) => {
          setCreateSkillOpen(false);
          navigate(buildSkillDetailPath(skillName, { file: "SKILL.md" }), {
            state: { [ENGENTY_OPEN_SKILL_DETAIL_EDIT]: true },
          });
        }}
        onOpenChange={setCreateSkillOpen}
        open={createSkillOpen}
      />
      <InstallSkillModal
        existingSkillNames={existingSkillNames}
        onInstalled={(skillName) =>
          navigate(buildSkillDetailPath(skillName, { file: "SKILL.md" }))
        }
        onOpenChange={setInstallSkillOpen}
        open={installSkillOpen}
      />

      <CreateWorkflowDialog
        onCreated={(graphId) => navigate(buildWorkflowDetailPath(graphId))}
        onOpenChange={setCreateFlowOpen}
        open={createFlowOpen}
      />

      <div className="space-y-8">
        <OverviewHubCards
          onCreateFlow={() => setCreateFlowOpen(true)}
          onCreateSkill={() => setCreateSkillOpen(true)}
        />
        <AgentProposalsCard />
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
          <WorkforceStrip />
          <OverviewRecentActivity />
        </div>
        <OverviewFooterLinks />
      </div>
    </EngentyCanvasPageChrome>
  );
}
