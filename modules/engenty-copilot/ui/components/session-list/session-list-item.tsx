import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import {
  AlertCircle,
  Check,
  Clock3,
  MoreHorizontal,
  Pencil,
} from "lucide-react";
import type {
  AgentSessionDto,
  AgentSessionStatus,
} from "../../../src/lib/agent-session-types.js";
import { useSessionList } from "./session-list-context.js";
import {
  sessionListMenuContentClassName,
  sessionListMenuItemClassName,
  sessionListRowClassName,
} from "./styles.js";

export function SessionListItem(props: { row: AgentSessionDto }) {
  const list = useSessionList();
  const label = list.sessionLabel(props.row);
  const agentLabel = list.sessionAgentLabel(props.row);
  const isActive = list.selectedThreadId === props.row.id;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className={cn(
          sessionListRowClassName,
          isActive ? "hover:bg-muted" : "text-foreground"
        )}
        isActive={isActive}
        onClick={() => list.onSelectSession(props.row.id)}
        type="button"
        {...shellSecondaryNavItemProps}
      >
        <span className="flex min-w-0 items-center gap-2 text-left">
          <SessionStatusIndicator status={props.row.status} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] leading-snug">{label}</span>
            <span className="truncate text-[11px] text-muted-foreground leading-tight">
              {agentLabel}
            </span>
          </span>
        </span>
      </SidebarMenuButton>
      <SessionListItemMenu
        isActive={isActive}
        label={label}
        onDelete={() => list.onDeleteSession(props.row.id)}
      />
    </SidebarMenuItem>
  );
}

function SessionStatusIndicator(props: { status: AgentSessionStatus }) {
  const list = useSessionList();
  const label = statusLabel(props.status, list.labels);
  const className = "size-3 shrink-0";
  if (props.status === "running") {
    return <AnimatedLoaderIcon play="always" size="sm" />;
  }
  if (props.status === "draft") {
    return (
      <Pencil aria-label={label} className={cn(className, "text-primary")} />
    );
  }
  if (props.status === "waiting") {
    return (
      <Clock3 aria-label={label} className={cn(className, "text-amber-600")} />
    );
  }
  if (props.status === "failed") {
    return (
      <AlertCircle
        aria-label={label}
        className={cn(className, "text-destructive")}
      />
    );
  }
  if (props.status === "completed") {
    return (
      <span
        aria-label={label}
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"
        )}
        role="img"
      >
        <Check className="size-2.5 stroke-[3]" />
      </span>
    );
  }
  return (
    <span
      aria-label={label}
      className={cn(
        className,
        "rounded-full border border-muted-foreground/35"
      )}
      role="img"
    />
  );
}

function statusLabel(
  status: AgentSessionStatus,
  labels: ReturnType<typeof useSessionList>["labels"]
): string {
  if (status === "running") {
    return labels.statusRunning;
  }
  if (status === "draft") {
    return labels.statusDraft;
  }
  if (status === "waiting") {
    return labels.statusWaiting;
  }
  if (status === "failed") {
    return labels.statusFailed;
  }
  if (status === "completed") {
    return labels.statusCompleted;
  }
  return labels.statusIdle;
}

function SessionListItemMenu(props: {
  isActive: boolean;
  label: string;
  onDelete: () => void;
}) {
  const list = useSessionList();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild nativeButton>
        <SidebarMenuAction
          aria-label={`${list.labels.sessionMenu}: ${props.label}`}
          className={cn(props.isActive && "opacity-100")}
          onClick={(event) => {
            event.stopPropagation();
          }}
          showOnHover
          type="button"
        >
          <MoreHorizontal className="size-4" />
        </SidebarMenuAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={sessionListMenuContentClassName}
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem
          className={cn(
            sessionListMenuItemClassName,
            "text-destructive focus:text-destructive"
          )}
          disabled={list.deletePending}
          onClick={props.onDelete}
        >
          {list.labels.deleteSession}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
