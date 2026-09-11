import {
  deriveTrajectoryGantt,
  GANTT_LABEL_ROW_PX,
  GANTT_LANE_COUNT,
  GANTT_LANE_PAD_PX,
  GANTT_LANE_PITCH_PX,
  type TrajectoryCellKind,
  type TrajectoryGanttSpan,
  type TrajectoryRow,
  trajectoryRowAnchorId,
} from "@engenty/ag-ui-bridge";
import { cn } from "@engenty/ui-core";
import { useMemo } from "react";

const KIND_CLASS: Record<TrajectoryCellKind, string> = {
  assistant: "bg-violet-500",
  context: "bg-emerald-500",
  history: "bg-teal-500",
  system: "bg-muted-foreground/45",
  tool: "bg-amber-500",
  user: "bg-sky-500",
};

const GANTT_HEIGHT =
  GANTT_LABEL_ROW_PX +
  GANTT_LANE_PAD_PX * 2 +
  GANTT_LANE_COUNT * GANTT_LANE_PITCH_PX;

const LANE_KEYS = ["system", "user", "model", "tools"] as const;

function spanClassName(span: TrajectoryGanttSpan): string {
  if (span.kind === "history") {
    switch (span.keyLabel) {
      case "user":
      case "human":
        return KIND_CLASS.user;
      case "agent":
        return "bg-amber-500";
      case "assistant":
        return KIND_CLASS.assistant;
      case "signal":
        return "bg-fuchsia-500";
      default:
        return KIND_CLASS.history;
    }
  }
  return KIND_CLASS[span.kind];
}

function spanTitle(span: TrajectoryGanttSpan): string {
  const kind = span.keyLabel ?? span.kind.toUpperCase();
  return `${kind}  ${span.label}`;
}

export function TrajectoryGantt({
  hoveredId,
  labels = {
    model: "Model",
    system: "System",
    tools: "Tools",
    user: "User",
  },
  onHover,
  onSelect,
  rows,
  selectedId,
}: {
  hoveredId?: string | null;
  labels?: {
    model: string;
    system: string;
    tools: string;
    user: string;
  };
  onHover?: (rowId: string | null) => void;
  onSelect?: (rowId: string) => void;
  rows: readonly TrajectoryRow[];
  selectedId?: string | null;
}) {
  const model = useMemo(() => deriveTrajectoryGantt(rows), [rows]);
  if (!model) {
    return null;
  }
  const duration = Math.max(1, model.end - model.start);

  return (
    <section
      aria-label="Trajectory overview"
      className="overflow-hidden border-border-soft border-b bg-muted/20"
    >
      <div
        className="grid grid-cols-[3.25rem_minmax(0,1fr)]"
        style={{ height: GANTT_HEIGHT }}
      >
        <div
          aria-hidden
          className="relative border-border-soft border-r text-[10px] text-muted-foreground leading-none"
        >
          {LANE_KEYS.map((key, index) => (
            <span
              className="absolute right-1.5 flex h-2 items-center"
              key={key}
              style={{
                top:
                  GANTT_LABEL_ROW_PX +
                  GANTT_LANE_PAD_PX +
                  index * GANTT_LANE_PITCH_PX,
              }}
            >
              {labels[key]}
            </span>
          ))}
        </div>
        <div className="relative overflow-hidden">
          {model.turnBoundaries
            .filter((boundary) => boundary.time > model.start)
            .map((boundary) => (
              <span
                aria-hidden
                className="absolute inset-y-0 w-px bg-border"
                key={boundary.turn}
                style={{
                  left: `${((boundary.time - model.start) / duration) * 100}%`,
                }}
              />
            ))}
          {model.sectionLabels.map((section) => (
            <span
              aria-hidden
              className="absolute top-px z-[1] whitespace-nowrap font-medium font-mono text-[8px] text-muted-foreground uppercase tracking-wider"
              key={`${section.label}-${section.time}`}
              style={{
                left: `calc(${((section.time - model.start) / duration) * 100}% + 3px)`,
              }}
            >
              {section.label}
            </span>
          ))}
          <div
            className="absolute inset-x-0"
            style={{
              bottom: GANTT_LANE_PAD_PX,
              top: GANTT_LABEL_ROW_PX + GANTT_LANE_PAD_PX,
            }}
          >
            {model.spans.map((span) => (
              <GanttSpanButton
                hovered={span.id === hoveredId}
                key={span.id}
                onHover={onHover}
                onSelect={onSelect}
                selected={span.id === selectedId}
                span={span}
                start={model.start}
                width={duration}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function GanttSpanButton({
  hovered,
  onHover,
  onSelect,
  selected,
  span,
  start,
  width,
}: {
  hovered: boolean;
  onHover?: (rowId: string | null) => void;
  onSelect?: (rowId: string) => void;
  selected: boolean;
  span: TrajectoryGanttSpan;
  start: number;
  width: number;
}) {
  const left = ((span.start - start) / width) * 100;
  const spanWidth = ((span.end - span.start) / width) * 100;
  return (
    <button
      className={cn(
        "absolute h-2 min-w-0.5 cursor-pointer appearance-none rounded-[1px] border-0 p-0",
        spanClassName(span),
        selected && "ring-2 ring-sky-500 ring-offset-1 ring-offset-background",
        hovered &&
          !selected &&
          "ring-1 ring-sky-400/80 ring-offset-1 ring-offset-background"
      )}
      onClick={() => {
        onSelect?.(span.id);
        document
          .getElementById(trajectoryRowAnchorId(span.id))
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }}
      onMouseEnter={() => onHover?.(span.id)}
      onMouseLeave={() => onHover?.(null)}
      style={{
        left: `calc(${left}% + 1px)`,
        top: span.lane * GANTT_LANE_PITCH_PX,
        width: `max(2px, calc(${spanWidth}% - 2px))`,
      }}
      title={spanTitle(span)}
      type="button"
    />
  );
}
