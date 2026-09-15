/**
 * The one heading shape on the Space home.
 *
 * Both columns use it, which is what lines their first card up with each
 * other: the left column's Favoriten and the right column's Artefakte start
 * at the same y because they are the same element.
 *
 * Modules and Extensions also get the Work sidebar's hover chrome: a chevron
 * to fold the card, and a "+" to add. Those live on `group/section`.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

const headingClassName =
  "px-1 pt-5 pb-2 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider first:pt-0";

export function SpaceHomeSectionHeading({
  action,
  children,
  onOpenChange,
  open,
}: {
  action?: ReactNode;
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}) {
  const { t } = useTranslation("common");
  const collapsible = onOpenChange != null && open != null;

  if (!(collapsible || action)) {
    return <h2 className={headingClassName}>{children}</h2>;
  }

  return (
    <div className="flex items-center justify-between gap-1 px-1 pt-5 pb-2 first:pt-0">
      <div className="flex min-w-0 flex-1 items-center gap-0.5">
        <h2 className="min-w-0 truncate font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
          {children}
        </h2>
        {collapsible ? (
          <button
            aria-expanded={open}
            aria-label={
              open
                ? t("spaces.section.collapse", { defaultValue: "Collapse" })
                : t("spaces.section.expand", { defaultValue: "Expand" })
            }
            className={cn(
              "inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground",
              "hover:bg-muted hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
              "transition-opacity focus-visible:opacity-100 group-hover/section:opacity-100",
              open ? "opacity-0" : "opacity-100"
            )}
            onClick={() => onOpenChange(!open)}
            type="button"
          >
            <ChevronDown
              aria-hidden
              className={cn(
                "size-3.5 transition-transform",
                open ? "" : "-rotate-90"
              )}
            />
          </button>
        ) : null}
      </div>
      {action}
    </div>
  );
}
