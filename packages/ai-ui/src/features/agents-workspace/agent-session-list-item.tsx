import { Badge, Button } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import {
  CircleAlert,
  CircleCheckBig,
  CircleDashed,
  CircleDot,
  Trash2,
} from "lucide-react";
import type { AiAdminSessionRow } from "../../lib/admin/ai-runtime-api";
import { formatRelativeDate } from "./date-format";

interface AgentSessionListItemProps {
  isSelected: boolean;
  onRequestDelete: (threadId: string) => void;
  onSelect: (threadId: string) => void;
  session: AiAdminSessionRow;
  t: (key: string) => string;
}

const statusStyles: Record<AiAdminSessionRow["status"], string> = {
  completed:
    "border-transparent bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
  failed:
    "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20",
  idle: "border-transparent bg-secondary text-secondary-foreground",
  running:
    "border-transparent bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
  waiting:
    "border-transparent bg-sky-500/15 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
};

export function SessionStatusIcon({
  status,
}: Pick<AiAdminSessionRow, "status">) {
  switch (status) {
    case "running":
      return (
        <AnimatedLoaderIcon
          className="text-amber-600 dark:text-amber-300"
          play="always"
          size="xs"
        />
      );
    case "completed":
      return (
        <CircleCheckBig className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />
      );
    case "failed":
      return <CircleAlert className="h-3.5 w-3.5 text-destructive" />;
    case "waiting":
      return <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />;
    default:
      return <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />;
  }
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
          <Badge className={statusStyles[session.status]} variant="outline">
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
