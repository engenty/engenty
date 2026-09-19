import { cn } from "@engenty/ui-core";
import { Check } from "lucide-react";
import {
  APP_BAR_POSITIONS,
  type AppBarPosition,
} from "../types/shell-app-bar-position";

const EDGE_LABELS: Record<AppBarPosition, string> = {
  left: "Left",
  top: "Top",
  right: "Right",
  bottom: "Bottom",
};

function EdgeButton({
  active,
  className,
  label,
  onSelect,
  position,
}: {
  active: boolean;
  className?: string;
  label: string;
  onSelect: (position: AppBarPosition) => void;
  position: AppBarPosition;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex items-center justify-center rounded-md border font-medium text-xs transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-accent",
        className
      )}
      onClick={() => onSelect(position)}
      type="button"
    >
      <span className="sr-only">{label}</span>
      {active ? <Check className="size-3.5 text-primary" /> : null}
    </button>
  );
}

/**
 * Four-edge control for pinning the app bar. Saves immediately via `onChange`.
 */
export function AppBarPositionPicker({
  onChange,
  value,
}: {
  onChange: (position: AppBarPosition) => void;
  value: AppBarPosition;
}) {
  return (
    <div className="space-y-2">
      <h3 className="font-medium text-sm">App bar position</h3>
      <p className="text-muted-foreground text-sm leading-snug">
        Pin the app bar to an edge of the screen. This is yours — it does not
        change the workspace default.
      </p>
      <div
        aria-label="App bar position"
        className="grid w-44 grid-cols-3 grid-rows-3 gap-1.5"
        role="group"
      >
        <div />
        <EdgeButton
          active={value === "top"}
          className="h-8"
          label={EDGE_LABELS.top}
          onSelect={onChange}
          position="top"
        />
        <div />
        <EdgeButton
          active={value === "left"}
          className="h-16 w-8 justify-self-end"
          label={EDGE_LABELS.left}
          onSelect={onChange}
          position="left"
        />
        <div
          aria-hidden
          className="rounded-md border border-border border-dashed bg-muted/40"
        />
        <EdgeButton
          active={value === "right"}
          className="h-16 w-8"
          label={EDGE_LABELS.right}
          onSelect={onChange}
          position="right"
        />
        <div />
        <EdgeButton
          active={value === "bottom"}
          className="h-8"
          label={EDGE_LABELS.bottom}
          onSelect={onChange}
          position="bottom"
        />
        <div />
      </div>
      <p className="text-muted-foreground text-xs">
        {EDGE_LABELS[value]}
        {APP_BAR_POSITIONS.includes(value) ? " edge" : ""}
      </p>
    </div>
  );
}
