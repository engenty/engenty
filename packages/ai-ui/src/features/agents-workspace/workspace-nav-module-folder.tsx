import { cn } from "@engenty/ui-core";
import { ChevronDown, type LucideIcon, Plug } from "lucide-react";
import type { ReactNode } from "react";

export function WorkspaceNavModuleFolder({
  children,
  icon: Icon = Plug,
  label,
  moduleId,
  onToggle,
  open,
}: {
  children: ReactNode;
  icon?: LucideIcon;
  label?: string;
  moduleId: string;
  onToggle: () => void;
  open: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <button
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-1 rounded-sm py-1 pr-1 pl-0.5 text-left font-medium text-[11px] text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
        onClick={onToggle}
        type="button"
      >
        <ChevronDown
          aria-hidden
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform duration-200",
            open ? "rotate-0" : "-rotate-90"
          )}
          strokeWidth={1.75}
        />
        <Icon
          aria-hidden
          className="size-3 shrink-0 opacity-80"
          strokeWidth={1.75}
        />
        <span className="min-w-0 flex-1 truncate">{label ?? moduleId}</span>
      </button>
      {open ? (
        <div className="ml-2 flex flex-col gap-1.5 border-border-soft border-l pl-1.5">
          {children}
        </div>
      ) : null}
    </div>
  );
}
