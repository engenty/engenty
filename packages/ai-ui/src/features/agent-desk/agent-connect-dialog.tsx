// Connect from an agent's settings pane: plugins (accounts, MCP) and skills
// in one modal. Plugins are the shared marketplace panel; skills bind on
// a custom engenty and can be installed from skills.sh first.

import type { AgentDeskAgent } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  useAiSkillsQuery,
  useUpdateCustomAgentMutation,
} from "../../lib/admin/ai-runtime-queries.js";
import { AgentConnectionsPanel } from "../agents-workspace/agent-connections-panel.js";
import { AgentSkillPackages } from "./agent-skill-packages.js";

export type AgentConnectTab = "plugins" | "skills";

export function AgentConnectDialog({
  agent,
  canEditSkills,
  initialTab,
  onOpenChange,
  open,
}: {
  agent: AgentDeskAgent;
  canEditSkills: boolean;
  initialTab: AgentConnectTab;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useTranslation("ai-ui");
  const [tab, setTab] = useState<AgentConnectTab>(initialTab);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDetailsId(null);
      return;
    }
    setTab(initialTab);
  }, [initialTab, open]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className={cn(
          "grid h-[min(85vh,42rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-3xl",
          detailsId && "gap-3"
        )}
      >
        <DialogHeader>
          {detailsId ? (
            <Button
              aria-label={t("agentDesk.manage.connectBack")}
              className="-ml-2"
              onClick={() => setDetailsId(null)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <ArrowLeft />
            </Button>
          ) : null}
          <DialogTitle className={detailsId ? "sr-only" : undefined}>
            {t("agentDesk.manage.connectTitle")}
          </DialogTitle>
        </DialogHeader>
        <Tabs
          className="flex h-full min-h-0 flex-col"
          onValueChange={(value) => setTab(value as AgentConnectTab)}
          value={tab}
        >
          {detailsId ? null : (
            <TabsList className="w-full">
              <TabsTrigger className="flex-1" value="plugins">
                {t("agentDesk.manage.connectPlugins")}
              </TabsTrigger>
              <TabsTrigger className="flex-1" value="skills">
                {t("agentDesk.skills")}
              </TabsTrigger>
            </TabsList>
          )}
          <TabsContent
            className={cn(
              "min-h-0 flex-1 overflow-y-auto pr-1",
              detailsId ? "mt-0" : "mt-3"
            )}
            value="plugins"
          >
            {open && tab === "plugins" ? (
              <AgentConnectionsPanel
                agentId={agent.id}
                detailsId={detailsId}
                onDetailsIdChange={setDetailsId}
              />
            ) : null}
          </TabsContent>
          <TabsContent
            className={cn(
              "min-h-0 flex-1 overflow-y-auto pr-1",
              detailsId ? "mt-0" : "mt-3"
            )}
            value="skills"
          >
            {open && tab === "skills" ? (
              canEditSkills ? (
                <AgentSkillsEditor
                  agentId={agent.id}
                  detailsId={tab === "skills" ? detailsId : null}
                  onDetailsIdChange={setDetailsId}
                  onSaved={() => onOpenChange(false)}
                  skillIds={agent.skills.map((chip) => chip.id)}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  {t("agentDesk.manage.connectSkillsReadOnly")}
                </p>
              )
            ) : null}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
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
