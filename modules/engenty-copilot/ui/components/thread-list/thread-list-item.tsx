import { ThreadStatusIcon } from "@engenty/ai-ui";
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
import { MoreVertical } from "lucide-react";
import type {
  AgentThreadDto,
  AgentThreadStatus,
} from "../../../src/lib/agent-thread-types.js";
import {
  threadListMenuContentClassName,
  threadListMenuItemClassName,
  threadListRowClassName,
} from "./styles.js";
import { useThreadList } from "./thread-list-context.js";
import { ThreadTitleMarquee } from "./thread-title-marquee.js";

export function ThreadListItem(props: { row: AgentThreadDto }) {
  const list = useThreadList();
  const label = list.threadLabel(props.row);
  const isActive = list.selectedThreadId === props.row.id;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className={cn(
          threadListRowClassName,
          isActive ? "hover:bg-muted" : "text-foreground"
        )}
        isActive={isActive}
        onClick={() => list.onSelectThread(props.row.id)}
        type="button"
        {...shellSecondaryNavItemProps}
      >
        <ThreadStatusIndicator status={props.row.status} />
        <ThreadTitleMarquee text={label} />
      </SidebarMenuButton>
      <ThreadListItemMenu
        isActive={isActive}
        label={label}
        onDelete={() => list.onDeleteThread(props.row.id)}
      />
    </SidebarMenuItem>
  );
}

function ThreadStatusIndicator(props: { status: AgentThreadStatus }) {
  const list = useThreadList();
  return (
    <ThreadStatusIcon
      label={statusLabel(props.status, list.labels)}
      status={props.status}
    />
  );
}

function statusLabel(
  status: AgentThreadStatus,
  labels: ReturnType<typeof useThreadList>["labels"]
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

function ThreadListItemMenu(props: {
  isActive: boolean;
  label: string;
  onDelete: () => void;
}) {
  const list = useThreadList();
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
          <MoreVertical className="size-4" />
        </SidebarMenuAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={threadListMenuContentClassName}
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem
          className={cn(
            threadListMenuItemClassName,
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
