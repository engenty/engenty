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
import type { AiAdminSessionRow } from "../../lib/admin/ai-runtime-api";
import {
  useAdminAiSessionMessagesQuery,
  useDeleteAdminAiSessionMutation,
} from "../../lib/admin/ai-runtime-queries";
import { formatDateTime, formatRelativeDate } from "./date-format";
import { SessionTranscriptMessages } from "./session-transcript-messages";

interface SessionDetailPanelProps {
  agentId: string;
  onSessionDeleted?: (threadId: string) => void;
  session: AiAdminSessionRow | null;
  t: (key: string) => string;
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

export function SessionDetailPanel({
  agentId,
  onSessionDeleted,
  session,
  t,
}: SessionDetailPanelProps) {
  const threadId = session?.id ?? null;
  const messagesQuery = useAdminAiSessionMessagesQuery(threadId);
  const deleteMutation = useDeleteAdminAiSessionMutation(agentId);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!session) {
    return (
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader>
          <CardTitle>{t("sessions.detailTitle")}</CardTitle>
          <CardDescription>{t("sessions.selectHint")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const sessionKeyValue =
    typeof session.route_context?.session_key === "string"
      ? (session.route_context.session_key as string)
      : null;
  const lastMessageDisplay =
    formatDateTime(session.last_message_at) ??
    formatRelativeDate(session.last_message_at) ??
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
                    await deleteMutation.mutateAsync(session.id);
                    setDeleteOpen(false);
                    onSessionDeleted?.(session.id);
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
            value={session.title ?? null}
          />
          <MetadataRow label={t("sessions.metaId")} mono value={session.id} />
          <MetadataRow
            label={t("sessions.metaStatus")}
            value={session.status}
          />
          <MetadataRow
            label={t("sessions.metaAgent")}
            mono
            value={session.current_agent_id}
          />
          <MetadataRow
            label={t("sessions.metaUser")}
            mono
            value={session.user_id}
          />
          <MetadataRow
            label={t("sessions.metaTenant")}
            mono
            value={session.tenant_id}
          />
          <MetadataRow
            label={t("sessions.metaSessionKey")}
            mono
            value={sessionKeyValue}
          />
          <MetadataRow
            label={t("sessions.metaLastMessage")}
            value={lastMessageDisplay}
          />
          <MetadataRow
            label={t("sessions.metaUpdated")}
            value={formatDateTime(session.updated_at)}
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
        <SessionTranscriptMessages
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
