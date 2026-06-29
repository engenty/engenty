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
import type { AiAdminSessionRow } from "../../lib/admin/ai-runtime-api";
import {
  useDeleteAdminAiSessionMutation,
  useDeleteAllAdminAiSessionsForAgentMutation,
} from "../../lib/admin/ai-runtime-queries";
import { AgentSessionsList } from "./agent-sessions-list";
import { SessionDetailPanel } from "./session-detail-panel";

interface AgentSessionsPaneProps {
  agentId: string;
  isLoading: boolean;
  onBackToSessions: (filter?: string | null) => void;
  onOpenSession: (threadId: string) => void;
  routeSelectedSessionId: string;
  sessions: AiAdminSessionRow[];
  sessionsFilter: string;
  setSessionsFilter: (filter: string | null) => void;
  t: (key: string) => string;
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

export function AgentSessionsPane({
  agentId,
  isLoading,
  onBackToSessions,
  onOpenSession,
  routeSelectedSessionId,
  sessions,
  sessionsFilter,
  setSessionsFilter,
  t,
}: AgentSessionsPaneProps) {
  const isMobile = useIsMobile();
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const deleteOneMutation = useDeleteAdminAiSessionMutation(agentId);
  const deleteAllMutation =
    useDeleteAllAdminAiSessionsForAgentMutation(agentId);

  const selectedSession = routeSelectedSessionId
    ? (sessions.find((session) => session.id === routeSelectedSessionId) ??
      null)
    : isMobile
      ? null
      : (sessions[0] ?? null);
  const selectedThreadId = selectedSession?.id ?? routeSelectedSessionId;

  const navigateAwayIfNeeded = useCallback(
    (deletedSessionId: string) => {
      if (
        routeSelectedSessionId &&
        deletedSessionId === routeSelectedSessionId
      ) {
        onBackToSessions(sessionsFilter || null);
      }
    },
    [onBackToSessions, routeSelectedSessionId, sessionsFilter]
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
      if (routeSelectedSessionId) {
        onBackToSessions(sessionsFilter || null);
      }
    } catch {
      /* surfaced via mutation isError */
    }
  }, [
    deleteAllMutation,
    onBackToSessions,
    routeSelectedSessionId,
    sessionsFilter,
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

      {!(isMobile && selectedSession) && (
        <div className="flex min-h-0 shrink-0 flex-col gap-3 lg:w-80">
          <div className="rounded-lg border bg-background p-3">
            <div className="flex items-center gap-2 rounded-md border bg-muted/20 px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                onChange={(event) => {
                  const nextFilter = event.target.value;
                  setSessionsFilter(nextFilter || null);
                  if (routeSelectedSessionId) {
                    onBackToSessions(nextFilter || null);
                  }
                }}
                placeholder={t("sessions.searchPlaceholder")}
                value={sessionsFilter}
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs">
                {sessions.length} {t("sessions.listCount")}
              </p>
              <Button
                className="h-8 gap-1 text-destructive hover:text-destructive"
                disabled={deleteBusy || sessions.length === 0 || isLoading}
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
            <AgentSessionsList
              emptyLabel={t("sessions.empty")}
              isLoading={isLoading}
              onRequestDelete={(threadId) => setPendingDeleteId(threadId)}
              onSelect={onOpenSession}
              selectedThreadId={selectedThreadId}
              sessions={sessions}
              t={t}
            />
          </div>
        </div>
      )}

      <div className="min-h-0 min-w-0 flex-1">
        {isMobile && selectedSession ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <Button
              className="w-fit"
              onClick={() => onBackToSessions(sessionsFilter || null)}
              type="button"
              variant="outline"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("sessions.backToList")}
            </Button>
            <SessionDetailPanel
              agentId={agentId}
              onSessionDeleted={navigateAwayIfNeeded}
              session={selectedSession}
              t={t}
            />
          </div>
        ) : isMobile ? (
          <SessionDetailPanel agentId={agentId} session={null} t={t} />
        ) : (
          <SessionDetailPanel
            agentId={agentId}
            onSessionDeleted={navigateAwayIfNeeded}
            session={selectedSession}
            t={t}
          />
        )}
      </div>
    </section>
  );
}
