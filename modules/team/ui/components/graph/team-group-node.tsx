import { Button, cn } from "@engenty/ui-core";
import { Handle, Position } from "@xyflow/react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";

export interface TeamGroupNodeData {
  isCollapsed: boolean;
  onToggle: (groupId: string) => void;
  title: string;
}

export function TeamGroupNode({
  id,
  data,
}: {
  data: TeamGroupNodeData;
  id: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-xl border bg-muted/20 transition-colors",
        data.isCollapsed
          ? "h-[64px] w-[220px] border-primary/20 bg-card p-3 shadow-sm"
          : "h-full w-full border-muted-foreground/30 border-dashed p-4"
      )}
    >
      <Handle className="opacity-0" position={Position.Top} type="target" />
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground/80 text-sm tracking-tight">
          {data.title}
        </span>
        <Button
          className="h-6 w-6"
          onClick={() => data.onToggle(id)}
          size="icon"
          variant="ghost"
        >
          {data.isCollapsed ? (
            <ChevronRightIcon className="h-4 w-4" />
          ) : (
            <ChevronDownIcon className="h-4 w-4" />
          )}
        </Button>
      </div>
      <Handle className="opacity-0" position={Position.Bottom} type="source" />
    </div>
  );
}
