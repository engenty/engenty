"use client";

import { Label, Switch } from "@engenty/ui-core";
import { useCallback, useState } from "react";
import type { AiAgentEntry } from "../../lib/admin/ai-runtime-api";
import { usePatchAiAgentChatPrefsMutation } from "../../lib/admin/ai-runtime-queries";

export function AgentRegistryChatActiveToggle({
  agent,
  t,
}: {
  agent: AiAgentEntry;
  t: (key: string) => string;
}) {
  const patchMutation = usePatchAiAgentChatPrefsMutation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const triggers = agent.chat_triggers;

  const persist = useCallback(
    async (is_active: boolean) => {
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
    [agent.id, patchMutation, t]
  );

  const activeId = `agent-registry-active-${agent.id}`;

  return (
    <div className="flex shrink-0 flex-col items-stretch gap-1 sm:items-end">
      <div className="flex items-center gap-3">
        <Label
          className="cursor-pointer font-medium text-sm"
          htmlFor={activeId}
        >
          {t("agents.chatTriggers.active")}
        </Label>
        <Switch
          aria-describedby={`${activeId}-hint`}
          checked={triggers.is_active}
          disabled={patchMutation.isPending}
          id={activeId}
          onCheckedChange={(checked) => void persist(checked)}
        />
      </div>
      <p className="sr-only" id={`${activeId}-hint`}>
        {t("agents.chatTriggers.activeHint")}
      </p>
      {errorMessage ? (
        <p className="max-w-xs text-right text-destructive text-xs">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
