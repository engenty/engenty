// Channel details: members (users + agents) with invite/remove, and the
// project-activity toggle. Lives behind the info button in the header.
import { requestApiJson } from "@engenty/api-client";
import { useCoreAuthSession } from "@engenty/auth-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQueryClient } from "@engenty/query-client";
import {
  Avatar,
  AvatarFallback,
  Button,
  Checkbox,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
} from "@engenty/ui-core";
import { Bot, Info, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { ConversationListItem, MemberPrincipal } from "../api.js";
import {
  isServiceIdentity,
  useAgentCandidatesQuery,
} from "../hooks/use-mention-candidates.js";
import { authorInitials, type UsersById, userLabel } from "../lib/format.js";
import {
  teamChatKeys,
  useInviteMembersMutation,
  useMembersQuery,
  useTenantUsersQuery,
} from "../queries.js";

async function invokeTool<T>(operationId: string, input: unknown): Promise<T> {
  return requestApiJson<T>(`/api/tools/${operationId}/invoke`, {
    method: "POST",
    body: { input },
  });
}

export function ChannelDetailsPopover({
  conversation,
  users,
}: {
  conversation: ConversationListItem;
  users: UsersById;
}) {
  const { t } = useTranslation("team-chat");
  const queryClient = useQueryClient();
  const { session } = useCoreAuthSession();
  const currentUserId = session?.user?.id ?? null;
  const membersQuery = useMembersQuery(conversation.id);
  const usersQuery = useTenantUsersQuery();
  const agentsQuery = useAgentCandidatesQuery();
  const invite = useInviteMembersMutation();
  const [filter, setFilter] = useState("");

  const kick = useMutation({
    mutationFn: (member: MemberPrincipal) =>
      invokeTool("team_chat_conversations_kick", {
        channel: conversation.id,
        member,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: teamChatKeys.all }),
  });

  const setActivity = useMutation({
    mutationFn: (enabled: boolean) =>
      invokeTool("team_chat_conversations_update_settings", {
        channel: conversation.id,
        settings: { activity: { enabled } },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: teamChatKeys.all }),
  });

  const members = membersQuery.data ?? [];
  const memberKey = (principalType: string, principalId: string) =>
    `${principalType}:${principalId.toLowerCase()}`;
  const memberSet = useMemo(
    () =>
      new Set(
        members.map((member) =>
          memberKey(member.principal_type, member.principal_id)
        )
      ),
    [members]
  );

  const candidates = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const userCandidates = (usersQuery.data ?? [])
      .filter((user) => !isServiceIdentity(user.email))
      .filter((user) => !memberSet.has(memberKey("user", user.id)))
      .map((user) => ({
        id: user.id,
        kind: "user" as const,
        label: user.display_name || user.email || user.id,
      }));
    const agentCandidates = (agentsQuery.data ?? [])
      .filter((agent) => !memberSet.has(memberKey("agent", agent.id)))
      .map((agent) => ({
        id: agent.id,
        kind: "agent" as const,
        label: agent.name || agent.id,
      }));
    return [...userCandidates, ...agentCandidates]
      .filter(
        (candidate) => !needle || candidate.label.toLowerCase().includes(needle)
      )
      .slice(0, 6);
  }, [usersQuery.data, agentsQuery.data, memberSet, filter]);

  const activityEnabled =
    (conversation.settings as { activity?: { enabled?: boolean } }).activity
      ?.enabled !== false;

  const onError = (error: unknown) =>
    toast.error(t("toasts.actionFailed", { error: String(error) }));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("details.open")}
          className="ml-auto"
          size="icon-sm"
          variant="ghost"
        >
          <Info className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="font-semibold text-sm">{t("details.members")}</h3>
            <div className="mt-1.5 flex max-h-56 flex-col gap-0.5 overflow-y-auto">
              {members.map((member) => {
                const isAgent = member.principal_type === "agent";
                const label = isAgent
                  ? member.principal_id
                  : userLabel(
                      users.get(member.principal_id),
                      member.principal_id.slice(0, 8)
                    );
                return (
                  <div
                    className="group flex items-center gap-2 rounded-[4px] px-1 py-0.5 hover:bg-muted/60"
                    key={member.id}
                  >
                    {isAgent ? (
                      <Bot className="size-4 shrink-0 text-violet-600 dark:text-violet-400" />
                    ) : (
                      <Avatar className="size-5">
                        <AvatarFallback className="text-[9px]">
                          {authorInitials(label)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {label}
                    </span>
                    {member.role === "owner" ? (
                      <span className="text-[10px] text-muted-foreground uppercase">
                        {t("details.owner")}
                      </span>
                    ) : null}
                    {member.principal_id === currentUserId ? null : (
                      <button
                        aria-label={t("details.remove")}
                        className="hidden rounded p-0.5 text-muted-foreground hover:bg-muted group-hover:block"
                        onClick={() =>
                          kick.mutate(
                            {
                              principal_id: member.principal_id,
                              principal_type: member.principal_type,
                            },
                            { onError }
                          )
                        }
                        type="button"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <Input
              aria-label={t("details.addMember")}
              className="h-8"
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t("details.addMember")}
              value={filter}
            />
            {filter.trim() ? (
              <div className="mt-1 flex flex-col gap-0.5">
                {candidates.map((candidate) => (
                  <button
                    className="flex items-center gap-2 rounded-[4px] px-1 py-1 text-left text-sm hover:bg-muted/60"
                    key={`${candidate.kind}:${candidate.id}`}
                    onClick={() =>
                      invite.mutate(
                        {
                          channel: conversation.id,
                          members: [
                            {
                              principal_id: candidate.id,
                              principal_type: candidate.kind,
                            },
                          ],
                        },
                        { onError, onSuccess: () => setFilter("") }
                      )
                    }
                    type="button"
                  >
                    {candidate.kind === "agent" ? (
                      <Bot className="size-4 text-violet-600 dark:text-violet-400" />
                    ) : (
                      <Plus className="size-4 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {candidate.label}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {conversation.project_id ? (
            <>
              <Separator />
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={activityEnabled}
                  onCheckedChange={(checked) =>
                    setActivity.mutate(checked === true, { onError })
                  }
                />
                <span className="text-sm">{t("details.activityFeed")}</span>
              </label>
            </>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
