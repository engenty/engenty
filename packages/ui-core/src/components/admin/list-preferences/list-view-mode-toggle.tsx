import { LayoutGrid, List } from "lucide-react";
import { cn } from "../../../lib/utils";
import { ListIconSegmentToggle } from "../../ui/list-toolbar";
import type { ViewMode } from "./list-display-configurator";

export interface ListViewModeToggleProps {
  className?: string;
  labels: {
    cards: string;
    group?: string;
    table: string;
  };
  onChange: (mode: ViewMode) => void;
  value: ViewMode;
}

/**
 * Compact list/table vs cards switch for admin list toolbars.
 * Pairs with {@link ListDisplayConfigurator} — both should bind the same `ViewMode` state.
 */
export function ListViewModeToggle({
  className,
  labels,
  onChange,
  value,
}: ListViewModeToggleProps) {
  return (
    <ListIconSegmentToggle
      aria-label={labels.group}
      className={cn("shrink-0", className)}
      onChange={(next) => {
        if (next !== "") {
          onChange(next);
        }
      }}
      // Cards first: it is the default view on the catalogs that use this, and
      // a toggle whose first segment isn't the default reads as "you are on the
      // second option" at a glance.
      segments={[
        { value: "cards", label: labels.cards, icon: LayoutGrid },
        { value: "table", label: labels.table, icon: List },
      ]}
      value={value}
    />
  );
}
