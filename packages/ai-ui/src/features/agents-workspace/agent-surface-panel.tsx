/**
 * Where this Engenty may act besides its desk — the two per-agent surface
 * flags on the registry row.
 *
 * Screen tools: whether it may drive the person's screen from a chat surface
 * (navigate, open a dialog, focus a field, guided tour, browser-use). `auto`
 * follows position: the Space's coordinator has them, the rest of the team
 * does not. A routine or channel turn never carries them, whatever is set.
 *
 * Remote: whether a channel (Slack, Telegram) may reach it as ITSELF — a
 * bound channel or an `@handle` routes the turn to this Engenty, assembled
 * with its own tools, memory and `/home`. Off by default.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
} from "@engenty/ui-core";
import { useEffect, useState } from "react";
import {
  customAgentDetailOptions,
  useUpdateCustomAgentMutation,
} from "../../lib/admin/ai-runtime-queries";
import type { CustomAgentConfig } from "../../lib/admin/ai-runtime-types";

type UiToolsChoice = NonNullable<CustomAgentConfig["uiTools"]>;

const UI_TOOLS_CHOICES: readonly UiToolsChoice[] = ["auto", "on", "off"];

/** What `@handle` resolves to when the row names none: the id's last segment. */
export function defaultRemoteHandle(agentId: string): string {
  const tail = agentId.split(".").at(-1) ?? agentId;
  return tail
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function AgentSurfacePanel({ agentId }: { agentId: string }) {
  const { t } = useTranslation("ai-ui");
  const detail = useQuery(customAgentDetailOptions(agentId));
  const update = useUpdateCustomAgentMutation();
  const agent = detail.data?.agent;
  const [handleDraft, setHandleDraft] = useState("");

  useEffect(() => {
    setHandleDraft(agent?.remoteHandle ?? "");
  }, [agent?.remoteHandle]);

  if (detail.isPending) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  if (!agent) {
    return (
      <p className="p-4 text-muted-foreground text-sm">
        {t("agentSurface.unavailable")}
      </p>
    );
  }

  const uiTools = agent.uiTools ?? "auto";
  const remoteEnabled = agent.remoteEnabled === true;
  const handleValid = handleDraft === "" || HANDLE_PATTERN.test(handleDraft);
  const busy = update.isPending;

  const saveHandle = () => {
    const next = handleDraft.trim();
    if (!handleValid || next === (agent.remoteHandle ?? "")) {
      return;
    }
    update.mutate({
      agentId,
      patch: { remoteHandle: next === "" ? null : next },
    });
  };

  return (
    <div className="divide-y divide-border-soft">
      <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Label htmlFor={`${agentId}-ui-tools`}>
            {t("agentSurface.uiTools.label")}
          </Label>
          <p className="text-muted-foreground text-xs">
            {t("agentSurface.uiTools.hint")}
          </p>
        </div>
        <Select
          disabled={busy}
          onValueChange={(value) =>
            update.mutate({
              agentId,
              patch: { uiTools: value as UiToolsChoice },
            })
          }
          value={uiTools}
        >
          <SelectTrigger className="w-full sm:w-56" id={`${agentId}-ui-tools`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UI_TOOLS_CHOICES.map((choice) => (
              <SelectItem key={choice} value={choice}>
                {t(`agentSurface.uiTools.${choice}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor={`${agentId}-remote`}>
              {t("agentSurface.remote.label")}
            </Label>
            <p className="text-muted-foreground text-xs">
              {t("agentSurface.remote.hint")}
            </p>
          </div>
          <Switch
            checked={remoteEnabled}
            disabled={busy}
            id={`${agentId}-remote`}
            onCheckedChange={(checked) =>
              update.mutate({ agentId, patch: { remoteEnabled: checked } })
            }
          />
        </div>
        {remoteEnabled ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${agentId}-remote-handle`}>
              {t("agentSurface.remote.handleLabel")}
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">@</span>
              <Input
                aria-invalid={!handleValid}
                className="max-w-xs"
                disabled={busy}
                id={`${agentId}-remote-handle`}
                onBlur={saveHandle}
                onChange={(event) =>
                  setHandleDraft(event.target.value.toLowerCase())
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
                placeholder={defaultRemoteHandle(agentId)}
                value={handleDraft}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              {handleValid
                ? t("agentSurface.remote.handleHint", {
                    handle: handleDraft || defaultRemoteHandle(agentId),
                  })
                : t("agentSurface.remote.handleInvalid")}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
