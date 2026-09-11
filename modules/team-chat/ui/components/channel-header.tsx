// The channel head above the stream: icon badge + name + topic, and a meta
// line with the member avatar stack, member/agent counts, a quiet type chip
// and — when the channel is bound to a project — a clickable project chip.
// Primary actions (pins, details, ⋯) live in the shell topbar, not here.
import { requestApiJson } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { queryOptions, useQuery } from "@engenty/query-client";
import {
  AvatarStack,
  type AvatarStackProfile,
  DetailPageHeader,
} from "@engenty/ui-core";
import { FolderKanban, Hash, Lock, Users } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { ConversationListItem } from "../api.js";
import { type UsersById, userLabel } from "../lib/format.js";
import { teamChatKeys, useMembersQuery } from "../queries.js";

/** Resolves the bound project's display name for the chip (best effort). */
function useProjectNameQuery(projectId: string | null) {
  return useQuery(
    queryOptions({
      enabled: Boolean(projectId),
      queryFn: async () => {
        const project = await requestApiJson<{
          name?: string;
          title?: string;
        }>("/api/tools/projects_get/invoke", {
          method: "POST",
          body: { input: { id: projectId } },
        }).catch(() => null);
        return project?.name ?? project?.title ?? null;
      },
      queryKey: [...teamChatKeys.all, "project-name", projectId ?? "none"],
      staleTime: 5 * 60 * 1000,
    })
  );
}

export function ChannelHeader({
  conversation,
  displayName,
  users,
}: {
  conversation: ConversationListItem;
  displayName: string;
  users: UsersById;
}) {
  const { t } = useTranslation("team-chat");
  const isChannel =
    conversation.type === "public_channel" ||
    conversation.type === "private_channel";
  const isPrivate = conversation.type === "private_channel";
  const HeaderIcon = isPrivate ? Lock : isChannel ? Hash : Users;
  const projectNameQuery = useProjectNameQuery(conversation.project_id);

  // The list RPC only embeds member principals for DMs; channels come with an
  // empty array, so resolve the roster via the members operation instead.
  const membersQuery = useMembersQuery(conversation.id);
  const members: { principal_id: string; principal_type: string }[] =
    membersQuery.data?.length ? membersQuery.data : conversation.members;
  const humanMembers = members.filter(
    (member) => member.principal_type === "user"
  );
  const agentMembers = members.filter(
    (member) => member.principal_type === "agent"
  );
  const profiles = useMemo<AvatarStackProfile[]>(
    () => [
      ...humanMembers.map((member) => ({
        full_name: userLabel(
          users.get(member.principal_id),
          member.principal_id.slice(0, 8)
        ),
        id: member.principal_id,
      })),
      ...agentMembers.map((member) => ({
        full_name: member.principal_id,
        id: `agent:${member.principal_id}`,
      })),
    ],
    [humanMembers, agentMembers, users]
  );

  const meta = (
    <div className="flex flex-col gap-1.5">
      {conversation.topic ? (
        <p className="text-muted-foreground text-sm">{conversation.topic}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <AvatarStack max={5} profiles={profiles} size="sm" />
        <span className="text-muted-foreground text-xs">
          {t("conversation.members", { count: humanMembers.length })}
          {agentMembers.length > 0
            ? ` · ${t("conversation.agents", { count: agentMembers.length })}`
            : ""}
        </span>
        {isChannel ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-border-soft px-2 py-0.5 text-[11px] text-muted-foreground">
            {isPrivate ? <Lock className="size-3" /> : null}
            {isPrivate
              ? t("conversation.typePrivate")
              : t("conversation.typePublic")}
          </span>
        ) : null}
        {conversation.project_id ? (
          <Link
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-[11px] text-primary transition-colors hover:bg-primary/15"
            to={`/mdl/projects/${conversation.project_id}`}
          >
            <FolderKanban className="size-3" />
            {projectNameQuery.data ?? t("conversation.projectLink")}
          </Link>
        ) : null}
      </div>
    </div>
  );

  return (
    <DetailPageHeader
      containerClassName="px-4 sm:px-6"
      description={meta}
      media={
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <HeaderIcon className="size-5" />
        </span>
      }
      sticky={false}
      title={displayName}
      titleClassName="text-xl"
    />
  );
}
