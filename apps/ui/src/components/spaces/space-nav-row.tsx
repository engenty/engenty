/**
 * One row in the space Work list. Padding matches the heading's `px-2` so
 * labels, headings and icons all sit on one left edge; the radius is the 8px
 * used by the active tab, so nothing in the column invents a third corner size.
 */
import { cn } from "@engenty/ui-core";
import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";

export function formatNavCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function NavCountBadge({
  className,
  count,
}: {
  className?: string;
  count: number;
}) {
  if (count <= 0) {
    return null;
  }
  return (
    <span
      className={cn(
        "flex h-3.5 min-w-3.5 shrink-0 items-center justify-center rounded-full bg-primary px-0.5 font-semibold text-[9px] text-primary-foreground leading-none",
        className
      )}
    >
      {formatNavCount(count)}
    </span>
  );
}

export function SpaceNavRow({
  active,
  badge,
  href,
  icon: Icon,
  label,
  leading,
}: {
  active: boolean;
  badge?: number;
  href: string;
  icon?: ComponentType<{ className?: string }>;
  label: string;
  /** Custom mark (Copilot's Engenty) instead of a dock icon. */
  leading?: ReactNode;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        // Full contrast on every row, weight for the active one — the same rule
        // the Data tree follows, so the two tabs do not disagree about how a
        // list of the space's own things looks. Muted grey read as disabled on
        // what is in fact the whole point of the Work tab; the filled row was
        // already saying "this one", so the darker text was saying it twice.
        "group/item flex items-center gap-2 rounded-[8px] px-2 py-0.5 text-foreground text-sm transition",
        active ? "bg-muted font-semibold" : "hover:bg-muted/60"
      )}
      to={href}
    >
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center overflow-visible text-foreground"
      >
        {leading ??
          (Icon ? (
            // Same dock icon as the primary app sidebar. Its SVG owns the
            // Ember/Moss/Cobalt fills; do not recolor from ids here.
            <Icon className="size-5 transition-transform duration-200 ease-out group-hover/item:scale-110" />
          ) : null)}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge ? (
        <NavCountBadge className="h-4 min-w-4 text-[10px]" count={badge} />
      ) : null}
    </Link>
  );
}
