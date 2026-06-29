import { ChevronRight } from "lucide-react";
import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { cn } from "../../../lib/utils";

export interface SidebarExpandChevronButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "type" | "children" | "aria-expanded" | "aria-label" | "onClick"
  > {
  ariaLabelCollapsed: string;
  ariaLabelExpanded: string;
  isOpen: boolean;
  onPressToggle: (event: MouseEvent<HTMLButtonElement>) => void;
}

export function SidebarExpandChevronButton({
  isOpen,
  ariaLabelExpanded,
  ariaLabelCollapsed,
  onPressToggle,
  className,
  ...rest
}: SidebarExpandChevronButtonProps) {
  return (
    <button
      aria-expanded={isOpen}
      aria-label={isOpen ? ariaLabelExpanded : ariaLabelCollapsed}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
        className
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPressToggle(e);
      }}
      type="button"
      {...rest}
    >
      <ChevronRight
        aria-hidden
        className={cn("size-3.5 transition-transform", isOpen && "rotate-90")}
      />
    </button>
  );
}
