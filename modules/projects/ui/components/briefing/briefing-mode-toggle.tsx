import { cn } from "@engenty/ui-core";
import type { ProjectsBriefingMode } from "../../api.js";

interface BriefingModeToggleProps {
  mode: ProjectsBriefingMode;
  onModeChange: (mode: ProjectsBriefingMode) => void;
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
    <div
      className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
      role="group"
    >
      <button
        className={cn(
          "rounded-md px-3 py-1.5 font-medium text-sm transition-colors",
          mode === "personal"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => onModeChange("personal")}
        type="button"
      >
        {personalLabel}
      </button>
      <button
        className={cn(
          "rounded-md px-3 py-1.5 font-medium text-sm transition-colors",
          mode === "oversight"
            ? "bg-background text-foreground shadow-sm"
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
