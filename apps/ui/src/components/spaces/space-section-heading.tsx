/**
 * Shared chrome for the Work tab's lists (Modules, Agents, People) and the
 * Data tab's root types (Contacts, Files, …).
 *
 * The heading is the label; the optional action is the hover "+" that adds
 * to that list. Hovering ANYWHERE in the section reveals it (`group/section`
 * lives on the section wrapper, not on this row), and keyboard users still
 * reach it: the control stays in the tab order and `focus-visible` brings it
 * back. Named so nested row `group/row` hovers do not light every ⋮.
 * A picker that is open also keeps it painted (`data-open` /
 * `data-popup-open`), so the trigger does not vanish under the pointer the
 * moment the popover appears.
 *
 * When `to` is set the label is a link (Agents → `/s/<key>/agents`). Collapse
 * is a separate chevron so the two gestures cannot fight — same split the
 * knowledge-base tree uses (`SidebarExpandChevronButton` vs the row link).
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { ChevronDown, Plus } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router-dom";

export function SpaceSectionHeading({
  action,
  active = false,
  children,
  onOpenChange,
  open,
  to,
}: {
  action?: ReactNode;
  /** The linked heading is the current page (the Agents roster). */
  active?: boolean;
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  to?: string;
}) {
  const { t } = useTranslation("common");
  const collapsible = onOpenChange != null && open != null;
  const labelClassName = cn(
    "min-w-0 truncate font-medium text-xs uppercase tracking-wide",
    active ? "text-foreground" : "text-muted-foreground",
    to
      ? "rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      : null
  );

  return (
    <div className="flex items-center justify-between gap-2 px-2 pb-1">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {to ? (
          <Link
            aria-current={active ? "page" : undefined}
            className={labelClassName}
            to={to}
          >
            {children}
          </Link>
        ) : (
          <p className={labelClassName}>{children}</p>
        )}
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
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
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

export function SpaceSectionAddButton({
  asChild = false,
  children,
  className,
  ref,
  ...props
}: ComponentProps<typeof Button> & { "aria-label": string }) {
  return (
    <Button
      asChild={asChild}
      ref={ref}
      variant="ghost"
      {...props}
      className={cn(
        "size-5 shrink-0 p-0 text-muted-foreground opacity-0 transition-opacity",
        "hover:text-foreground focus-visible:opacity-100",
        "group-focus-within/section:opacity-100 group-hover/section:opacity-100",
        "data-[state=open]:opacity-100 data-open:opacity-100 data-popup-open:opacity-100",
        className
      )}
      type={asChild ? undefined : "button"}
    >
      {asChild ? children : <Plus className="size-3.5" />}
    </Button>
  );
}

export interface SpaceSectionAddItem {
  icon?: ReactNode;
  id: string;
  label: string;
  onSelect: () => void;
  /** Draw a divider above this row (folder vs types, …). */
  separatorBefore?: boolean;
}

/**
 * Hover "+" that either fires the only action, or opens a menu.
 *
 * A menu of one is friction for no information. Files (Folder / Upload /
 * Connect) and Artifacts (Folder / Page / types) share this chrome.
 */
export function SpaceSectionAddMenu({
  disabled = false,
  items,
  label,
}: {
  disabled?: boolean;
  items: readonly SpaceSectionAddItem[];
  label: string;
}) {
  if (items.length === 0) {
    return null;
  }
  if (items.length === 1) {
    const item = items[0];
    if (!item) {
      return null;
    }
    return (
      <SpaceSectionAddButton
        aria-label={item.label}
        disabled={disabled}
        onClick={item.onSelect}
      />
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SpaceSectionAddButton aria-label={label} disabled={disabled} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        {items.map((item) => (
          <div key={item.id}>
            {item.separatorBefore ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onSelect={item.onSelect}>
              {item.icon}
              {item.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
