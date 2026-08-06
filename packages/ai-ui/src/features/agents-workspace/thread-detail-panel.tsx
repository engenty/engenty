"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@engenty/ui-core";
import { useState } from "react";
import type { AiAdminThreadRow } from "../../lib/admin/ai-runtime-api.js";
import {
  useAdminAiThreadMessagesQuery,
  useDeleteAdminAiThreadMutation,
} from "../../lib/admin/ai-runtime-queries.js";
import { formatDateTime, formatRelativeDate } from "./date-format.js";
import { ThreadTranscriptMessages } from "./thread-transcript-messages.js";

interface ThreadDetailPanelProps {
  agentId: string;
  onThreadDeleted?: (threadId: string) => void;
  t: (key: string) => string;
  thread: AiAdminThreadRow | null;
}

function MetadataRow({
  label,
  mono,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-baseline gap-2 py-1">
      <span className="w-32 shrink-0 text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </span>
      <span
        className={
          mono
            ? "break-all font-mono text-xs"
            : "break-words text-foreground text-sm"
        }
      >
        {value && value.toString().trim().length > 0 ? value : "—"}
      </span>
    </div>
  );
}

export function ThreadDetailPanel({
  agentId,
  onThreadDeleted,
  t,
  thread,
}: ThreadDetailPanelProps) {
  const threadId = thread?.id ?? null;
  const messagesQuery = useAdminAiThreadMessagesQuery(threadId);
  const deleteMutation = useDeleteAdminAiThreadMutation(agentId);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!thread) {
    return (
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader>
          <CardTitle>{t("sessions.detailTitle")}</CardTitle>
          <CardDescription>{t("sessions.selectHint")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const threadKeyValue =
    typeof thread.route_context?.session_key === "string"
      ? (thread.route_context.session_key as string)
      : null;
  const lastMessageDisplay =
    formatDateTime(thread.last_message_at) ??
    formatRelativeDate(thread.last_message_at) ??
    null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workspace.sessionsTabDeleteConfirm", {
                defaultValue: "Delete this session?",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.sessionsTabDeleteDescription", {
                defaultValue:
                  "The session and its stored messages will be removed for this user.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("workspace.sessionsTabCancel", { defaultValue: "Cancel" })}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                void (async () => {
                  try {
                    await deleteMutation.mutateAsync(thread.id);
                    setDeleteOpen(false);
                    onThreadDeleted?.(thread.id);
                  } catch {
                    /* mutation isError */
                  }
                })();
              }}
            >
              {t("workspace.sessionsTabDelete", {
                defaultValue: "Delete session",
              })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <section className="rounded-lg border bg-background p-4">
        <div className="mb-3 border-b pb-2">
          <p className="font-medium text-sm">{t("sessions.metadataTitle")}</p>
          <p className="text-muted-foreground text-xs">
            {t("sessions.metadataHint")}
          </p>
        </div>
        <div className="flex flex-col">
          <MetadataRow
            label={t("sessions.metaTitle")}
            value={thread.title ?? null}
          />
          <MetadataRow label={t("sessions.metaId")} mono value={thread.id} />
          <MetadataRow label={t("sessions.metaStatus")} value={thread.status} />
          <MetadataRow
            label={t("sessions.metaAgent")}
            mono
            value={thread.current_agent_id}
          />
          <MetadataRow
            label={t("sessions.metaUser")}
            mono
            value={thread.user_id}
          />
          <MetadataRow
            label={t("sessions.metaTenant")}
            mono
            value={thread.tenant_id}
          />
          <MetadataRow
            label={t("sessions.metaSessionKey")}
            mono
            value={threadKeyValue}
          />
          <MetadataRow
            label={t("sessions.metaLastMessage")}
            value={lastMessageDisplay}
          />
          <MetadataRow
            label={t("sessions.metaUpdated")}
            value={formatDateTime(thread.updated_at)}
          />
        </div>
        <div className="mt-4 border-t pt-3">
          <Button
            className="text-destructive hover:text-destructive"
            disabled={deleteMutation.isPending}
            onClick={() => setDeleteOpen(true)}
            type="button"
            variant="outline"
          >
            {t("workspace.sessionsTabDelete", {
              defaultValue: "Delete session",
            })}
          </Button>
          {deleteMutation.isError ? (
            <p className="mt-2 text-destructive text-xs">
              {t("sessions.loadingFailed")}
            </p>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border bg-background p-4">
        <div className="border-b pb-2">
          <p className="font-medium text-sm">{t("sessions.transcriptTitle")}</p>
          <p className="text-muted-foreground text-xs">
            {t("sessions.transcriptHint")}
          </p>
        </div>
        <ThreadTranscriptMessages
          isLoading={messagesQuery.isLoading}
          messages={messagesQuery.data?.messages}
          t={t}
        />
      </section>

      {messagesQuery.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("sessions.detailTitle")}</CardTitle>
            <CardDescription>{t("sessions.loadingFailed")}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  );
}
