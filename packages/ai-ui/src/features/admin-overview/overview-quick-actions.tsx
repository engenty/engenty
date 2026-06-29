// Overview quick actions + footer links (ui-6 §1): create entry points for
// agents/skills/tools and links to AI settings + the operations cockpit.

import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { Download, ExternalLink, Plus, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAiSkillsQuery } from "../../lib/admin/ai-runtime-queries";
import {
  buildAgentCreatePath,
  buildSkillDetailPath,
  buildToolCreatePath,
} from "../agents-workspace/agent-workspace-paths";
import { ENGENTY_OPEN_SKILL_DETAIL_EDIT } from "../agents-workspace/workspace-navigation-state";
import { CreateSkillModal } from "../skills/create-skill-modal";
import { InstallSkillModal } from "../skills/install-skill-modal";

const OPERATIONS_COCKPIT_PATH = "/mdl/tasks/operations";

export function OverviewQuickActions() {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();
  const skillsQuery = useAiSkillsQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);

  const existingSkillNames = useMemo(
    () => new Set((skillsQuery.data?.skills ?? []).map((skill) => skill.name)),
    [skillsQuery.data?.skills]
  );

  return (
    <section aria-label={t("overview.quickActions.title")}>
      <CreateSkillModal
        existingSkillNames={existingSkillNames}
        onCreated={(skillName) => {
          setCreateOpen(false);
          navigate(buildSkillDetailPath(skillName, { file: "SKILL.md" }), {
            state: { [ENGENTY_OPEN_SKILL_DETAIL_EDIT]: true },
          });
        }}
        onOpenChange={setCreateOpen}
        open={createOpen}
      />
      <InstallSkillModal
        existingSkillNames={existingSkillNames}
        onInstalled={(skillName) =>
          navigate(buildSkillDetailPath(skillName, { file: "SKILL.md" }))
        }
        onOpenChange={setInstallOpen}
        open={installOpen}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild className="gap-1.5" size="sm">
          <Link to={buildAgentCreatePath()}>
            <Plus className="size-4" />
            {t("overview.quickActions.newAgent")}
          </Link>
        </Button>
        <Button
          className="gap-1.5"
          onClick={() => setCreateOpen(true)}
          size="sm"
          variant="outline"
        >
          <Plus className="size-4" />
          {t("overview.quickActions.newSkill")}
        </Button>
        <Button
          className="gap-1.5"
          onClick={() => setInstallOpen(true)}
          size="sm"
          variant="outline"
        >
          <Download className="size-4" />
          {t("overview.quickActions.installSkill")}
        </Button>
        <Button asChild className="gap-1.5" size="sm" variant="outline">
          <Link to={buildToolCreatePath()}>
            <Plus className="size-4" />
            {t("overview.quickActions.newTool")}
          </Link>
        </Button>
      </div>
    </section>
  );
}

export function OverviewFooterLinks() {
  const { t } = useTranslation("ai-ui");
  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-4">
      <Button asChild className="gap-1.5" size="sm" variant="outline">
        <Link to="/settings/ai">
          <Settings2 className="size-4" />
          {t("overview.links.aiSettings")}
        </Link>
      </Button>
      <Button asChild className="gap-1.5" size="sm" variant="outline">
        <Link to={OPERATIONS_COCKPIT_PATH}>
          <ExternalLink className="size-4" />
          {t("overview.links.operations")}
        </Link>
      </Button>
    </div>
  );
}
