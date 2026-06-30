import { Button } from "@engenty/ui-core";
import { Handle, Position } from "@xyflow/react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { TeamMemberAvatar } from "../team-member-avatar.js";

export interface TeamMemberNodeData {
  avatarStorageKey: string | null;
  fullName: string;
  initials: string | null;
  isCollapsed?: boolean;
  isManager?: boolean;
  onToggleManager?: (id: string) => void;
  reportCount?: number;
  role: string | null;
}

export const TEAM_MEMBER_NODE_WIDTH = 220;
export const TEAM_MEMBER_NODE_HEIGHT = 64;

export function TeamMemberNode({
  data,
  id,
}: {
  data: TeamMemberNodeData;
  id: string;
}) {
  if (data.isManager && !data.isCollapsed) {
    return (
      <div className="relative h-full w-full rounded-xl border border-primary/30 border-dashed bg-primary/5 p-4 transition-colors">
        <div className="absolute -top-6 left-0 flex h-[64px] w-[220px] items-center gap-3 rounded-md border bg-card p-3 shadow-sm">
          <TeamMemberAvatar
            fullName={data.fullName}
            initials={data.initials}
            storageKey={data.avatarStorageKey}
            variant="card"
          />
          <div className="flex min-w-0 flex-col">
            <span
              className="truncate font-medium text-sm"
              title={data.fullName}
            >
              {data.fullName}
            </span>
            {data.role ? (
              <span
                className="truncate text-muted-foreground text-xs"
                title={data.role}
              >
                {data.role}
              </span>
            ) : null}
          </div>
          <Button
            className="ml-auto h-6 w-6"
            onClick={() => data.onToggleManager?.(id)}
            size="icon"
            variant="ghost"
          >
            <ChevronDownIcon className="h-4 w-4" />
          </Button>
        </div>
        <Handle className="opacity-0" position={Position.Top} type="target" />
        <Handle
          className="opacity-0"
          position={Position.Bottom}
          type="source"
        />
      </div>
    );
  }

  return (
    <div className="flex h-[64px] w-[220px] items-center gap-3 rounded-md border bg-card p-3 shadow-sm transition-all hover:border-primary/50">
      <Handle position={Position.Top} type="target" />
      <TeamMemberAvatar
        fullName={data.fullName}
        initials={data.initials}
        storageKey={data.avatarStorageKey}
        variant="card"
      />
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-sm" title={data.fullName}>
          {data.fullName}
        </span>
        {data.role ? (
          <span
            className="truncate text-muted-foreground text-xs"
            title={data.role}
          >
            {data.role}
          </span>
        ) : null}
      </div>
      {data.isManager ? (
        <Button
          className="ml-auto h-6 px-2 text-[10px]"
          onClick={() => data.onToggleManager?.(id)}
          size="sm"
          variant="secondary"
        >
          {data.isCollapsed ? (
            <ChevronRightIcon className="mr-1 h-3 w-3" />
          ) : null}
          {data.reportCount}
        </Button>
      ) : null}
      <Handle position={Position.Bottom} type="source" />
    </div>
  );
}
