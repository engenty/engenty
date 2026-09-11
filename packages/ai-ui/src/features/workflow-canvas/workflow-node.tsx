// The node visual language.
//
// The design goal is that someone who has never seen this screen can read a
// flow in about five seconds and answer two questions: what does it do, and
// where does it stop for me? So:
//
//   · Work nodes are calm rectangles. They are the majority and should recede.
//   · GATES look different in kind, not degree — a full-width amber bar with a
//     shield, spanning the flow like a barrier. Scanning a graph for "where do
//     humans decide?" must be a glance, not a read.
//   · WAITS are dashed and quiet: nothing is happening, and the border says so.
//   · PROBLEMS live on the node that has them, never in a side console. A
//     missing capability is a property of that step.
//   · RUN STATE overlays the same shapes rather than a different view, because
//     the definition and the run are the same picture.
import { cn } from "@engenty/ui-core";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Bot,
  Check,
  CircleDot,
  Clock,
  FileInput,
  FileOutput,
  FileText,
  GitBranch,
  Layers,
  LayoutTemplate,
  Loader2,
  Moon,
  PenLine,
  Repeat,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import type { CanvasNodeData, CanvasNodeKind } from "./graph-model.js";

/** Per-node run state, overlaid in monitor mode. */
export type NodeRunState =
  | "idle"
  | "running"
  | "done"
  | "waiting-approval"
  | "sleeping"
  | "failed"
  | "skipped";

export interface WorkflowStepNodeProblem {
  code: string;
  message: string;
  severity: "error" | "warning";
}

export interface WorkflowStepNodeExtras {
  problems?: WorkflowStepNodeProblem[];
  runDetail?: string;
  runState?: NodeRunState;
  selected?: boolean;
}

// Exported so anything drawing a step outside the canvas — the routine
// diagram — speaks the same vocabulary. Two pictures of one flow must not
// disagree about what a node is called.
export const KIND_ICON: Record<CanvasNodeKind, typeof Bot> = {
  agent: Bot,
  apply: PenLine,
  artifact: FileText,
  branch: GitBranch,
  gate: ShieldCheck,
  input: FileInput,
  loop: Repeat,
  output: FileOutput,
  parallel: Layers,
  render: LayoutTemplate,
  subaction: Layers,
  tool: Wrench,
  transform: ArrowRightLeft,
  unknown: CircleDot,
  wait: Clock,
};

/**
 * Short role label above each title. "Agent" is the one that matters most —
 * it's the only kind that costs a model turn and can vary between runs.
 */
export const KIND_CHIP: Record<CanvasNodeKind, string> = {
  agent: "Agent",
  apply: "Write",
  artifact: "Artifact",
  branch: "Branch",
  gate: "Approval",
  input: "Input",
  loop: "For each",
  output: "Result",
  parallel: "Parallel",
  render: "Show",
  subaction: "Workflow",
  tool: "Tool",
  transform: "Transform",
  unknown: "Step",
  wait: "Wait",
};

const RUN_STATE_ICON: Partial<Record<NodeRunState, typeof Bot>> = {
  done: Check,
  failed: X,
  running: Loader2,
  sleeping: Moon,
  "waiting-approval": ShieldCheck,
};

function runStateClasses(state: NodeRunState | undefined): string {
  switch (state) {
    case "running":
      return "border-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_18%,transparent)]";
    case "done":
      return "border-emerald-500/60";
    case "waiting-approval":
      return "border-amber-500 shadow-[0_0_0_3px_color-mix(in_oklch,var(--warning,#f59e0b)_18%,transparent)]";
    case "sleeping":
      return "border-sky-500/50";
    case "failed":
      return "border-destructive";
    case "skipped":
      return "opacity-45";
    default:
      return "";
  }
}

function runStateLabel(state: NodeRunState | undefined): string | undefined {
  switch (state) {
    case "running":
      return "Running";
    case "done":
      return "Done";
    case "waiting-approval":
      return "Waiting on you";
    case "sleeping":
      return "Sleeping";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    default:
      return;
  }
}

export type WorkflowStepNodeProps = NodeProps & {
  data: CanvasNodeData & WorkflowStepNodeExtras;
};

export function WorkflowStepNode({ data, selected }: WorkflowStepNodeProps) {
  const kind = data.kind;
  const Icon = KIND_ICON[kind];
  const problems = data.problems ?? [];
  const hasError = problems.some((problem) => problem.severity === "error");
  const hasWarning = problems.some((problem) => problem.severity === "warning");
  const RunIcon = RUN_STATE_ICON[data.runState ?? "idle"];
  const isGate = kind === "gate";
  const isWait = kind === "wait";

  return (
    <div
      className={cn(
        "ui-card-raised w-[260px]",
        // Tints MIX INTO the card colour rather than replacing it. A flat
        // `bg-amber-500/6` would override `bg-card` and leave the node light in
        // dark mode; mixing keeps it a card that happens to lean amber, in
        // whichever theme the viewer is using.
        isGate &&
          "border-2 border-amber-500/70 bg-[color-mix(in_oklch,var(--card)_92%,#f59e0b)]",
        isWait &&
          "border-dashed bg-[color-mix(in_oklch,var(--card)_94%,var(--muted-foreground))]",
        hasError && "border-destructive",
        !hasError && hasWarning && "border-amber-500/70",
        runStateClasses(data.runState),
        selected && "ui-card-selected"
      )}
      data-kind={kind}
      data-run-state={data.runState ?? "idle"}
    >
      <Handle
        className="!h-2 !w-2 !border-2 !border-background !bg-muted-foreground"
        position={Position.Top}
        type="target"
      />
      {/* Side anchors, used ONLY by a loop's return edge. Routing that edge
          between the normal top/bottom handles makes it travel straight back up
          through the nodes it just left — it collapses into the forward line and
          disappears. Leaving sideways is what makes a loop look like a loop.
          Invisible because nothing else connects here. */}
      <Handle
        className="!h-0 !w-0 !border-0 !bg-transparent"
        id="loop-out"
        position={Position.Right}
        type="source"
      />
      <Handle
        className="!h-0 !w-0 !border-0 !bg-transparent"
        id="loop-in"
        position={Position.Right}
        type="target"
      />
      {/* Left anchor, used ONLY by the routine picture: triggers fan into the
          first step from the side, because that view reads left to right.
          Inside a flow every edge still uses top/bottom. */}
      <Handle
        className="!h-0 !w-0 !border-0 !bg-transparent"
        id="side-in"
        position={Position.Left}
        type="target"
      />

      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <span
          className={cn(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md",
            isGate
              ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
              : "bg-muted text-muted-foreground"
          )}
        >
          <Icon aria-hidden className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          {/* The kind chip carries what the icon alone can't: at a glance, is
              this a model turn (costs money, can vary) or a deterministic
              step? That distinction is the whole premise of graph actions. */}
          <span
            className={cn(
              "font-medium text-[10px] uppercase tracking-wider",
              isGate
                ? "text-amber-700 dark:text-amber-300"
                : "text-muted-foreground/70"
            )}
          >
            {data.chip ?? KIND_CHIP[kind]}
          </span>
          <div className="flex items-center gap-1.5">
            <p className="truncate font-medium text-sm leading-tight">
              {data.title}
            </p>
            {RunIcon ? (
              <RunIcon
                aria-label={runStateLabel(data.runState)}
                className={cn(
                  "size-3.5 shrink-0",
                  data.runState === "running" && "animate-spin text-primary",
                  data.runState === "done" && "text-emerald-600",
                  data.runState === "failed" && "text-destructive",
                  data.runState === "sleeping" && "text-sky-500",
                  data.runState === "waiting-approval" && "text-amber-500"
                )}
              />
            ) : null}
          </div>
          {data.subtitle ? (
            <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs leading-snug">
              {data.subtitle}
            </p>
          ) : null}
          {data.runDetail ? (
            <p className="mt-1 font-medium text-[11px] text-muted-foreground">
              {data.runDetail}
            </p>
          ) : null}
        </div>
      </div>

      {problems.length > 0 ? (
        <ul className="space-y-1 border-t px-3 py-2">
          {problems.map((problem) => (
            <li
              className={cn(
                "flex items-start gap-1.5 text-[11px] leading-snug",
                problem.severity === "error"
                  ? "text-destructive"
                  : "text-amber-600 dark:text-amber-400"
              )}
              key={`${problem.code}-${problem.message}`}
            >
              <AlertTriangle aria-hidden className="mt-px size-3 shrink-0" />
              <span>{problem.message}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <Handle
        className="!h-2 !w-2 !border-2 !border-background !bg-muted-foreground"
        position={Position.Bottom}
        type="source"
      />
    </div>
  );
}

export const workflowNodeTypes = { step: WorkflowStepNode };
