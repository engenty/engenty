/**
 * The Agents "+" in space chrome (and the matching page buttons): a two-item
 * menu — a new agent through the hire wizard, or a new group chat (a room of
 * two to six agents, opened on the host's desk). The heading itself still
 * navigates to the roster.
 */
import { AgentDeskNewRoomDialog } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { Bot, Plus, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { spaceRoomPath } from "@/lib/space-routes";
import { useSpaceRosterAgents } from "@/lib/use-space-roster-agents";
import { SpaceAgentHireWizard } from "./SpaceAgentHireWizard";
import { pickRandomHireEngenty } from "./space-agent-hire";
import { SpaceSectionAddMenu } from "./space-section-heading";

export function SpaceAgentHireTrigger({
  disabled = false,
  reportsTo,
  spaceId,
  spaceKey,
  variant,
}: {
  disabled?: boolean;
  /** Preset manager for the hire — the coordinator whose row offered it. */
  reportsTo?: string;
  spaceId: string | null;
  spaceKey: string;
  variant: "section" | "button" | "outline";
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { agents: rosterAgents } = useSpaceRosterAgents(spaceId);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const unavailable = disabled || !spaceId;

  const agentLabel = t("spaces.agents.newAgent", {
    defaultValue: "New agent",
  });
  const roomLabel = t("spaces.agents.newRoom", {
    defaultValue: "New group chat",
  });
  const addLabel = t("spaces.agents.addAction", {
    defaultValue: "Add an agent",
  });

  const openWizard = () => {
    if (!spaceId) {
      return;
    }
    setWizardOpen(true);
  };
  const openRoom = () => {
    if (!spaceId) {
      return;
    }
    setRoomOpen(true);
  };

  return (
    <>
      {variant === "section" ? (
        <SpaceSectionAddMenu
          disabled={unavailable}
          items={[
            {
              icon: <Bot className="size-4" />,
              id: "agent",
              label: agentLabel,
              onSelect: openWizard,
            },
            {
              icon: <Users className="size-4" />,
              id: "room",
              label: roomLabel,
              onSelect: openRoom,
            },
          ]}
          label={addLabel}
        />
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              disabled={unavailable}
              size="sm"
              variant={variant === "outline" ? "outline" : "default"}
            >
              <Plus className="mr-1.5 size-3.5" />
              {variant === "outline"
                ? addLabel
                : t("spaces.agents.hire", { defaultValue: "Hire an agent" })}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem onSelect={openWizard}>
              <Bot />
              {agentLabel}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={openRoom}>
              <Users />
              {roomLabel}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {spaceId ? (
        <SpaceAgentHireWizard
          {...(reportsTo
            ? {
                initial: {
                  description: "",
                  engenty: pickRandomHireEngenty(),
                  name: "",
                  reportsTo,
                  template: null,
                },
              }
            : {})}
          onOpenChange={setWizardOpen}
          open={wizardOpen}
          spaceId={spaceId}
          spaceKey={spaceKey}
        />
      ) : null}
      {spaceId && roomOpen ? (
        <AgentDeskNewRoomDialog
          onCreated={(threadId) => navigate(spaceRoomPath(spaceKey, threadId))}
          onOpenChange={setRoomOpen}
          open
          rosterAgents={rosterAgents}
          spaceId={spaceId}
        />
      ) : null}
    </>
  );
}
