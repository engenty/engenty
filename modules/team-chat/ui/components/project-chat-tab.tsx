// The "Chat" tab contributed to projects.detail: renders the bound channel
// embedded, or offers to create+bind one.
import { requestApiJson } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { queryOptions, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@engenty/ui-core";
import { MessagesSquare } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Conversation } from "../api.js";
import { teamChatKeys } from "../queries.js";
import { ConversationView } from "./conversation-view.js";

async function invokeTool<T>(operationId: string, input: unknown): Promise<T> {
  return requestApiJson<T>(`/api/tools/${operationId}/invoke`, {
    method: "POST",
    body: { input },
  });
}

function useProjectChannelQuery(projectId: string) {
  return useQuery(
    queryOptions({
      queryFn: async () =>
        (
          await invokeTool<{ conversation: Conversation | null }>(
            "team_chat_project_channel_get",
            { project_id: projectId }
          )
        ).conversation,
      queryKey: [...teamChatKeys.all, "project-channel", projectId],
    })
  );
}

export function ProjectChatTab({ params }: { params: { projectId?: string } }) {
  const { t } = useTranslation("team-chat");
  const projectId = params.projectId ?? "";
  const queryClient = useQueryClient();
  const channelQuery = useProjectChannelQuery(projectId);
  const [creating, setCreating] = useState(false);

  const createAndBind = async () => {
    setCreating(true);
    try {
      // Channel name from the project title (fetched lazily; slugified).
      const project = await invokeTool<{ name?: string; title?: string }>(
        "projects_get",
        { id: projectId }
      ).catch(() => null);
      const rawName =
        (project as { name?: string; title?: string } | null)?.name ??
        (project as { title?: string } | null)?.title ??
        `proj-${projectId.slice(0, 8)}`;
      const name = rawName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
      const created = await invokeTool<{ conversation: Conversation }>(
        "team_chat_conversations_create",
        { name: name || `proj-${projectId.slice(0, 8)}` }
      );
      await invokeTool("team_chat_bind_project", {
        channel: created.conversation.id,
        project_id: projectId,
      });
      await queryClient.invalidateQueries({ queryKey: teamChatKeys.all });
    } catch (error) {
      toast.error(t("toasts.actionFailed", { error: String(error) }));
    } finally {
      setCreating(false);
    }
  };

  if (!projectId) {
    return null;
  }

  if (channelQuery.isLoading) {
    return null;
  }

  if (!channelQuery.data) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Empty>
          <EmptyHeader>
            <MessagesSquare className="size-8 text-muted-foreground" />
            <EmptyTitle>{t("projectTabEmpty.title")}</EmptyTitle>
            <EmptyDescription>{t("projectTabEmpty.hint")}</EmptyDescription>
          </EmptyHeader>
          <Button disabled={creating} onClick={createAndBind} size="sm">
            {t("projectTabEmpty.create")}
          </Button>
        </Empty>
      </div>
    );
  }

  return (
    <div className="ui-canvas-elevated flex h-[70vh] min-h-96 flex-col overflow-hidden rounded-md bg-card">
      <ConversationView conversationId={channelQuery.data.id} embedded />
    </div>
  );
}
