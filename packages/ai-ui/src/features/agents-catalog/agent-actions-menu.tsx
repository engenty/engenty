// Shared row/card actions for catalog entries: View always; Edit when the agent
// is custom (form) or otherwise has an instructions surface; Reset clears
// instruction overrides; Delete for custom agents; external agents link out.

import { useTranslation } from "@engenty/i18n/ui";
import { DropdownMenuItem, DropdownMenuSeparator } from "@engenty/ui-core";
import { ExternalLink, Eye, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { AiRegisteredAgent } from "../../lib/admin/ai-runtime-types";
import {
  buildAgentDetailPath,
  buildAgentEditPath,
  buildAgentInstructionsPath,
} from "../agents-workspace/agent-workspace-paths";
import {
  CHATBOT_ADMIN_PATH,
  canResetAgentInstructions,
  getAgentRole,
  isEditableAgent,
} from "./agents-catalog-state";

export function AgentActionsMenuItems({
  agent,
  onDelete,
  onReset,
}: {
  agent: AiRegisteredAgent;
  onDelete: (agent: AiRegisteredAgent) => void;
  onReset: (agent: AiRegisteredAgent) => void;
}) {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();
  const editable = isEditableAgent(agent);
  const external = getAgentRole(agent) === "external";
  const canReset = canResetAgentInstructions(agent);
  // Custom agents edit via the form; everyone else with instructions opens the
  // Instructions tab (seed files + overrides).
  const canEdit = editable || !external;

  return (
    <>
      <DropdownMenuItem
        onSelect={() => navigate(buildAgentDetailPath(agent.id))}
      >
        <Eye aria-hidden className="mr-2 size-4" />
        {t("agentsCatalog.actions.view")}
      </DropdownMenuItem>
      {canEdit ? (
        <DropdownMenuItem
          onSelect={() =>
            navigate(
              editable
                ? buildAgentEditPath(agent.id)
                : buildAgentInstructionsPath(agent.id)
            )
          }
        >
          <Pencil aria-hidden className="mr-2 size-4" />
          {t("agentsCatalog.actions.edit")}
        </DropdownMenuItem>
      ) : null}
      {external ? (
        <DropdownMenuItem
          onSelect={() => {
            navigate(CHATBOT_ADMIN_PATH);
          }}
        >
          <ExternalLink aria-hidden className="mr-2 size-4" />
          {t("agentsCatalog.actions.manageInChatbots")}
        </DropdownMenuItem>
      ) : null}
      {canReset ? (
        <DropdownMenuItem onSelect={() => onReset(agent)}>
          <RotateCcw aria-hidden className="mr-2 size-4" />
          {t("agentsCatalog.actions.reset")}
        </DropdownMenuItem>
      ) : null}
      {editable ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => onDelete(agent)}
          >
            <Trash2 aria-hidden className="mr-2 size-4" />
            {t("agentsCatalog.actions.delete")}
          </DropdownMenuItem>
        </>
      ) : null}
    </>
  );
}
