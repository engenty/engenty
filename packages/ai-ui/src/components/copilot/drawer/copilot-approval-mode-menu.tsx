"use client";

import {
  AGENT_APPROVAL_MODES,
  type AgentApprovalMode,
  DEFAULT_AGENT_APPROVAL_MODES,
  parseAgentApprovalMode,
} from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@engenty/ui-core";
import { ACTIVE_COPILOT_AGENT_ID } from "../../../agent-provider/index.js";
import {
  useAiSettingsQuery,
  useSaveAiSettingsMutation,
} from "../../../lib/admin/ai-settings-queries.js";

function approvalLabelKey(mode: AgentApprovalMode): string {
  return mode === "pass-all"
    ? "limits.approval.passAll"
    : `limits.approval.${mode}`;
}

/**
 * The copilot's approval mode, in its own menu. Bound to the agent: the
 * per-agent entry of the tenant's `agent_approval` decides over the space and
 * tenant mode; unset, the copilot's platform default (`auto`) applies.
 */
export function CopilotApprovalModeMenuSection() {
  const { t } = useTranslation("ai-ui");
  const settingsQuery = useAiSettingsQuery();
  const save = useSaveAiSettingsMutation();
  const settings = settingsQuery.data;
  if (!settings) {
    return null;
  }
  const agentId = ACTIVE_COPILOT_AGENT_ID;
  const current = settings.agent_approval ?? { agents: null, mode: null };
  const value =
    parseAgentApprovalMode(current.agents?.[agentId]) ??
    DEFAULT_AGENT_APPROVAL_MODES[agentId] ??
    "auto";

  return (
    <>
      <DropdownMenuLabel>{t("agentsTab.approvalMode")}</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        onValueChange={(next) => {
          const mode = parseAgentApprovalMode(next);
          if (!mode || mode === value || save.isPending) {
            return;
          }
          save.mutate({
            ...settings,
            agent_approval: {
              agents: { ...(current.agents ?? {}), [agentId]: mode },
              mode: current.mode ?? null,
            },
          });
        }}
        value={value}
      >
        {AGENT_APPROVAL_MODES.map((mode) => (
          <DropdownMenuRadioItem key={mode} value={mode}>
            {t(approvalLabelKey(mode))}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}
