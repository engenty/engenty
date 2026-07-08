import { Badge, Button } from "@engenty/ui-core";
import { Trash2 } from "lucide-react";
import {
  SessionStatusIcon,
  sessionStatusBadgeClassName,
} from "../../components/session-status/session-status.js";
import type { AiAdminSessionRow } from "../../lib/admin/ai-runtime-api";
import { formatRelativeDate } from "./date-format";

export { SessionStatusIcon } from "../../components/session-status/session-status.js";

interface AgentSessionListItemProps {
  isSelected: boolean;
  onRequestDelete: (threadId: string) => void;
  onSelect: (threadId: string) => void;
  session: AiAdminSessionRow;
  t: (key: string) => string;
}

export function AgentSessionListItem({
  isSelected,
  onRequestDelete,
  onSelect,
  session,
  t,
}: AgentSessionListItemProps) {
  const title =
    session.title?.trim() ||
    session.summary?.trim() ||
    t("sessions.untitledSession");
  const relativeTime = formatRelativeDate(
    session.last_message_at ?? session.updated_at
  );

  return (
    <div
      className={`flex border-b transition last:border-b-0 ${
        isSelected ? "bg-accent/40" : "hover:bg-accent/20"
      }`}
    >
      <button
        className="min-w-0 flex-1 px-3 py-2.5 text-left"
        onClick={() => onSelect(session.id)}
        type="button"
      >
        <div className="flex items-center gap-2">
          <SessionStatusIcon status={session.status} />
          <span className="font-mono text-[11px] text-muted-foreground">
            {session.id.slice(0, 8)}
          </span>
          <Badge
            className={sessionStatusBadgeClassName(session.status)}
            variant="outline"
          >
            {session.status}
          </Badge>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {relativeTime ?? session.updated_at}
          </span>
        </div>
        <p className="mt-1 truncate pl-5.5 text-foreground text-sm">{title}</p>
        <p className="mt-0.5 truncate pl-5.5 text-[11px] text-muted-foreground">
          {session.current_agent_id ?? t("sessions.noAgent")}
        </p>
      </button>
      <div className="flex shrink-0 items-start py-2 pr-2">
        <Button
          aria-label={t("workspace.sessionsTabDelete", {
            defaultValue: "Delete session",
          })}
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRequestDelete(session.id);
          }}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
