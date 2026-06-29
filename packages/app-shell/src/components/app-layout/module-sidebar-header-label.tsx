/**
 * Static module label for the shell secondary nav column header slot.
 *
 * Renders the module icon + translated label (e.g. 🧑‍🤝‍🧑 Team) next to the
 * toggle / pin button. Modules that need a chooser (e.g. KB picker) provide
 * their own `secondaryNavHeaderSlot` instead of using this component.
 */

import type { UiIconComponent } from "@engenty/ui-plugin-sdk";
import { Link } from "react-router-dom";

export interface ModuleSidebarHeaderLabelProps {
  /** Module dock icon component. */
  icon?: UiIconComponent;
  /** Translated module label text (e.g. `t("menu")`). */
  label: string;
  /** Navigate to the module root when clicking the label. */
  to?: string;
}

export function ModuleSidebarHeaderLabel({
  icon: Icon,
  label,
  to,
}: ModuleSidebarHeaderLabelProps) {
  const content = (
    <span className="flex min-w-0 items-center gap-1.5">
      {Icon ? (
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      ) : null}
      <span className="min-w-0 flex-1 truncate font-semibold text-foreground text-sm">
        {label}
      </span>
    </span>
  );

  if (to) {
    return (
      <Link
        className="min-w-0 rounded-sm transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        to={to}
      >
        {content}
      </Link>
    );
  }

  return content;
}
