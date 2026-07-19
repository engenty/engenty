// Slack-bridge settings: bind team-chat channels to Slack channels of a
// connected Slack workspace (connections framework), unbind, and trigger the
// inbound sync. All data flows through gateway ops via /api/tools.
import { requestApiJson } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { Button } from "@engenty/ui-core";
import { useState } from "react";

interface Conversation {
  id: string;
  is_archived: boolean;
  name: string | null;
  type: string;
}

interface Bound {
  channel_id: string;
  channel_name?: string;
  conversation_id: string;
  sync_cursor?: string;
}

interface SlackAccount {
  account: string | null;
  connection_id: string;
  display_name: string | null;
}

interface SlackChannel {
  id: string;
  is_private?: boolean;
  name: string;
}

async function invokeOp<T>(operationId: string, input: unknown): Promise<T> {
  const result = await requestApiJson<{ data?: T } & Record<string, unknown>>(
    `/api/tools/${operationId}/invoke`,
    { body: { input }, method: "POST" }
  );
  return (result.data ?? result) as T;
}

const keys = {
  accounts: ["slack-bridge", "accounts"] as const,
  bound: ["slack-bridge", "bound"] as const,
  conversations: ["slack-bridge", "conversations"] as const,
  slackChannels: ["slack-bridge", "slack-channels"] as const,
};

export function SlackBridgeSettingsPage() {
  const { t } = useTranslation("team-chat-slack-bridge");
  const queryClient = useQueryClient();
  const [pendingChoice, setPendingChoice] = useState<Record<string, string>>(
    {}
  );

  const conversationsQuery = useQuery({
    queryFn: () =>
      invokeOp<{ conversations: Conversation[] }>(
        "team_chat_conversations_list",
        { include_public: true }
      ),
    queryKey: keys.conversations,
  });
  const boundQuery = useQuery({
    queryFn: () =>
      invokeOp<{ bound: Bound[] }>("team_chat_slack_bound_list", {}),
    queryKey: keys.bound,
  });
  const accountsQuery = useQuery({
    queryFn: () =>
      invokeOp<{ accounts: SlackAccount[] }>("connections_list_accounts", {
        connector_id: "slack",
      }),
    queryKey: keys.accounts,
  });
  const connection = accountsQuery.data?.accounts?.[0] ?? null;
  const slackChannelsQuery = useQuery({
    enabled: Boolean(connection),
    queryFn: () =>
      invokeOp<{ channels: SlackChannel[] }>("slack_list_channels", {
        limit: 50,
      }),
    queryKey: keys.slackChannels,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["slack-bridge"] });
  const bind = useMutation({
    mutationFn: (input: {
      channel: string;
      slack_channel_id: string;
      slack_channel_name?: string;
    }) =>
      invokeOp("team_chat_slack_bind", {
        ...input,
        connection_id: connection?.connection_id,
      }),
    onSuccess: invalidate,
  });
  const unbind = useMutation({
    mutationFn: (channel: string) =>
      invokeOp("team_chat_slack_unbind", { channel }),
    onSuccess: invalidate,
  });
  const sync = useMutation({
    mutationFn: (channel?: string) =>
      invokeOp<{ conversations: number; errors: number; imported: number }>(
        "team_chat_slack_sync_run",
        channel ? { channel } : {}
      ),
    onSuccess: invalidate,
  });

  const channels = (conversationsQuery.data?.conversations ?? []).filter(
    (conversation) =>
      !conversation.is_archived &&
      (conversation.type === "public_channel" ||
        conversation.type === "private_channel")
  );
  const boundById = new Map(
    (boundQuery.data?.bound ?? []).map((entry) => [
      entry.conversation_id,
      entry,
    ])
  );
  const slackChannels = slackChannelsQuery.data?.channels ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="font-semibold text-xl">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>

      {connection ? (
        <p className="text-muted-foreground text-sm">
          {t("connection", {
            name: connection.display_name ?? connection.account ?? "Slack",
          })}
        </p>
      ) : (
        <div className="rounded-md border border-border/60 bg-muted/40 p-4 text-sm">
          {t("noConnection")}
        </div>
      )}

      <div className="flex flex-col divide-y divide-border/60 rounded-md border border-border/60 bg-card">
        {channels.map((conversation) => {
          const binding = boundById.get(conversation.id);
          const choice = pendingChoice[conversation.id] ?? "";
          return (
            <div
              className="flex flex-wrap items-center gap-3 px-4 py-3"
              key={conversation.id}
            >
              <span className="min-w-40 font-medium text-sm">
                #{conversation.name}
              </span>
              {binding ? (
                <>
                  <span className="text-muted-foreground text-sm">
                    → {binding.channel_name ?? binding.channel_id}
                  </span>
                  <span className="flex-1" />
                  <Button
                    disabled={sync.isPending}
                    onClick={() => sync.mutate(conversation.id)}
                    size="sm"
                    variant="outline"
                  >
                    {t("syncNow")}
                  </Button>
                  <Button
                    disabled={unbind.isPending}
                    onClick={() => unbind.mutate(conversation.id)}
                    size="sm"
                    variant="ghost"
                  >
                    {t("unbind")}
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1" />
                  <select
                    className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                    disabled={!connection || slackChannels.length === 0}
                    onChange={(event) =>
                      setPendingChoice((previous) => ({
                        ...previous,
                        [conversation.id]: event.target.value,
                      }))
                    }
                    value={choice}
                  >
                    <option value="">{t("pickSlackChannel")}</option>
                    {slackChannels.map((slackChannel) => (
                      <option key={slackChannel.id} value={slackChannel.id}>
                        #{slackChannel.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    disabled={!(connection && choice) || bind.isPending}
                    onClick={() =>
                      bind.mutate({
                        channel: conversation.id,
                        slack_channel_id: choice,
                        ...(slackChannels.find((sc) => sc.id === choice)?.name
                          ? {
                              slack_channel_name: slackChannels.find(
                                (sc) => sc.id === choice
                              )?.name,
                            }
                          : {}),
                      })
                    }
                    size="sm"
                  >
                    {t("bind")}
                  </Button>
                </>
              )}
            </div>
          );
        })}
        {channels.length === 0 ? (
          <div className="px-4 py-6 text-muted-foreground text-sm">
            {t("noChannels")}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Button
          disabled={sync.isPending}
          onClick={() => sync.mutate(undefined)}
          size="sm"
          variant="outline"
        >
          {t("syncAll")}
        </Button>
        {sync.data ? (
          <span className="text-muted-foreground text-xs">
            {t("syncResult", {
              conversations: sync.data.conversations,
              errors: sync.data.errors,
              imported: sync.data.imported,
            })}
          </span>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">{t("approvalHint")}</p>
    </div>
  );
}
