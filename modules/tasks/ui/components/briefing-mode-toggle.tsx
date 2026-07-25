import { cn } from "@engenty/ui-core";
import type { TasksBriefingMode } from "../../src/schema/types.js";

interface BriefingModeToggleProps {
  mode: TasksBriefingMode;
  onModeChange: (mode: TasksBriefingMode) => void;
  oversightLabel: string;
  personalLabel: string;
}

export function BriefingModeToggle({
  mode,
  onModeChange,
  oversightLabel,
  personalLabel,
}: BriefingModeToggleProps) {
  return (
    <div className="inline-flex rounded-full bg-muted/70 p-0.5" role="group">
      <button
        aria-pressed={mode === "personal"}
        className={cn(
          "rounded-full px-3 py-1.5 font-medium text-xs transition-colors",
          mode === "personal"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => onModeChange("personal")}
        type="button"
      >
        {personalLabel}
      </button>
      <button
        aria-pressed={mode === "oversight"}
        className={cn(
          "rounded-full px-3 py-1.5 font-medium text-xs transition-colors",
          mode === "oversight"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => onModeChange("oversight")}
        type="button"
      >
        {oversightLabel}
      </button>
    </div>
  );
}
