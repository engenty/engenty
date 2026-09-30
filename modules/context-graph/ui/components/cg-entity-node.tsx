import { cn } from "@engenty/ui-core";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import type { EntityNodeData } from "./use-cg-graph-data.js";

export type EntityNodeType = Node<EntityNodeData, "entity">;

interface RuntimeData extends EntityNodeData {
  isHighlighted?: boolean | null;
  isSelected?: boolean;
}

export function CgEntityNode({ data, selected }: NodeProps<EntityNodeType>) {
  const d = data as RuntimeData;
  const isDimmed = d.isHighlighted === false && !selected;
  const isEmphasized = d.isHighlighted === true || selected;

  return (
    <div
      className={cn(
        "min-w-[110px] max-w-[180px] cursor-pointer select-none rounded-lg border-2 bg-background px-3 py-2 shadow-sm transition-all",
        isEmphasized && !selected && "border-primary/60 ring-2 ring-primary/20",
        selected && "border-primary shadow-md ring-2 ring-primary/30",
        !(isEmphasized || selected) && "border-border",
        isDimmed && "opacity-30"
      )}
    >
      <Handle
        className="!h-2 !w-2 !border-background !bg-border"
        position={Position.Top}
        type="target"
      />
      <div className="flex items-center gap-1.5">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: d.color }}
        />
        <span className="truncate font-medium text-foreground text-xs">
          {d.label}
        </span>
      </div>
      <span className="mt-0.5 block truncate text-muted-foreground text-xxs">
        {(d.entityType as string).split(".").pop()}
      </span>
      <Handle
        className="!h-2 !w-2 !border-background !bg-border"
        position={Position.Bottom}
        type="source"
      />
    </div>
  );
}
