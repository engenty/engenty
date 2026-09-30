import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, DropdownMenuItem } from "@engenty/ui-core";
import { Star, StarOff } from "lucide-react";
import { useToggleProjectPin } from "../lib/project-pins.js";

/**
 * The star beside the project title (breadcrumb and header): starring lists
 * the project under its space's Favoriten. Starred, it is always shown,
 * filled; unstarred, it stays hidden until the caller's hover group
 * (`revealClassName`) shows it empty, ready to click.
 */
export function ProjectStarButton({
  projectId,
  revealClassName,
}: {
  projectId: string;
  /** Hover-group class that reveals the empty star, e.g. `group-hover/header:opacity-100`. */
  revealClassName: string;
}) {
  const { t } = useTranslation("projects");
  const { isPinned, toggle } = useToggleProjectPin(projectId);
  const label = isPinned ? t("pins.unpin") : t("pins.pin");

  return (
    <Button
      aria-label={label}
      aria-pressed={isPinned}
      className={cn(
        "size-7 shrink-0 p-0 text-inherit hover:bg-current/10 hover:text-inherit",
        !isPinned &&
          cn(
            "opacity-0 transition-opacity focus-visible:opacity-100",
            revealClassName
          )
      )}
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      size="icon"
      title={label}
      type="button"
      variant="ghost"
    >
      <Star
        className={cn(
          "size-4",
          isPinned ? "fill-amber-400 text-amber-400" : "opacity-70"
        )}
      />
    </Button>
  );
}

/** The same toggle as a row-menu entry (list, cards, sidebar). */
export function ProjectPinMenuItem({
  className,
  iconClassName = "mr-2 h-4 w-4",
  projectId,
}: {
  className?: string;
  iconClassName?: string;
  projectId: string;
}) {
  const { t } = useTranslation("projects");
  const { isPinned, toggle } = useToggleProjectPin(projectId);
  const Icon = isPinned ? StarOff : Star;

  return (
    <DropdownMenuItem
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
    >
      <Icon className={iconClassName} />
      {isPinned ? t("pins.unpin") : t("pins.pin")}
    </DropdownMenuItem>
  );
}
