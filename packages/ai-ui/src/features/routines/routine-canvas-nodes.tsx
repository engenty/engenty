// Trigger and Delivery join the canvas vocabulary.
//
// The routine picture is the flow canvas zoomed out one level, so its two new
// node kinds speak the exact card language WorkflowStepNode established — same
// width, same chip treatment, same "tint mixes INTO the card" rule the gate
// uses, so both themes keep them cards that happen to lean a colour.
import { cn } from "@engenty/ui-core";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import {
  Bot,
  CalendarClock,
  MousePointerClick,
  Send,
  Webhook,
  Zap,
} from "lucide-react";
import { workflowNodeTypes } from "../workflow-canvas/workflow-node.js";

const TRIGGER_ICON = {
  agent: Bot,
  event: Zap,
  manual: MousePointerClick,
  schedule: CalendarClock,
  webhook: Webhook,
} as const;

export interface TriggerNodeData {
  /** Cron in words, event resource, shortcode — the line under the chip. */
  detail: string | null;
  /** A paused trigger draws dimmed — the door exists but is closed. */
  enabled?: boolean;
  icon: keyof typeof TRIGGER_ICON;
  /** Localized kind label — Zeitplan / Ereignis / Webhook / Manuell / Agent. */
  label: string;
  [key: string]: unknown;
}

export function TriggerNode({ data }: NodeProps & { data: TriggerNodeData }) {
  const Icon = TRIGGER_ICON[data.icon] ?? CalendarClock;
  return (
    <div
      className={cn(
        "ui-card-raised w-[260px]",
        data.enabled === false && "opacity-50"
      )}
      data-kind="trigger"
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon aria-hidden className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="font-medium text-[10px] text-muted-foreground/70 uppercase tracking-wider">
            {data.label}
          </span>
          {data.detail ? (
            <p className="truncate font-medium text-sm leading-tight">
              {data.detail}
            </p>
          ) : null}
        </div>
      </div>
      {/* Leaves to the RIGHT — the routine reads left to right. Invisible,
          like the canvas's own side anchors: the edge is the picture. */}
      <Handle
        className="!h-0 !w-0 !border-0 !bg-transparent"
        position={Position.Right}
        type="source"
      />
    </div>
  );
}

export interface DeliveryNodeData {
  /** What this delivery is for, when someone said. */
  description: string | null;
  enabled: boolean;
  id: string;
  /** Localized "Delivery" chip. */
  label: string;
  /** "Every run" / "When the run calls it". */
  modeLabel: string;
  /** What happens: "High-priority update", "Email", "Desk card". */
  title: string;
  [key: string]: unknown;
}

/** One thing that happens with a run's result. */
export function DeliveryNode({ data }: NodeProps & { data: DeliveryNodeData }) {
  return (
    <div
      // Emerald mixes into --card exactly like the gate's amber — a flat
      // bg-emerald-500/5 would go light-on-light in dark mode.
      className={cn(
        "ui-card-raised w-[260px] border-emerald-500/40",
        "bg-[color-mix(in_oklch,var(--card)_93%,#10b981)]",
        data.enabled === false && "opacity-60"
      )}
      data-kind="delivery"
    >
      <Handle
        className="!h-0 !w-0 !border-0 !bg-transparent"
        position={Position.Left}
        type="target"
      />
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
          <Send aria-hidden className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="font-medium text-[10px] text-emerald-700 uppercase tracking-wider dark:text-emerald-300">
            {data.label}
          </span>
          <p className="truncate font-medium text-foreground text-sm">
            {data.title}
          </p>
          {data.description ? (
            <p className="line-clamp-2 text-muted-foreground text-xs leading-relaxed">
              {data.description}
            </p>
          ) : null}
          <p className="text-[10px] text-muted-foreground">{data.modeLabel}</p>
        </div>
      </div>
    </div>
  );
}

/** The canvas vocabulary plus the routine's two framing kinds. */
export const routineNodeTypes = {
  ...workflowNodeTypes,
  delivery: DeliveryNode,
  trigger: TriggerNode,
};
