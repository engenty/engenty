"use client";

import { useCopilotShellOrNull } from "@engenty/app-shell";
import {
  Button,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@engenty/ui-core";
import { MessageSquare, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AiAgentEntry } from "../../lib/admin/ai-runtime-api";
import { usePatchAiAgentChatPrefsMutation } from "../../lib/admin/ai-runtime-queries";
import { isAlwaysActiveAgent } from "../agents-catalog/agents-catalog-state";

function triggerRowClass() {
  return "flex items-center gap-3 py-3";
}

export function AgentChatTriggersCard({
  agent,
  hideActiveRow = false,
  t,
}: {
  agent: AiAgentEntry;
  /** Registry (code) agents: active toggle is shown in the agent detail header. */
  hideActiveRow?: boolean;
  t: (key: string) => string;
}) {
  const navigate = useNavigate();
  const copilotShell = useCopilotShellOrNull();
  const patchMutation = usePatchAiAgentChatPrefsMutation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const ranRunAgentFromHereRef = useRef(false);
  const prevCopilotOpenRef = useRef(copilotShell?.open ?? false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queueMicrotask(() => {
        if (mountedRef.current || !ranRunAgentFromHereRef.current) {
          return;
        }
        ranRunAgentFromHereRef.current = false;
        copilotShell?.setCopilotContext(null);
      });
    };
  }, [copilotShell]);

  useEffect(() => {
    const open = copilotShell?.open ?? false;
    if (prevCopilotOpenRef.current && !open && ranRunAgentFromHereRef.current) {
      ranRunAgentFromHereRef.current = false;
      copilotShell?.setCopilotContext(null);
    }
    prevCopilotOpenRef.current = open;
  }, [copilotShell, copilotShell?.open]);

  const triggers = agent.chat_triggers;
  const isCustom = agent.agent_origin === "custom";
  const alwaysActive = isAlwaysActiveAgent(agent);

  const persist = useCallback(
    async (patch: {
      include_in_chat_picker?: boolean;
      is_active?: boolean;
    }) => {
      if (alwaysActive && patch.is_active === false) {
        return;
      }
      setErrorMessage(null);
      try {
        await patchMutation.mutateAsync({ agentId: agent.id, patch });
      } catch {
        setErrorMessage(t("agents.chatTriggers.saveFailed"));
      }
    },
    [agent.id, alwaysActive, patchMutation, t]
  );

  const onRunAgent = useCallback(() => {
    if (copilotShell) {
      ranRunAgentFromHereRef.current = true;
      copilotShell.setCopilotContext({
        scope: { copilotRequestedAgentId: agent.id },
      });
      copilotShell.setOpen(true);
      return;
    }
    navigate(`/chat?agent=${encodeURIComponent(agent.id)}`);
  }, [agent.id, copilotShell, navigate]);

  return (
    <div className="divide-y divide-border">
      <div className="flex flex-col gap-2 py-3">
        <Button
          className="h-9 w-fit shrink-0 gap-2 self-start font-medium"
          onClick={onRunAgent}
          size="sm"
          type="button"
          variant="outline"
        >
          <Play aria-hidden className="size-3.5 fill-current" />
          {t("agents.chatTriggers.runAgent")}
        </Button>
      </div>

      {isCustom ? (
        <div className={triggerRowClass()}>
          <MessageSquare
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground text-sm">
              {t("agents.chatTriggers.includeInPicker")}
            </p>
            <p className="text-muted-foreground text-xs">
              {t("agents.chatTriggers.includeInPickerHint")}
            </p>
          </div>
          <Switch
            checked={triggers.include_in_chat_picker}
            disabled={patchMutation.isPending || !triggers.is_active}
            onCheckedChange={(checked) =>
              void persist({ include_in_chat_picker: checked })
            }
          />
        </div>
      ) : null}

      {hideActiveRow ? null : (
        <div className={triggerRowClass()}>
          <div aria-hidden className="size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground text-sm">
              {t("agents.chatTriggers.active")}
            </p>
            {alwaysActive ? null : (
              <p className="text-muted-foreground text-xs">
                {t("agents.chatTriggers.activeHint")}
              </p>
            )}
          </div>
          {alwaysActive ? (
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-default">
                  <Switch checked disabled />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-balance">
                {t("agents.chatTriggers.alwaysActiveHint")}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Switch
              checked={triggers.is_active}
              disabled={patchMutation.isPending}
              onCheckedChange={(checked) =>
                void persist({ is_active: checked })
              }
            />
          )}
        </div>
      )}

      {errorMessage ? (
        <p className="py-2 text-destructive text-sm">{errorMessage}</p>
      ) : null}
    </div>
  );
}
