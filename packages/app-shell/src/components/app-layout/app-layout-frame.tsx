import { cn } from "@engenty/ui-core";
import {
  type PageContentStackBackground,
  usePageHeader,
} from "@engenty/ui-plugin-sdk";
import { EyeOff, Pin } from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  CopilotShellContentArea,
  CopilotShellMain,
  useCopilotShell,
} from "../../context/copilot-shell-context";
import { ShellSecondaryNavProvider } from "../../context/shell-secondary-nav-context";
import { useShellSecondaryNavWidth } from "../../hooks/use-shell-secondary-nav-width";
import { isCopilotShellSlotOpen } from "../../lib/copilot-chrome";
import {
  COPILOT_BOTTOM_DOCK_CLEARANCE,
  UI_SCROLL_SAFE_BOTTOM,
  UI_SCROLL_SAFE_BOTTOM_DOCKED,
} from "../../types/copilot-layout";
import { AppSidebar } from "../app-sidebar";
import { AppTopbar } from "../app-topbar";
import { PaneResizeHandle } from "../pane/pane";
import {
  COMPACT_SIDEBAR_WIDTH_PX,
  SECONDARY_NAV_WIDTH_TRANSITION_MS,
} from "./constants";
import { MobileNavSheet } from "./mobile-nav-sheet";
import { ModuleSecondaryNavColumnShell } from "./module-secondary-nav-column-shell";
import { ModuleSidebarHeaderLabel } from "./module-sidebar-header-label";
import { SecondaryNavColumn } from "./secondary-nav-column";
import { SecondaryNavSeamToggle } from "./secondary-nav-seam-toggle";
import type { AppLayoutFrameProps } from "./types";
import { useCopilotInlineSidebarWidth } from "./use-copilot-inline-sidebar-width";
import { useSecondaryNavLayout } from "./use-secondary-nav-layout";
import { useSuppressPaneWidthTransition } from "./use-suppress-pane-width-transition";
import { useWorkspaceEndPaneWidth } from "./use-workspace-end-pane-width";
import {
  setWorkspaceEndPaneElement,
  useWorkspaceEndPaneCount,
  useWorkspaceEndPaneExpanded,
} from "./workspace-end-pane";

function contentStackFillClass(
  background: PageContentStackBackground
): string | undefined {
  if (background === "paper") {
    return "bg-paper";
  }
  if (background === "card") {
    return "bg-card";
  }
  return;
}

export function AppLayoutFrame({
  appMenuActions,
  sections,
  shell,
  defaultTopbarTitle,
  modulesReorderable,
  onModulesReorder,
  secondaryNavHeaderOverride,
  secondaryNavFooterSlot,
  secondaryNavLeadingSlot,
  secondaryNavRouteBreadcrumb,
  secondaryNavRouteTransition,
  secondaryNavPersistence,
  railEndSlot,
  spacesZone,
  children,
}: AppLayoutFrameProps & { children: ReactNode }) {
  const { contentStackBackground } = usePageHeader();
  const {
    chromeHidden,
    dockMode,
    open: copilotPersistedOpen,
  } = useCopilotShell();
  const copilotOpen = isCopilotShellSlotOpen({
    chromeHidden,
    open: copilotPersistedOpen,
  });
  const endPaneExpanded = useWorkspaceEndPaneExpanded();
  const endPaneCount = useWorkspaceEndPaneCount();
  const endPaneWidth = useWorkspaceEndPaneWidth();
  const suppressPaneWidthTransition = useSuppressPaneWidthTransition();

  // Sidebar size & collapse states
  const [sidebarMode, setSidebarMode] = useState<"compact" | "extended">(() => {
    try {
      const stored = localStorage.getItem("engenty:sidebar-mode");
      return stored === "extended" ? "extended" : "compact";
    } catch {
      return "compact";
    }
  });

  const sidebarWidth =
    sidebarMode === "extended" ? 220 : COMPACT_SIDEBAR_WIDTH_PX;

  const [isSidebarHidden, setIsSidebarHiddenState] = useState(() => {
    try {
      return localStorage.getItem("engenty:sidebar-hidden") === "true";
    } catch {
      return false;
    }
  });

  // Listen for sidebar mode changes from appearance settings
  useEffect(() => {
    const handleModeChange = () => {
      try {
        const stored = localStorage.getItem("engenty:sidebar-mode");
        setSidebarMode(stored === "extended" ? "extended" : "compact");
      } catch {
        // ignore
      }
    };
    window.addEventListener("engenty:sidebar-mode-change", handleModeChange);
    return () =>
      window.removeEventListener(
        "engenty:sidebar-mode-change",
        handleModeChange
      );
  }, []);

  const updateSidebarHidden = (hidden: boolean) => {
    setIsSidebarHiddenState(hidden);
    try {
      localStorage.setItem("engenty:sidebar-hidden", hidden ? "true" : "false");
      window.dispatchEvent(new Event("engenty:sidebar-hidden-change"));
    } catch (e) {
      console.error(e);
    }
  };

  // Hover state for collapsed sidebar overlay
  const [isHoveringSidebar, setIsHoveringSidebar] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHoveringSidebar(true);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHoveringSidebar(false);
    }, 350); // 350ms delay for smooth slideout
  };

  useEffect(
    () => () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    },
    []
  );

  // Context menu state & handlers
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    visible: boolean;
  } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      visible: true,
    });
  };

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("contextmenu", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("contextmenu", closeMenu);
    };
  }, []);

  useEffect(() => {
    const handleSidebarHiddenChange = () => {
      setIsSidebarHiddenState(
        localStorage.getItem("engenty:sidebar-hidden") === "true"
      );
    };
    window.addEventListener(
      "engenty:sidebar-hidden-change",
      handleSidebarHiddenChange
    );
    return () => {
      window.removeEventListener(
        "engenty:sidebar-hidden-change",
        handleSidebarHiddenChange
      );
    };
  }, []);

  const secondaryNav = useSecondaryNavLayout(sections, {
    hasRouteSlots:
      secondaryNavHeaderOverride != null ||
      secondaryNavLeadingSlot != null ||
      secondaryNavFooterSlot != null,
    secondaryNavPersistence,
  });
  const {
    closeHoverPanel,
    closeNavItemHover,
    closeSecondaryNavPinned,
    hasSecondaryNav,
    hoveredNavItem,
    mobileOpen,
    moduleRootNavItem,
    openHoverPanel,
    openNavItemHover,
    overlayIncludePageSlots,
    overlayLinkList,
    overlayOpen,
    pathname,
    pinSecondaryNavFromHover,
    search,
    secondaryNavAllowPinned,
    secondaryNavOpen,
    setMobileOpen,
    setSecondaryNavOpen,
    shellSecondaryLinks,
    shellSecondaryNavValue,
    showHoverSecondaryColumn,
    navItemCloseTimeoutRef,
    skipNextSecondaryNavOpenTransitionRef,
  } = secondaryNav;

  const {
    displayedWidthPx: secondaryNavDisplayedWidthPx,
    handleResizeKeyDown: handleSecondaryNavResizeKeyDown,
    handleResizePointerDown: handleSecondaryNavResizePointerDown,
    isResizing: isResizingSecondaryNav,
    widthPx: secondaryNavWidthPx,
  } = useShellSecondaryNavWidth();

  const copilotSidebar = useCopilotInlineSidebarWidth();
  const {
    copilotSidebarWidth,
    handleSidebarResizeKeyDown,
    handleSidebarResizeStart,
    setSidebarRef,
    showInlineCopilotSidebar,
    useCopilotWidthTransition: useCopilotWidthTransitionBase,
  } = copilotSidebar;

  const useCopilotWidthTransition =
    useCopilotWidthTransitionBase && !suppressPaneWidthTransition;
  const useSecondaryNavWidthTransition = !(
    isResizingSecondaryNav ||
    suppressPaneWidthTransition ||
    skipNextSecondaryNavOpenTransitionRef.current
  );

  // Topbar Open / space crumb must not appear while the column is still
  // shrinking — that was a second "GA game ▾" sitting in the canvas.
  const [secondaryNavClosing, setSecondaryNavClosing] = useState(false);
  const wasSecondaryNavOpenRef = useRef(secondaryNavOpen);
  useLayoutEffect(() => {
    const wasOpen = wasSecondaryNavOpenRef.current;
    wasSecondaryNavOpenRef.current = secondaryNavOpen;
    if (wasOpen && !secondaryNavOpen && useSecondaryNavWidthTransition) {
      setSecondaryNavClosing(true);
      return;
    }
    if (secondaryNavOpen) {
      setSecondaryNavClosing(false);
    }
  }, [secondaryNavOpen, useSecondaryNavWidthTransition]);
  useEffect(() => {
    if (!secondaryNavClosing) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setSecondaryNavClosing(false);
    }, SECONDARY_NAV_WIDTH_TRANSITION_MS + 50);
    return () => window.clearTimeout(timeoutId);
  }, [secondaryNavClosing]);
  const topbarSecondaryNavOpen = secondaryNavOpen || secondaryNavClosing;
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const railVisible = !isSidebarHidden || isHoveringSidebar;

  const handleToggleSecondaryNav = () => {
    if (secondaryNavAllowPinned) {
      if (secondaryNavOpen) {
        closeSecondaryNavPinned();
        return;
      }
      setSecondaryNavOpen(true);
      return;
    }
    // Overlay-only pages: toggle the hover sheet, never pin width.
    if (overlayOpen) {
      closeHoverPanel();
      return;
    }
    openHoverPanel();
  };

  return (
    <ShellSecondaryNavProvider value={shellSecondaryNavValue}>
      <div className="shell-root flex h-dvh w-full overflow-hidden p-0">
        {/* Sidebar layout placeholder: occupies layout space when pinned, collapses to 0 when hidden and not hovered */}
        <div
          className="hidden h-full shrink-0 transition-[width] duration-300 ease-in-out md:block"
          style={{
            width: isSidebarHidden && !isHoveringSidebar ? 0 : sidebarWidth,
          }}
        />

        {/* Hover trigger zone at the very left edge (active when hidden) */}
        {isSidebarHidden && (
          <div
            className="fixed top-0 bottom-0 left-0 z-45 w-2"
            onMouseEnter={handleMouseEnter}
          />
        )}

        {/* Vertical indicator line (visible when hidden and not hovered, matches app bar theme) */}
        {isSidebarHidden && !isHoveringSidebar && (
          <div className="pointer-events-none fixed top-1/2 left-1 z-50 h-10 w-[5px] -translate-y-1/2 rounded-full border border-sidebar-border bg-sidebar shadow-xs transition-all duration-300" />
        )}

        {/* Actual floating sidebar */}
        <div
          className="fixed inset-y-0 left-0 z-40 hidden h-full overflow-visible transition-all duration-300 ease-in-out md:block"
          onContextMenu={handleContextMenu}
          onMouseEnter={isSidebarHidden ? handleMouseEnter : undefined}
          onMouseLeave={isSidebarHidden ? handleMouseLeave : undefined}
          style={{
            width: sidebarWidth,
            transform:
              isSidebarHidden && !isHoveringSidebar
                ? `translateX(-${sidebarWidth}px)`
                : "translateX(0px)",
          }}
        >
          <AppSidebar
            compact={sidebarMode === "compact"}
            modulesReorderable={modulesReorderable}
            onItemHoverEnter={openNavItemHover}
            onItemHoverLeave={closeNavItemHover}
            onModulesReorder={onModulesReorder}
            onOpenAppMenu={() => setAppMenuOpen(true)}
            onSecondaryNavHoverEnter={openHoverPanel}
            onSecondaryNavHoverLeave={closeHoverPanel}
            onToggleSecondaryNav={handleToggleSecondaryNav}
            railEndSlot={railEndSlot}
            secondaryNavHoverPreview={showHoverSecondaryColumn && overlayOpen}
            sections={sections}
            shell={shell}
            sidebarWidth={sidebarWidth}
            spacesZone={spacesZone}
            style={{ width: sidebarWidth }}
          />
        </div>

        {/* Right-click Context Menu */}
        {contextMenu?.visible && (
          <div
            className="ui-canvas-floating fixed z-50 min-w-[150px] rounded-md border border-sidebar-border bg-sidebar bg-opacity-95 p-1 text-sidebar-foreground shadow-lg backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left font-medium text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => {
                updateSidebarHidden(!isSidebarHidden);
                setContextMenu(null);
              }}
              type="button"
            >
              {isSidebarHidden ? (
                <>
                  <Pin className="size-3.5" />
                  <span>Pin App Bar</span>
                </>
              ) : (
                <>
                  <EyeOff className="size-3.5" />
                  <span>Hide App Bar</span>
                </>
              )}
            </button>
          </div>
        )}

        <MobileNavSheet
          hasSecondaryNav={hasSecondaryNav}
          mobileOpen={mobileOpen}
          onMobileOpenChange={setMobileOpen}
          onOpenAppMenu={() => setAppMenuOpen(true)}
          pathname={pathname}
          search={search}
          secondaryItems={shellSecondaryLinks}
          sections={sections}
          shell={shell}
          spacesZone={spacesZone}
        />

        <div className="relative min-w-0 flex-1 p-0 md:pl-0">
          <div className="flex h-full min-h-0 gap-0">
            <div className="shell-surface relative flex min-w-0 flex-1 flex-row overflow-hidden">
              {hasSecondaryNav ? (
                <div
                  className={cn(
                    "relative z-0 hidden h-full min-h-0 shrink-0 md:flex",
                    secondaryNavOpen
                      ? "shell-divider overflow-visible"
                      : "pointer-events-none overflow-hidden",
                    useSecondaryNavWidthTransition &&
                      "transition-[width] duration-300 ease-in-out"
                  )}
                  onTransitionEnd={(event) => {
                    if (event.propertyName !== "width") {
                      return;
                    }
                    setSecondaryNavClosing(false);
                  }}
                  style={{
                    width: secondaryNavOpen ? secondaryNavDisplayedWidthPx : 0,
                  }}
                >
                  <div
                    className="flex h-full min-h-0 flex-col"
                    style={{ minWidth: secondaryNavDisplayedWidthPx }}
                  >
                    <SecondaryNavColumn
                      onResizeKeyDown={handleSecondaryNavResizeKeyDown}
                      onResizePointerDown={handleSecondaryNavResizePointerDown}
                      onToggle={closeSecondaryNavPinned}
                      pathname={pathname}
                      routeFooterSlot={secondaryNavFooterSlot}
                      routeHeaderSlot={secondaryNavHeaderOverride}
                      routeLeadingSlot={secondaryNavLeadingSlot}
                      routeTransition={secondaryNavRouteTransition}
                      search={search}
                      secondaryItems={shellSecondaryLinks}
                      widthDisplayedPx={secondaryNavDisplayedWidthPx}
                    />
                  </div>
                </div>
              ) : null}
              {showHoverSecondaryColumn ? (
                <div
                  className={cn(
                    "ui-canvas-floating absolute inset-y-0 left-0 z-30 hidden flex-col md:flex",
                    // A floating panel over the page: `ui-canvas-floating`'s
                    // shadow is its whole edge; a border on top of it was the
                    // one hairline left in the shell.
                    overlayIncludePageSlots
                      ? "!bg-card/80 [&_.bg-card]:!bg-transparent [&_.bg-background]:!bg-transparent"
                      : "bg-card",
                    "ease-in-out will-change-transform",
                    "overflow-visible transition-transform duration-300",
                    overlayOpen
                      ? "translate-x-0"
                      : // Extra 0.75rem = half the seam control (size-6), so the
                        // overlapping pin/close rides off-canvas with the sheet
                        // instead of peeking at the content’s left edge.
                        "pointer-events-none -translate-x-[calc(100%+0.75rem)]"
                  )}
                  onMouseEnter={() => {
                    openHoverPanel();
                    if (navItemCloseTimeoutRef.current) {
                      clearTimeout(navItemCloseTimeoutRef.current);
                      navItemCloseTimeoutRef.current = null;
                    }
                  }}
                  onMouseLeave={() => {
                    closeHoverPanel();
                    closeNavItemHover();
                  }}
                  style={{ width: secondaryNavWidthPx }}
                >
                  <div className="relative flex h-full min-h-0 flex-col">
                    <SecondaryNavSeamToggle
                      onToggle={
                        secondaryNavAllowPinned
                          ? pinSecondaryNavFromHover
                          : closeHoverPanel
                      }
                      toggleMode={
                        secondaryNavAllowPinned ? "pinOpen" : "collapse"
                      }
                    />
                    <ModuleSecondaryNavColumnShell
                      blendSurface={
                        overlayIncludePageSlots && secondaryNavAllowPinned
                      }
                      bodyMinWidthPx={secondaryNavWidthPx}
                      headerSlot={
                        hoveredNavItem ? (
                          <ModuleSidebarHeaderLabel
                            icon={hoveredNavItem.icon}
                            label={hoveredNavItem.label}
                            to={hoveredNavItem.to}
                          />
                        ) : undefined
                      }
                      includePageSlots={overlayIncludePageSlots}
                      pathname={pathname}
                      routeFooterSlot={secondaryNavFooterSlot}
                      routeHeaderSlot={secondaryNavHeaderOverride}
                      routeLeadingSlot={secondaryNavLeadingSlot}
                      routeTransition={secondaryNavRouteTransition}
                      search={search}
                      secondaryItems={overlayLinkList}
                    />
                  </div>
                </div>
              ) : null}

              <CopilotShellContentArea
                className={cn(
                  "relative z-0 flex min-w-0 flex-1 flex-col overflow-hidden",
                  contentStackFillClass(contentStackBackground),
                  // End pane expanded: main collapses, the slot takes the row.
                  endPaneExpanded && "flex-[0_1_0px]"
                )}
              >
                <AppTopbar
                  appMenuActions={appMenuActions}
                  appMenuOpen={appMenuOpen}
                  defaultTitle={defaultTopbarTitle}
                  hasSecondaryNav={hasSecondaryNav}
                  isSidebarHidden={isSidebarHidden}
                  isSidebarHovering={isHoveringSidebar}
                  moduleRootNavItem={moduleRootNavItem}
                  onAppMenuOpenChange={setAppMenuOpen}
                  onMenuClick={() => setMobileOpen(true)}
                  onSecondaryNavHoverEnter={openHoverPanel}
                  onSecondaryNavHoverLeave={closeHoverPanel}
                  onToggleSecondaryNav={handleToggleSecondaryNav}
                  onToggleSidebarHidden={() =>
                    updateSidebarHidden(!isSidebarHidden)
                  }
                  railVisible={railVisible}
                  routeBreadcrumb={secondaryNavRouteBreadcrumb}
                  secondaryNavOpen={topbarSecondaryNavOpen}
                  sections={sections}
                  shell={shell}
                />

                <div
                  className="relative flex min-h-0 flex-1 flex-col"
                  data-engenty-content-stack
                >
                  <CopilotShellMain
                    className={cn(
                      "flex min-h-0 flex-1 flex-col overflow-hidden",
                      contentStackFillClass(contentStackBackground) ??
                        "bg-background"
                    )}
                    style={{
                      // Docked composer already reserves the bottom of <main>;
                      // shrink the page-scroll safe area so the two do not stack.
                      ["--ui-scroll-safe-bottom" as string]:
                        copilotOpen && dockMode === "bottom"
                          ? UI_SCROLL_SAFE_BOTTOM_DOCKED
                          : UI_SCROLL_SAFE_BOTTOM,
                      ...(copilotOpen && dockMode === "bottom"
                        ? { paddingBottom: COPILOT_BOTTOM_DOCK_CLEARANCE }
                        : {}),
                    }}
                  >
                    {children}
                  </CopilotShellMain>
                </div>
              </CopilotShellContentArea>

              {/* Workspace end-pane column: one width, one handle; panes
                  portal in and stack vertically (workspace-end-pane.ts). */}
              <div
                className={cn(
                  "flex h-full min-h-0",
                  contentStackFillClass(contentStackBackground),
                  endPaneExpanded && "min-w-0 flex-1"
                )}
              >
                {endPaneCount > 0 && !endPaneExpanded ? (
                  <PaneResizeHandle
                    isResizing={endPaneWidth.isResizing}
                    label="Resize side panel"
                    onKeyDown={endPaneWidth.handleResizeKeyDown}
                    onPointerDown={endPaneWidth.handleResizePointerDown}
                  />
                ) : null}
                <div
                  className={cn(
                    "flex h-full min-h-0 flex-col",
                    endPaneCount > 0 && "py-2 pr-2",
                    endPaneExpanded && "min-w-0 flex-1 pl-2"
                  )}
                  ref={setWorkspaceEndPaneElement}
                  style={
                    endPaneCount > 0 && !endPaneExpanded
                      ? { width: endPaneWidth.displayedWidthPx }
                      : undefined
                  }
                />
              </div>

              {showInlineCopilotSidebar ? (
                <div
                  className={cn(
                    "relative hidden h-full min-h-0 shrink-0 overflow-hidden md:block",
                    copilotOpen && "shell-copilot-divider",
                    useCopilotWidthTransition &&
                      "transition-[width] duration-300 ease-in-out"
                  )}
                  style={{ width: copilotOpen ? copilotSidebarWidth : 0 }}
                >
                  {copilotOpen ? (
                    <button
                      aria-label="Resize copilot sidebar"
                      className="absolute top-0 -left-1 z-10 h-full w-2 cursor-ew-resize rounded-full bg-transparent transition-colors hover:bg-border/80"
                      onKeyDown={handleSidebarResizeKeyDown}
                      onPointerDown={handleSidebarResizeStart}
                      type="button"
                    >
                      <span className="sr-only">Resize copilot sidebar</span>
                    </button>
                  ) : null}
                  <div
                    aria-label="Copilot sidebar"
                    className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-card"
                    ref={setSidebarRef}
                    role="region"
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </ShellSecondaryNavProvider>
  );
}
