import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { ExternalLink, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import type { TaskLinkedSessionRow } from "../lib/task-linked-sessions.js";
import { TaskPropertyEmpty, TaskPropertyRow } from "./task-property-row.js";

interface TaskLinkedSessionsPanelProps {
  isLoading?: boolean;
  sessions: TaskLinkedSessionRow[];
}

export function TaskLinkedSessionsPanel({
  sessions,
  isLoading = false,
}: TaskLinkedSessionsPanelProps) {
  const { t } = useTranslation("tasks");

  return (
    <section
      aria-label={t("detail.workspace.linkedSessions")}
      className="space-y-2"
    >
      <h3 className="px-1 font-medium text-sm">
        {t("detail.workspace.linkedSessions")}
      </h3>
      {isLoading ? (
        <p className="px-1 text-muted-foreground text-sm">…</p>
      ) : sessions.length === 0 ? (
        <TaskPropertyRow
          icon={MessageSquare}
          label={t("detail.workspace.linkedSessions")}
        >
          <TaskPropertyEmpty>
            {t("detail.workspace.linkedSessionsEmpty")}
          </TaskPropertyEmpty>
        </TaskPropertyRow>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => {
            const label =
              session.title?.trim() ||
              t("detail.workspace.linkedSessionUntitled", {
                agent: session.agent_type_key,
              });
            return (
              <Button
                asChild
                className="h-auto w-full justify-start gap-2 px-3 py-2"
                key={session.id}
                variant="outline"
              >
                <Link to={`/mdl/engenty-copilot/chat/${session.id}`}>
                  <ExternalLink className="size-3.5 shrink-0" />
                  <span className="min-w-0 truncate text-left text-sm">
                    {label}
                  </span>
                </Link>
              </Button>
            );
          })}
        </div>
      )}
    </section>
  );
}
