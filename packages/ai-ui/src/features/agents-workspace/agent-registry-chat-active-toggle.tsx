"use client";

import {
  Label,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@engenty/ui-core";
import { useCallback, useState } from "react";
import type { AiAgentEntry } from "../../lib/admin/ai-runtime-api";
import { usePatchAiAgentChatPrefsMutation } from "../../lib/admin/ai-runtime-queries";
import { isAlwaysActiveAgent } from "../agents-catalog/agents-catalog-state";

export function AgentRegistryChatActiveToggle({
  agent,
  locked = false,
  t,
}: {
  agent: AiAgentEntry;
  /** When true, switch stays on and cannot be toggled. */
  locked?: boolean;
  t: (key: string) => string;
}) {
  const patchMutation = usePatchAiAgentChatPrefsMutation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const alwaysActive = locked || isAlwaysActiveAgent(agent);
  const triggers = agent.chat_triggers;
  const checked = alwaysActive ? true : triggers.is_active;
  const hint = alwaysActive
    ? t("agents.chatTriggers.alwaysActiveHint")
    : t("agents.chatTriggers.activeHint");

  const persist = useCallback(
    async (is_active: boolean) => {
      if (alwaysActive) {
        return;
      }
      setErrorMessage(null);
      try {
        await patchMutation.mutateAsync({
          agentId: agent.id,
          patch: { is_active },
        });
      } catch {
        setErrorMessage(t("agents.chatTriggers.saveFailed"));
      }
    },
    [agent.id, alwaysActive, patchMutation, t]
  );

  const activeId = `agent-registry-active-${agent.id}`;

  const switchControl = (
    <Switch
      aria-describedby={`${activeId}-hint`}
      checked={checked}
      disabled={alwaysActive || patchMutation.isPending}
      id={activeId}
      onCheckedChange={(next) => void persist(next)}
    />
  );

  return (
    <div className="flex shrink-0 flex-col items-stretch gap-1 sm:items-end">
      <div className="flex items-center gap-3">
        <Label
          className="cursor-default font-medium text-sm"
          htmlFor={activeId}
        >
          {t("agents.chatTriggers.active")}
        </Label>
        {alwaysActive ? (
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              {/* Disabled switches ignore pointer events — wrap for hover. */}
              <span className="inline-flex cursor-default">{switchControl}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-balance" side="bottom">
              {hint}
            </TooltipContent>
          </Tooltip>
        ) : (
          switchControl
        )}
      </div>
      <p className="sr-only" id={`${activeId}-hint`}>
        {hint}
      </p>
      {errorMessage ? (
        <p className="max-w-xs text-right text-destructive text-xs">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
