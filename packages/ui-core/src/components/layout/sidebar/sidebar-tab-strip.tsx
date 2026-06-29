import type { ReactNode } from "react";

import { cn } from "../../../lib/utils";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";

/**
 * The one standard tab strip for sidebar/secondary-nav columns across engenty.
 * Renders the compact, rounded `bg-muted` segmented control used to switch the
 * active view inside a sidebar (e.g. Agents · Sessions · Skills).
 *
 * Drop `SidebarTab` children inside — the grid layout is derived automatically:
 * text tabs share the available width equally, icon-only tabs (`icon`) take a
 * fixed slot. Always prefer this over hand-written Tailwind so every sidebar
 * stays visually identical.
 *
 * @example
 * <SidebarTabStrip onValueChange={setTab} value={tab}>
 *   <SidebarTab value="agents">{t("agents")}</SidebarTab>
 *   <SidebarTab value="sessions">{t("sessions")}</SidebarTab>
 *   <SidebarTab aria-label={t("favorites")} icon value="favorites">
 *     <Star className="size-3.5" />
 *   </SidebarTab>
 * </SidebarTabStrip>
 */
function SidebarTabStrip({
  children,
  className,
  onValueChange,
  value,
}: {
  children: ReactNode;
  className?: string;
  onValueChange?: (value: string) => void;
  value: string;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto pt-2 pr-1 pl-2 [&::-webkit-scrollbar]:hidden",
        className
      )}
      data-slot="sidebar-tab-strip"
    >
      <Tabs
        className="w-full min-w-0 gap-0"
        onValueChange={onValueChange}
        value={value}
      >
        <TabsList className="flex w-max min-w-full gap-1 rounded-md bg-muted p-1">
          {children}
        </TabsList>
      </Tabs>
    </div>
  );
}

/**
 * A single trigger inside {@link SidebarTabStrip}. Pass `icon` for icon-only
 * tabs so the strip gives it a fixed-width slot instead of an equal share.
 */
function SidebarTab({
  children,
  className,
  icon = false,
  ...props
}: TabsTriggerProps & { icon?: boolean }) {
  return (
    <TabsTrigger
      className={cn(
        "h-7 min-h-7 shrink-0 py-0 text-xs",
        icon ? "w-9 px-0" : "flex-1 px-2",
        className
      )}
      {...props}
    >
      {children}
    </TabsTrigger>
  );
}

type TabsTriggerProps = Parameters<typeof TabsTrigger>[0];

export { SidebarTab, SidebarTabStrip };
