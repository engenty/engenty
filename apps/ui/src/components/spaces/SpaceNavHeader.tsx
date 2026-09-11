/**
 * The space's name tile — used on the space home card and as the sidebar
 * identity row. Switching lives on the rail (current tile opens the chooser);
 * this is identity, not a control.
 */
import { SpaceIconFace } from "@engenty/app-shell";
import { cn } from "@engenty/ui-core";
import { Link } from "react-router-dom";

export function SpaceNavTile({
  color,
  icon,
  name,
  size = "md",
}: {
  color?: string | null;
  icon?: string | null;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden font-semibold text-white",
        size === "sm"
          ? "size-5 rounded text-[9px]"
          : size === "xl"
            ? "size-12 rounded-[12px] text-[18px]"
            : size === "lg"
              ? "size-10 rounded-[10px] text-[15px]"
              : "size-7 rounded-[6px] text-[11px]"
      )}
      // The space's own colour, when it has one — the rail uses the same value,
      // so the tile you clicked and the header you land on match.
      style={{ backgroundColor: color || "var(--primary)" }}
    >
      <SpaceIconFace icon={icon} name={name} />
    </span>
  );
}

/** Non-clickable space name for the column header — space home and inside a module. */
export function SpaceNavTitle({
  color,
  icon,
  name,
}: {
  color?: string | null;
  icon?: string | null;
  name: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <SpaceNavTile color={color} icon={icon} name={name} size="sm" />
      <span className="min-w-0 truncate font-medium text-sm">{name}</span>
    </div>
  );
}

/**
 * Space identity in the collapsed topbar trail. The name hides on small
 * screens and when the trail marks itself crowded (`data-trail-crowded`) so
 * a long path keeps the tile and drops the words.
 */
export function SpaceNavCrumb({
  color,
  icon,
  name,
  to,
}: {
  color?: string | null;
  icon?: string | null;
  name: string;
  to: string;
}) {
  return (
    <Link className="flex min-w-0 items-center gap-1.5 text-foreground" to={to}>
      <SpaceNavTile color={color} icon={icon} name={name} size="sm" />
      <span className="min-w-0 truncate font-medium text-sm max-md:hidden [[data-trail-crowded]_&]:hidden">
        {name}
      </span>
    </Link>
  );
}
