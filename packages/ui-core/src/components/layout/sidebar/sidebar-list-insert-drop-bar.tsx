import { cn } from "../../../lib/utils";
import type { SidebarListInsertPlace } from "./sidebar-list-insert";

export function SidebarListInsertDropBar(props: {
  place: SidebarListInsertPlace;
  className?: string;
}) {
  const { place, className } = props;
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute right-1 left-1 z-20 h-0.5 rounded-full bg-primary ring-2 ring-background",
        place === "before" ? "top-0" : "bottom-0",
        className
      )}
    />
  );
}
