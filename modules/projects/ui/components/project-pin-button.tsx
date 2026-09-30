import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, DropdownMenuItem } from "@engenty/ui-core";
import { Pin, PinOff } from "lucide-react";
import { useToggleProjectPin } from "../lib/project-pins.js";

/** Pins the project onto its space's Work sidebar and home. */
export function ProjectPinButton({ projectId }: { projectId: string }) {
  const { t } = useTranslation("projects");
  const { isPinned, toggle } = useToggleProjectPin(projectId);
  const label = isPinned ? t("pins.unpin") : t("pins.pin");

  return (
    <Button
      aria-label={label}
      aria-pressed={isPinned}
      className="h-8 w-8 p-0"
      onClick={toggle}
      size="sm"
      title={label}
      variant="outline"
    >
      <Pin className={cn("h-3.5 w-3.5", isPinned && "fill-current")} />
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
  const Icon = isPinned ? PinOff : Pin;

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
