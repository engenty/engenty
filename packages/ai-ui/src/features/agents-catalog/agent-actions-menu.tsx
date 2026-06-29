// Shared row/card actions for catalog entries: View always; Edit/Delete for
// custom agents; external agents link out to the chatbot admin instead.

import { useTranslation } from "@engenty/i18n/ui";
import { DropdownMenuItem, DropdownMenuSeparator } from "@engenty/ui-core";
import { ExternalLink, Eye, Pencil, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { AiRegisteredAgent } from "../../lib/admin/ai-runtime-types";
import {
  buildAgentDetailPath,
  buildAgentEditPath,
} from "../agents-workspace/agent-workspace-paths";
import {
  CHATBOT_ADMIN_PATH,
  getAgentRole,
  isEditableAgent,
} from "./agents-catalog-state";

export function AgentActionsMenuItems({
  agent,
  onDelete,
}: {
  agent: AiRegisteredAgent;
  onDelete: (agent: AiRegisteredAgent) => void;
}) {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();
  const editable = isEditableAgent(agent);
  const external = getAgentRole(agent) === "external";

  return (
    <>
      <DropdownMenuItem
        onSelect={() => navigate(buildAgentDetailPath(agent.id))}
      >
        <Eye aria-hidden className="mr-2 size-4" />
        {t("agentsCatalog.actions.view")}
      </DropdownMenuItem>
      {editable ? (
        <DropdownMenuItem
          onSelect={() => navigate(buildAgentEditPath(agent.id))}
        >
          <Pencil aria-hidden className="mr-2 size-4" />
          {t("agentsCatalog.actions.edit")}
        </DropdownMenuItem>
      ) : null}
      {external ? (
        <DropdownMenuItem asChild>
          <Link to={CHATBOT_ADMIN_PATH}>
            <ExternalLink aria-hidden className="mr-2 size-4" />
            {t("agentsCatalog.actions.manageInChatbots")}
          </Link>
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
