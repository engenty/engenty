"use client";

// A new room: one to six agents (Grok Bot's cap, PLAN-agent-rooms.md D9), a
// name, what it is for, and who may see it. From a desk the desk's agent
// hosts it and the person picks the rest; from the sidebar there is no desk,
// so the first agent picked hosts. The room opens on the host's desk once it
// exists.

import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Engenty,
  Input,
  Label,
  Switch,
} from "@engenty/ui-core";
import { useEffect, useState } from "react";
import type { AgentDeskSwitchAgent } from "./agent-desk-switcher.js";
import {
  ROOM_MAX_AGENTS,
  ROOM_MIN_AGENTS,
  type RoomVisibility,
  useCreateRoomMutation,
} from "./conversation-api.js";

export function AgentDeskNewRoomDialog(props: {
  /** The desk this opens from; absent, the first agent picked hosts. */
  host?: AgentDeskSwitchAgent;
  onCreated: (threadId: string, hostAgentId: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  rosterAgents: readonly AgentDeskSwitchAgent[];
  spaceId: string;
}) {
  const { t } = useTranslation("ai-ui");
  const create = useCreateRoomMutation();
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [visibility, setVisibility] = useState<RoomVisibility>("space");
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    if (props.open) {
      setTitle("");
      setPurpose("");
      setVisibility("space");
      setPicked([]);
      create.reset();
    }
  }, [props.open]);
  const host = props.host ?? null;
  const others = host
    ? props.rosterAgents.filter((agent) => agent.id !== host.id)
    : props.rosterAgents;
  const seats = host ? 1 : 0;
  const full = picked.length + seats >= ROOM_MAX_AGENTS;
  const canSubmit =
    title.trim().length > 0 &&
    picked.length + seats >= ROOM_MIN_AGENTS &&
    !create.isPending;

  const submit = async () => {
    if (!canSubmit) {
      return;
    }
    // The first id hosts (api/room-routes.ts): the desk's agent, or the
    // first one picked.
    const agentIds = host ? [host.id, ...picked] : picked;
    const result = await create.mutateAsync({
      agentIds,
      ...(purpose.trim() ? { purpose: purpose.trim() } : {}),
      spaceId: props.spaceId,
      title: title.trim(),
      visibility,
    });
    props.onOpenChange(false);
    props.onCreated(result.session.id, agentIds[0] as string);
  };

  return (
    <Dialog onOpenChange={props.onOpenChange} open={props.open}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{t("agentDesk.room.newTitle")}</DialogTitle>
        <DialogDescription>
          {host
            ? t("agentDesk.room.newDescription", { name: host.name })
            : t("agentDesk.room.newDescriptionPick")}
        </DialogDescription>
        <div className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="agent-desk-room-title">
              {t("agentDesk.room.nameLabel")}
            </Label>
            <Input
              autoComplete="off"
              id="agent-desk-room-title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("agentDesk.room.namePlaceholder")}
              value={title}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-desk-room-purpose">
              {t("agentDesk.room.purposeLabel")}
            </Label>
            <Input
              autoComplete="off"
              id="agent-desk-room-purpose"
              maxLength={500}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder={t("agentDesk.room.purposePlaceholder")}
              value={purpose}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label htmlFor="agent-desk-room-visibility">
                {t("agentDesk.room.visibleToSpace")}
              </Label>
              <p className="text-muted-foreground text-xs">
                {visibility === "space"
                  ? t("agentDesk.room.visibleToSpaceHint")
                  : t("agentDesk.room.privateHint")}
              </p>
            </div>
            <Switch
              checked={visibility === "space"}
              id="agent-desk-room-visibility"
              onCheckedChange={(checked) =>
                setVisibility(checked ? "space" : "private")
              }
            />
          </div>
          <div className="space-y-1.5">
            <p className="font-medium text-sm">
              {t("agentDesk.room.pickMembers", { max: ROOM_MAX_AGENTS })}
            </p>
            {others.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t("agentDesk.room.nobodyElse")}
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {others.map((agent) => {
                  const checked = picked.includes(agent.id);
                  return (
                    <li className="flex items-center gap-2" key={agent.id}>
                      <Checkbox
                        checked={checked}
                        disabled={!checked && full}
                        id={`agent-desk-room-${agent.id}`}
                        onCheckedChange={(next) =>
                          setPicked((current) =>
                            next === true
                              ? [...current, agent.id]
                              : current.filter((id) => id !== agent.id)
                          )
                        }
                      />
                      <Label
                        className="flex items-center gap-1.5 font-normal"
                        htmlFor={`agent-desk-room-${agent.id}`}
                      >
                        <Engenty
                          className="[&_.e-shadow]:hidden"
                          kind={agent.engenty}
                          size={18}
                        />
                        {agent.name}
                      </Label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {create.error ? (
            <p className="text-destructive text-sm">
              {t("agentDesk.room.createFailed")}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={() => props.onOpenChange(false)} variant="ghost">
            {t("agentDesk.room.cancel")}
          </Button>
          <Button disabled={!canSubmit} onClick={() => void submit()}>
            {t("agentDesk.room.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
