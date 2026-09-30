// Connect from an agent's settings pane: the connections module's one
// dialog, for the agent's Space — the agent uses that Space's accounts, and
// connecting lands there (the Copilot: the person's own). The Skills tab
// binds skills on a custom engenty, installable from skills.sh first.

import type { AgentDeskAgent } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { useEffect, useMemo, useState } from "react";
import {
  useAiSkillsQuery,
  useUpdateCustomAgentMutation,
} from "../../lib/admin/ai-runtime-queries.js";
import { AgentSkillPackages } from "./agent-skill-packages.js";
import { ExtensionsDialogSlot } from "./extensions-dialog-slot.js";

export type AgentConnectTab = "plugins" | "skills";

export function AgentConnectDialog({
  agent,
  canEditSkills,
  initialDetailsId = null,
  initialTab,
  onOpenChange,
  open,
  spaceId,
}: {
  agent: AgentDeskAgent;
  canEditSkills: boolean;
  /** Open straight on one connector's details (its catalog id). */
  initialDetailsId?: string | null;
  initialTab: AgentConnectTab;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** The Space whose accounts the agent uses; null = the viewer's own. */
  spaceId: string | null;
}) {
  const { t } = useTranslation("ai-ui");
  return (
    <ExtensionsDialogSlot
      // Only a custom agent's preferred-plugin list is editable.
      agentId={canEditSkills ? agent.id : null}
      initialDetailsId={initialDetailsId}
      initialTab={initialTab}
      onOpenChange={onOpenChange}
      open={open}
      owner={spaceId ? { spaceId } : "me"}
      renderSkills={({ detailsId, onClose, setDetailsId }) =>
        canEditSkills ? (
          <AgentSkillsEditor
            agentId={agent.id}
            detailsId={detailsId}
            onDetailsIdChange={setDetailsId}
            onSaved={onClose}
            skillIds={agent.skills.map((chip) => chip.id)}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("agentDesk.manage.connectSkillsReadOnly")}
          </p>
        )
      }
    />
  );
}

function AgentSkillsEditor({
  agentId,
  detailsId,
  onDetailsIdChange,
  onSaved,
  skillIds,
}: {
  agentId: string;
  detailsId: string | null;
  onDetailsIdChange: (id: string | null) => void;
  onSaved: () => void;
  skillIds: string[];
}) {
  const { t } = useTranslation("ai-ui");
  const update = useUpdateCustomAgentMutation();
  const skillsQuery = useAiSkillsQuery();
  const [draft, setDraft] = useState(skillIds);
  const existingSkillNames = useMemo(
    () => new Set((skillsQuery.data?.skills ?? []).map((skill) => skill.name)),
    [skillsQuery.data?.skills]
  );

  useEffect(() => {
    setDraft(skillIds);
    update.reset();
    // Seed once per opening. The parent only mounts this editor while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  return (
    <div className="flex flex-col gap-3">
      <AgentSkillPackages
        detailsId={detailsId}
        existingSkillNames={existingSkillNames}
        onChange={setDraft}
        onDetailsIdChange={onDetailsIdChange}
        onInstalled={(skillName) =>
          setDraft((current) =>
            current.includes(skillName) ? current : [...current, skillName]
          )
        }
        skills={skillsQuery.data?.skills ?? []}
        value={draft}
      />
      {update.isError ? (
        <p className="text-destructive text-xs" role="alert">
          {update.error instanceof Error
            ? update.error.message
            : t("agentDesk.manage.saveFailed")}
        </p>
      ) : null}
      <Button
        disabled={update.isPending}
        onClick={() =>
          update.mutate(
            { agentId, patch: { skillIds: draft } },
            { onSuccess: onSaved }
          )
        }
        type="button"
      >
        {t("agentDesk.manage.skillsSave")}
      </Button>
    </div>
  );
}
