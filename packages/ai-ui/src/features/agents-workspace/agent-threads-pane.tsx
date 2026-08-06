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
  Input,
} from "@engenty/ui-core";
import { ArrowLeft, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AiAdminThreadRow } from "../../lib/admin/ai-runtime-api.js";
import {
  useDeleteAdminAiThreadMutation,
  useDeleteAllAdminAiThreadsForAgentMutation,
} from "../../lib/admin/ai-runtime-queries.js";
import { AgentThreadsList } from "./agent-threads-list.js";
import { ThreadDetailPanel } from "./thread-detail-panel.js";

interface AgentThreadsPaneProps {
  agentId: string;
  isLoading: boolean;
  onBackToThreads: (filter?: string | null) => void;
  onOpenThread: (threadId: string) => void;
  routeSelectedThreadId: string;
  setThreadsFilter: (filter: string | null) => void;
  t: (key: string) => string;
  threads: AiAdminThreadRow[];
  threadsFilter: string;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isMobile;
}

export function AgentThreadsPane({
  agentId,
  isLoading,
  onBackToThreads,
  onOpenThread,
  routeSelectedThreadId,
  t,
  threads,
  threadsFilter,
  setThreadsFilter,
}: AgentThreadsPaneProps) {
  const isMobile = useIsMobile();
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const deleteOneMutation = useDeleteAdminAiThreadMutation(agentId);
  const deleteAllMutation = useDeleteAllAdminAiThreadsForAgentMutation(agentId);

  const selectedThread = routeSelectedThreadId
    ? (threads.find((thread) => thread.id === routeSelectedThreadId) ?? null)
    : isMobile
      ? null
      : (threads[0] ?? null);
  const selectedThreadId = selectedThread?.id ?? routeSelectedThreadId;

  const navigateAwayIfNeeded = useCallback(
    (deletedThreadId: string) => {
      if (routeSelectedThreadId && deletedThreadId === routeSelectedThreadId) {
        onBackToThreads(threadsFilter || null);
      }
    },
    [onBackToThreads, routeSelectedThreadId, threadsFilter]
  );

  const runDeleteOne = useCallback(async () => {
    if (!pendingDeleteId) {
      return;
    }
    const id = pendingDeleteId;
    try {
      await deleteOneMutation.mutateAsync(id);
      setPendingDeleteId(null);
      navigateAwayIfNeeded(id);
    } catch {
      /* surfaced via mutation isError */
    }
  }, [deleteOneMutation, navigateAwayIfNeeded, pendingDeleteId]);

  const runClearAll = useCallback(async () => {
    try {
      await deleteAllMutation.mutateAsync();
      setClearAllOpen(false);
      if (routeSelectedThreadId) {
        onBackToThreads(threadsFilter || null);
      }
    } catch {
      /* surfaced via mutation isError */
    }
  }, [
    deleteAllMutation,
    onBackToThreads,
    routeSelectedThreadId,
    threadsFilter,
  ]);

  const deleteBusy = deleteOneMutation.isPending || deleteAllMutation.isPending;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
      <AlertDialog
        onOpenChange={(open) => !open && setClearAllOpen(false)}
        open={clearAllOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workspace.sessionsTabClearAllConfirm", {
                defaultValue: "Delete all sessions?",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.sessionsTabClearAllDescription", {
                defaultValue:
                  "This removes every chat session for this agent in the current tenant.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>
              {t("workspace.sessionsTabCancel", { defaultValue: "Cancel" })}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteBusy}
              onClick={(event) => {
                event.preventDefault();
                void runClearAll();
              }}
            >
              {t("workspace.sessionsTabClearAll", {
                defaultValue: "Clear all sessions",
              })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
        open={Boolean(pendingDeleteId)}
      >
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
                  "The session and its link to runs will be removed for this tenant. Historical run rows may remain with an empty session reference.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>
              {t("workspace.sessionsTabCancel", { defaultValue: "Cancel" })}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteBusy}
              onClick={(event) => {
                event.preventDefault();
                void runDeleteOne();
              }}
            >
              {t("workspace.sessionsTabDelete", {
                defaultValue: "Delete session",
              })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!(isMobile && selectedThread) && (
        <div className="flex min-h-0 shrink-0 flex-col gap-3 lg:w-80">
          <div className="rounded-lg border bg-background p-3">
            <div className="flex items-center gap-2 rounded-md border bg-muted/20 px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                onChange={(event) => {
                  const nextFilter = event.target.value;
                  setThreadsFilter(nextFilter || null);
                  if (routeSelectedThreadId) {
                    onBackToThreads(nextFilter || null);
                  }
                }}
                placeholder={t("sessions.searchPlaceholder")}
                value={threadsFilter}
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs">
                {threads.length} {t("sessions.listCount")}
              </p>
              <Button
                className="h-8 gap-1 text-destructive hover:text-destructive"
                disabled={deleteBusy || threads.length === 0 || isLoading}
                onClick={() => setClearAllOpen(true)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("workspace.sessionsTabClearAll", {
                  defaultValue: "Clear all sessions",
                })}
              </Button>
            </div>
            {deleteOneMutation.isError || deleteAllMutation.isError ? (
              <p className="mt-2 text-destructive text-xs">
                {t("sessions.loadingFailed")}
              </p>
            ) : null}
          </div>
          <div className="min-h-0 flex-1">
            <AgentThreadsList
              emptyLabel={t("sessions.empty")}
              isLoading={isLoading}
              onRequestDelete={(threadId) => setPendingDeleteId(threadId)}
              onSelect={onOpenThread}
              selectedThreadId={selectedThreadId}
              t={t}
              threads={threads}
            />
          </div>
        </div>
      )}

      <div className="min-h-0 min-w-0 flex-1">
        {isMobile && selectedThread ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <Button
              className="w-fit"
              onClick={() => onBackToThreads(threadsFilter || null)}
              type="button"
              variant="outline"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("sessions.backToList")}
            </Button>
            <ThreadDetailPanel
              agentId={agentId}
              onThreadDeleted={navigateAwayIfNeeded}
              t={t}
              thread={selectedThread}
            />
          </div>
        ) : isMobile ? (
          <ThreadDetailPanel agentId={agentId} t={t} thread={null} />
        ) : (
          <ThreadDetailPanel
            agentId={agentId}
            onThreadDeleted={navigateAwayIfNeeded}
            t={t}
            thread={selectedThread}
          />
        )}
      </div>
    </section>
  );
}
