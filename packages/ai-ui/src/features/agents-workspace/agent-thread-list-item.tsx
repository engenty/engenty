import { Badge, Button } from "@engenty/ui-core";
import { Trash2 } from "lucide-react";
import {
  ThreadStatusIcon,
  threadStatusBadgeClassName,
} from "../../components/thread-status/thread-status.js";
import type { AiAdminThreadRow } from "../../lib/admin/ai-runtime-api.js";
import { formatRelativeDate } from "./date-format.js";

export { ThreadStatusIcon } from "../../components/thread-status/thread-status.js";

interface AgentThreadListItemProps {
  isSelected: boolean;
  onRequestDelete: (threadId: string) => void;
  onSelect: (threadId: string) => void;
  t: (key: string, options?: { defaultValue?: string }) => string;
  thread: AiAdminThreadRow;
}

export function AgentThreadListItem({
  isSelected,
  onRequestDelete,
  onSelect,
  t,
  thread,
}: AgentThreadListItemProps) {
  const title =
    thread.title?.trim() ||
    thread.summary?.trim() ||
    t("sessions.untitledSession");
  const relativeTime = formatRelativeDate(
    thread.last_message_at ?? thread.updated_at
  );

  return (
    <div
      className={`flex border-b transition last:border-b-0 ${
        isSelected ? "bg-accent/40" : "hover:bg-accent/20"
      }`}
    >
      <button
        className="min-w-0 flex-1 px-3 py-2.5 text-left"
        onClick={() => onSelect(thread.id)}
        type="button"
      >
        <div className="flex items-center gap-2">
          <ThreadStatusIcon status={thread.status} />
          <span className="font-mono text-[11px] text-muted-foreground">
            {thread.id.slice(0, 8)}
          </span>
          <Badge
            className={threadStatusBadgeClassName(thread.status)}
            variant="outline"
          >
            {thread.status}
          </Badge>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {relativeTime ?? thread.updated_at}
          </span>
        </div>
        <p className="mt-1 truncate pl-5.5 text-foreground text-sm">{title}</p>
        <p className="mt-0.5 truncate pl-5.5 text-[11px] text-muted-foreground">
          {thread.current_agent_id ?? t("sessions.noAgent")}
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
            onRequestDelete(thread.id);
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
