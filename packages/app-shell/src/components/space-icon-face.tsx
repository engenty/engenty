import { cn } from "@engenty/ui-core";
import { isSpaceImageIcon, railSpaceInitials } from "../lib/rail-spaces";

/**
 * The glyph (or picture) inside a space tile — rail, switcher, and the
 * appearance trigger share this so a megaphone on the rail cannot become
 * initials in the header.
 */
export function SpaceIconFace({
  className,
  icon,
  name,
}: {
  className?: string;
  icon?: string | null;
  name: string;
}) {
  if (isSpaceImageIcon(icon)) {
    return (
      <img
        alt=""
        className={cn("size-full rounded-[inherit] object-cover", className)}
        draggable={false}
        height={36}
        src={icon}
        width={36}
      />
    );
  }
  return (
    <span aria-hidden className={className}>
      {icon || railSpaceInitials(name)}
    </span>
  );
}
