"use client";

// A room's info: its name and purpose, who may see it, the agents in it and
// the people in it — and whether it is paused. This is the whole of what a
// room IS (PLAN-agent-rooms.md): a thread agents participate in. It has no
// skills, no routines and no runs of its own; those belong to the agents,
// on their desks.
import type { AgentEngentyKind } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Switch,
  Textarea,
} from "@engenty/ui-core";
import { PauseCircle, Plus, User, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { AgentFace } from "../../components/agent-face.js";
import { EngentyCluster } from "../../components/engenty-cluster.js";
import type { AgentDeskSwitchAgent } from "./agent-desk-switcher.js";
import {
  ROOM_MAX_AGENTS,
  type RoomAgentMember,
  type RoomState,
  useAddRoomMemberMutation,
  useAddRoomPersonMutation,
  useContinueRoomMutation,
  useRemoveRoomMemberMutation,
  useRemoveRoomPersonMutation,
  useRoomPeopleQuery,
  useUpdateRoomMutation,
} from "./conversation-api.js";

/** A person of the Space, for the add-person picker. */
export interface AgentDeskSpacePerson {
  id: string;
  name: string;
}

function Section({
  action,
  children,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function AgentRoomInfoPanel(props: {
  canManage: boolean;
  members: readonly RoomAgentMember[];
  /** The space's roster, for names and for the add menu. */
  rosterAgents: readonly AgentDeskSwitchAgent[];
  /** The space's people, for the add-person menu. */
  spacePeople: readonly AgentDeskSpacePerson[];
  state: RoomState | null;
  threadId: string;
  title: string;
}) {
  const { t } = useTranslation("ai-ui");
  const peopleQuery = useRoomPeopleQuery(props.threadId);
  const addMember = useAddRoomMemberMutation(props.threadId);
  const removeMember = useRemoveRoomMemberMutation(props.threadId);
  const addPerson = useAddRoomPersonMutation(props.threadId);
  const removePerson = useRemoveRoomPersonMutation(props.threadId);
  const updateRoom = useUpdateRoomMutation(props.threadId);
  const continueRoom = useContinueRoomMutation(props.threadId);
  const purpose = props.state?.purpose ?? "";
  const [titleDraft, setTitleDraft] = useState(props.title);
  const [purposeDraft, setPurposeDraft] = useState(purpose);
  // A rename from elsewhere (another window, the agent) lands in the fields
  // as long as nobody is mid-edit here.
  useEffect(() => setTitleDraft(props.title), [props.title]);
  useEffect(() => setPurposeDraft(purpose), [purpose]);

  const byId = new Map(props.rosterAgents.map((agent) => [agent.id, agent]));
  const memberIds = new Set(props.members.map((member) => member.agent_id));
  const addable = props.rosterAgents.filter(
    (agent) => !memberIds.has(agent.id)
  );
  const people = peopleQuery.data ?? [];
  const personIds = new Set(people.map((person) => person.user_id));
  const addablePeople = props.spacePeople.filter(
    (person) => !personIds.has(person.id)
  );
  const kinds: AgentEngentyKind[] = props.members.map(
    (member) => byId.get(member.agent_id)?.engenty ?? "round"
  );
  const paused = props.state?.paused === true;
  const isPrivate = props.state?.visibility === "private";

  const saveTitle = () => {
    const next = titleDraft.trim();
    if (!next) {
      setTitleDraft(props.title);
      return;
    }
    if (next !== props.title) {
      updateRoom.mutate({ title: next });
    }
  };
  const savePurpose = () => {
    const next = purposeDraft.trim();
    if (next !== purpose) {
      updateRoom.mutate({ purpose: next });
    }
  };

  return (
    <div className="flex flex-col gap-6" data-testid="agent-room-info">
      <div className="flex flex-col items-center gap-3 pt-2">
        <EngentyCluster kinds={kinds} size={72} />
        {props.canManage ? (
          <div className="flex w-full flex-col gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="agent-room-title">
                {t("agentDesk.room.nameLabel")}
              </Label>
              <Input
                autoComplete="off"
                id="agent-room-title"
                maxLength={120}
                onBlur={saveTitle}
                onChange={(event) => setTitleDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
                value={titleDraft}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-room-purpose">
                {t("agentDesk.room.purposeLabel")}
              </Label>
              <Textarea
                id="agent-room-purpose"
                maxLength={500}
                onBlur={savePurpose}
                onChange={(event) => setPurposeDraft(event.target.value)}
                placeholder={t("agentDesk.room.purposePlaceholder")}
                rows={3}
                value={purposeDraft}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="font-semibold text-base">{props.title}</p>
            {purpose ? (
              <p className="text-muted-foreground text-sm">{purpose}</p>
            ) : null}
          </div>
        )}
      </div>

      {paused ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm"
          data-testid="agent-desk-room-paused"
        >
          <PauseCircle className="size-4 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            {t("agentDesk.room.paused", {
              count: props.state?.agentTurns ?? 0,
            })}
          </span>
          <Button
            disabled={continueRoom.isPending}
            onClick={() => continueRoom.mutate()}
            size="sm"
            variant="outline"
          >
            {t("agentDesk.room.continue")}
          </Button>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor="agent-room-private">
            {t("agentDesk.room.private")}
          </Label>
          <p className="text-muted-foreground text-xs">
            {t(
              isPrivate
                ? "agentDesk.room.privateHint"
                : "agentDesk.room.visibleToSpaceHint"
            )}
          </p>
        </div>
        <Switch
          checked={isPrivate}
          data-testid="agent-desk-room-visibility"
          disabled={!props.canManage || updateRoom.isPending}
          id="agent-room-private"
          onCheckedChange={(checked) =>
            updateRoom.mutate({ visibility: checked ? "private" : "space" })
          }
        />
      </div>

      <Section
        action={
          props.canManage &&
          addable.length > 0 &&
          props.members.length < ROOM_MAX_AGENTS ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  disabled={addMember.isPending}
                  size="sm"
                  variant="ghost"
                >
                  <Plus className="mr-1 size-3.5" />
                  {t("agentDesk.room.add")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {addable.map((agent) => (
                  <DropdownMenuItem
                    key={agent.id}
                    onSelect={() => addMember.mutate(agent.id)}
                  >
                    <AgentFace
                      avatarUrl={agent.avatarUrl}
                      className="mr-2 [&_.e-shadow]:hidden"
                      kind={agent.engenty}
                      name={agent.name}
                      size={18}
                    />
                    {agent.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null
        }
        title={t("agentDesk.roomInfo.agents")}
      >
        <ul className="flex flex-col">
          {props.members.map((member) => {
            const agent = byId.get(member.agent_id);
            const name = agent?.name ?? member.agent_id;
            return (
              <li
                className="flex items-center gap-2 py-1.5 text-sm"
                data-testid="agent-room-member"
                key={member.agent_id}
              >
                <AgentFace
                  avatarUrl={agent?.avatarUrl}
                  className="[&_.e-shadow]:hidden"
                  kind={agent?.engenty ?? "round"}
                  name={name}
                  size={24}
                />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {member.role === "host" ? (
                  <span className="text-muted-foreground text-xs">
                    {t("agentDesk.roomInfo.host")}
                  </span>
                ) : props.canManage ? (
                  <button
                    aria-label={t("agentDesk.room.remove", { name })}
                    className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                    disabled={removeMember.isPending}
                    onClick={() => removeMember.mutate(member.agent_id)}
                    type="button"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        action={
          props.canManage && addablePeople.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  disabled={addPerson.isPending}
                  size="sm"
                  variant="ghost"
                >
                  <Plus className="mr-1 size-3.5" />
                  {t("agentDesk.room.addPerson")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {addablePeople.map((person) => (
                  <DropdownMenuItem
                    key={person.id}
                    onSelect={() => addPerson.mutate(person.id)}
                  >
                    <User className="mr-2 size-3.5 text-muted-foreground" />
                    {person.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null
        }
        title={t("agentDesk.room.people")}
      >
        {people.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("agentDesk.roomInfo.nobodyYet")}
          </p>
        ) : (
          <ul className="flex flex-col">
            {people.map((person) => {
              const name = person.name ?? t("agentDesk.room.someone");
              return (
                <li
                  className="flex items-center gap-2 py-1.5 text-sm"
                  data-testid="agent-desk-room-person"
                  key={person.user_id}
                >
                  <span className="grid size-6 place-items-center rounded-full bg-muted">
                    <User className="size-3.5 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  {person.role === "owner" ? (
                    <span className="text-muted-foreground text-xs">
                      {t("agentDesk.roomInfo.owner")}
                    </span>
                  ) : props.canManage ? (
                    <button
                      aria-label={t("agentDesk.room.removePerson", { name })}
                      className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                      disabled={removePerson.isPending}
                      onClick={() => removePerson.mutate(person.user_id)}
                      type="button"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
