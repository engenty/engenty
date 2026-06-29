import {
  cn,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@engenty/ui-core";
import { DockEngentyIcon } from "@engenty/ui-icons";
import { Search } from "lucide-react";
import { type CSSProperties, type ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useShellSecondaryNav } from "../context/shell-secondary-nav-context";
import { matchesPath } from "../lib/navigation";
import type {
  NavigationItem,
  NavigationSection,
  ShellSidebarConfig,
} from "../types/shell";
import { SidebarTenantSwitcher } from "./sidebar-tenant-switcher";

type AppSidebarSurface = "rail" | "panel";

interface AppSidebarProps {
  className?: string;
  compact?: boolean;
  footer?: ReactNode;
  /** Fired when hovering a compact-mode icon that has secondary-nav children. */
  onItemHoverEnter?: (item: NavigationItem) => void;
  onItemHoverLeave?: () => void;
  onNavigate?: () => void;
  sections: NavigationSection[];
  shell: ShellSidebarConfig;
  sidebarWidth?: number;
  style?: CSSProperties;
  /** Light navigation panel (mobile sheet) vs compact brand rail (desktop). */
  surface?: AppSidebarSurface;
}

export function AppSidebar({
  sections,
  compact = false,
  onItemHoverEnter,
  onItemHoverLeave,
  onNavigate,
  shell,
  footer,
  surface = "rail",
  className,
  style,
  sidebarWidth,
}: AppSidebarProps) {
  const { pathname, search } = useLocation();
  const { hasSecondaryNav } = useShellSecondaryNav();
  const [switchingTenant, setSwitchingTenant] = useState(false);
  const [adminRailExpanded, setAdminRailExpanded] = useState(false);
  const isPanel = surface === "panel";
  const iconScale = sidebarWidth && sidebarWidth < 64 ? sidebarWidth / 64 : 1;

  function isExternal(to: string, explicit?: boolean) {
    return (
      explicit === true || to.startsWith("http://") || to.startsWith("https://")
    );
  }

  const baseItemClass = cn(
    "group/item flex w-full items-center gap-2 rounded-md py-2 text-sm transition-colors",
    isPanel
      ? "text-foreground hover:bg-muted hover:text-foreground"
      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    compact ? "justify-center px-0" : "px-2"
  );

  const adminSectionIndex = sections.findIndex((s) =>
    s.items.some((i) => i.to === "/settings")
  );
  const adminSection =
    adminSectionIndex >= 0 ? sections[adminSectionIndex] : null;
  const mainSections =
    adminSectionIndex >= 0
      ? sections
          .slice(0, adminSectionIndex)
          .concat(sections.slice(adminSectionIndex + 1))
      : sections;

  const settingsItem = adminSection?.items.find((i) => i.to === "/settings");
  const otherAdminItems =
    adminSection?.items.filter((i) => i.to !== "/settings") ?? [];

  const renderItem = (item: NavigationItem, inFlyout = false) => {
    const mode = shell.dockLabelMode ?? "tooltip";
    const isDockGrow = mode === "dock-grow" && compact && !inFlyout;

    const Icon = item.icon;
    const active =
      matchesPath(pathname, search, item.to) ||
      !!item.children?.some((child) => matchesPath(pathname, search, child.to));
    const itemExternal = isExternal(item.to, item.external);

    // In flyout or non-compact, we show the label.
    const showLabel = inFlyout || !compact;

    const itemClass = cn(
      baseItemClass,
      active &&
        (isPanel
          ? "bg-muted font-medium text-foreground"
          : "bg-sidebar-accent font-medium text-sidebar-accent-foreground"),
      inFlyout && "min-w-[140px] justify-start px-2",
      isDockGrow && "group/item-grow"
    );

    const content = (
      <>
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center transition-transform duration-200 ease-out group-hover/item:scale-110",
            isDockGrow && "group-hover/item-grow:scale-125"
          )}
          style={{
            transform: iconScale < 1 ? `scale(${iconScale})` : undefined,
          }}
        >
          <Icon className="size-full" />
        </span>
        {showLabel && <span>{item.label}</span>}
      </>
    );

    const itemStyle: CSSProperties = {
      paddingTop: `${8 * iconScale}px`,
      paddingBottom: `${8 * iconScale}px`,
    };

    const element = itemExternal ? (
      <a
        className={itemClass}
        href={item.to}
        onClick={onNavigate}
        style={itemStyle}
      >
        {content}
      </a>
    ) : (
      <Link
        className={itemClass}
        onClick={onNavigate}
        style={itemStyle}
        to={item.to}
      >
        {content}
      </Link>
    );

    if (compact && !inFlyout) {
      const hasChildNav =
        onItemHoverEnter &&
        ((item.children != null && item.children.length > 0) ||
          (active && hasSecondaryNav));
      const itemHoverProps = hasChildNav
        ? {
            onMouseEnter: () => onItemHoverEnter(item),
            onMouseLeave: () => onItemHoverLeave?.(),
          }
        : {};

      if (mode === "flyout") {
        return (
          <div
            className="group/flyout relative"
            key={item.to}
            {...itemHoverProps}
          >
            {element}
            <div className="pointer-events-none absolute top-1/2 left-full z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border bg-popover px-3 py-1.5 font-medium text-popover-foreground text-sm opacity-0 shadow-md transition-opacity group-hover/flyout:opacity-100">
              {item.label}
            </div>
          </div>
        );
      }
      if (mode === "none") {
        return (
          <div key={item.to} {...itemHoverProps}>
            {element}
          </div>
        );
      }
      return (
        <div key={item.to} {...itemHoverProps}>
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>{element}</TooltipTrigger>
            <TooltipContent side="right" sideOffset={12}>
              {item.label}
            </TooltipContent>
          </Tooltip>
        </div>
      );
    }

    return <div key={item.to}>{element}</div>;
  };

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "flex h-full flex-col",
          isPanel
            ? "bg-card text-foreground"
            : "border-sidebar-border border-r bg-sidebar text-sidebar-foreground",
          compact ? "w-16 shrink-0" : "w-full",
          className
        )}
        style={style}
      >
        <div className={cn("space-y-2", compact ? "px-2 py-3" : "px-3 py-2")}>
          {shell.tenantSwitcher ? (
            <SidebarTenantSwitcher
              availableTenants={shell.tenantSwitcher.availableTenants}
              brandLabel={shell.tenantSwitcher.brandLabel}
              canSwitchTenant={shell.tenantSwitcher.canSwitchTenant}
              compact={compact}
              currentTenant={shell.tenantSwitcher.currentTenant}
              noTenantLabel={shell.tenantSwitcher.noTenantLabel}
              onSwitchTenant={async (tenantId) => {
                setSwitchingTenant(true);
                try {
                  await shell.tenantSwitcher?.onSwitchTenant(tenantId);
                } finally {
                  setSwitchingTenant(false);
                }
              }}
              planLabel={shell.tenantSwitcher.planLabel}
              sidebarWidth={sidebarWidth}
              surface={surface}
              switchingTenant={switchingTenant}
              switchTenantAriaLabel={shell.tenantSwitcher.switchTenantAriaLabel}
            />
          ) : (
            <div
              className={cn(
                "flex items-center",
                compact ? "justify-center" : "gap-3 px-2 py-1"
              )}
            >
              <div
                className="flex size-7.5 shrink-0 items-center justify-center rounded-xl border border-sidebar-primary/30 bg-sidebar-primary/15 p-1"
                style={{
                  transform: iconScale < 1 ? `scale(${iconScale})` : undefined,
                }}
              >
                <DockEngentyIcon aria-hidden className="size-full" />
              </div>
              {!compact && (
                <div className="min-w-0">
                  <p className="truncate font-semibold text-sm">
                    {shell.appTitle}
                  </p>
                  <p
                    className={cn(
                      "text-xs",
                      isPanel
                        ? "text-muted-foreground"
                        : "text-sidebar-foreground/55"
                    )}
                  >
                    {shell.appSubtitle}
                  </p>
                </div>
              )}
            </div>
          )}

          {!compact && (
            <button
              className={cn(
                "flex h-10 w-full items-center gap-2 rounded-xl border px-3 text-sm shadow-sm",
                isPanel
                  ? "border-border bg-muted/40 text-muted-foreground"
                  : "border-sidebar-border bg-card/90 text-sidebar-foreground/85 backdrop-blur-[2px]"
              )}
              type="button"
            >
              <Search className="size-3.5" />
              <span className="flex-1 text-left">
                {shell.searchPlaceholder}
              </span>
              {shell.searchShortcut ? (
                <kbd className="rounded border px-1.5 text-xxs">
                  {shell.searchShortcut}
                </kbd>
              ) : null}
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-1">
          {mainSections.map((section, index) => {
            const sectionKey = section.label ?? `section-${index}`;
            return (
              <div className="mb-2" key={sectionKey}>
                {!compact && section.label && (
                  <p
                    className={cn(
                      "mb-1 px-2 text-xxs uppercase tracking-[0.1em]",
                      isPanel
                        ? "text-muted-foreground"
                        : "text-sidebar-foreground/55"
                    )}
                  >
                    {section.label}
                  </p>
                )}
                <div className="space-y-1">
                  {section.items.map((item) => renderItem(item, false))}
                </div>
                {index < mainSections.length - 1 && (
                  <Separator
                    className={cn(
                      "mx-auto mt-3 mb-1 w-8",
                      isPanel ? "bg-border/80" : "bg-sidebar-border/80"
                    )}
                  />
                )}
              </div>
            );
          })}
        </nav>

        {adminSection && (
          <div className="mt-auto px-2 py-2">
            {compact ? (
              <div
                aria-label={adminSection.label || "Admin"}
                className="flex flex-col-reverse gap-1"
                onBlurCapture={(e) => {
                  if (
                    !e.currentTarget.contains(e.relatedTarget as Node | null)
                  ) {
                    setAdminRailExpanded(false);
                  }
                }}
                onFocusCapture={() => setAdminRailExpanded(true)}
                onMouseEnter={() => setAdminRailExpanded(true)}
                onMouseLeave={() => setAdminRailExpanded(false)}
                role="group"
              >
                {settingsItem && renderItem(settingsItem, false)}
                {otherAdminItems.length > 0 ? (
                  <div
                    aria-hidden={!adminRailExpanded}
                    className={cn(
                      "flex flex-col gap-1 overflow-hidden transition-[max-height,opacity] duration-200 ease-out",
                      adminRailExpanded
                        ? "max-h-[min(70vh,24rem)] opacity-100"
                        : "max-h-0 opacity-0"
                    )}
                    inert={adminRailExpanded ? undefined : true}
                  >
                    {otherAdminItems.map((item) => renderItem(item, false))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-1">
                {adminSection.label && (
                  <p
                    className={cn(
                      "mb-1 px-2 text-xxs uppercase tracking-[0.1em]",
                      isPanel
                        ? "text-muted-foreground"
                        : "text-sidebar-foreground/55"
                    )}
                  >
                    {adminSection.label}
                  </p>
                )}
                {adminSection.items.map((item) => renderItem(item, false))}
              </div>
            )}
          </div>
        )}

        <div
          className={cn(
            "border-t p-2",
            isPanel ? "border-border" : "border-sidebar-border"
          )}
        >
          <div
            style={{
              transform: iconScale < 1 ? `scale(${iconScale})` : undefined,
              transformOrigin: "center",
            }}
          >
            {footer ?? shell.userMenu(compact)}
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
