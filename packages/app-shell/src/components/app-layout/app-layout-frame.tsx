import { cn } from "@engenty/ui-core";
import { usePageHeader } from "@engenty/ui-plugin-sdk";
import { EyeOff, Pin } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  CopilotShellContentArea,
  CopilotShellMain,
  useCopilotShell,
} from "../../context/copilot-shell-context";
import { ShellSecondaryNavProvider } from "../../context/shell-secondary-nav-context";
import { useShellSecondaryNavWidth } from "../../hooks/use-shell-secondary-nav-width";
import { COPILOT_BOTTOM_DOCK_HEIGHT } from "../../types/copilot-layout";
import { AppSidebar } from "../app-sidebar";
import { AppTopbar } from "../app-topbar";
import { COMPACT_SIDEBAR_WIDTH_PX } from "./constants";
import { MobileNavSheet } from "./mobile-nav-sheet";
import { ModuleSecondaryNavColumnShell } from "./module-secondary-nav-column-shell";
import { ModuleSidebarHeaderLabel } from "./module-sidebar-header-label";
import { SecondaryNavColumn } from "./secondary-nav-column";
import type { AppLayoutFrameProps } from "./types";
import { useCopilotInlineSidebarWidth } from "./use-copilot-inline-sidebar-width";
import { useSecondaryNavLayout } from "./use-secondary-nav-layout";
import { useSuppressPaneWidthTransition } from "./use-suppress-pane-width-transition";
import {
  setWorkspaceEndPaneElement,
  useWorkspaceEndPaneExpanded,
} from "./workspace-end-pane";

export function AppLayoutFrame({
  appMenuActions,
  sections,
  shell,
  defaultTopbarTitle,
  modulesReorderable,
  onModulesReorder,
  secondaryNavPersistence,
  children,
}: AppLayoutFrameProps & { children: ReactNode }) {
  const { contentStackBackground } = usePageHeader();
  const { dockMode, open: copilotOpen } = useCopilotShell();
  const endPaneExpanded = useWorkspaceEndPaneExpanded();
  const suppressPaneWidthTransition = useSuppressPaneWidthTransition();

  const [forceHoverToggle, setForceHoverToggle] = useState(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

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

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      // If the user moves the mouse, disable forced hover so the browser's
      // native hover states kick in.
      setForceHoverToggle(false);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  const secondaryNav = useSecondaryNavLayout(sections, {
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

  useEffect(() => {
    if (overlayOpen) {
      const timer = setTimeout(() => {
        const element = document.elementFromPoint(
          lastMousePosRef.current.x,
          lastMousePosRef.current.y
        );
        if (element?.closest("[data-sidebar-toggle]")) {
          setForceHoverToggle(true);
        }
      }, 300); // 300ms matches transition duration
      return () => clearTimeout(timer);
    }
    setForceHoverToggle(false);
  }, [overlayOpen]);

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

  return (
    <ShellSecondaryNavProvider value={shellSecondaryNavValue}>
      <div className="shell-root flex h-screen w-full overflow-hidden p-0">
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
          className="fixed inset-y-0 left-0 z-40 hidden h-full transition-all duration-300 ease-in-out md:block"
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
            sections={sections}
            shell={shell}
            sidebarWidth={sidebarWidth}
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
          pathname={pathname}
          search={search}
          secondaryItems={shellSecondaryLinks}
          sections={sections}
          shell={shell}
        />

        <div className="relative min-w-0 flex-1 p-0 md:pl-0">
          <div className="flex h-full min-h-0 gap-0">
            <div className="shell-surface relative flex min-w-0 flex-1 flex-row overflow-hidden">
              {hasSecondaryNav ? (
                <div
                  className={cn(
                    "relative z-0 hidden h-full min-h-0 shrink-0 overflow-hidden md:flex",
                    secondaryNavOpen && "shell-divider",
                    !secondaryNavOpen && "pointer-events-none",
                    useSecondaryNavWidthTransition &&
                      "transition-[width] duration-300 ease-in-out"
                  )}
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
                    "ui-canvas-floating absolute inset-y-0 left-0 z-30 hidden flex-col overflow-hidden md:flex",
                    overlayIncludePageSlots
                      ? "!bg-card/80 [&_.bg-card]:!bg-transparent [&_.bg-background]:!bg-transparent border-border border-r"
                      : "border-border border-r bg-card",
                    "ease-in-out will-change-transform",
                    "transition-transform duration-300",
                    overlayOpen
                      ? "translate-x-0"
                      : "pointer-events-none -translate-x-full"
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
                    setForceHoverToggle(false);
                  }}
                  style={{ width: secondaryNavWidthPx }}
                >
                  <ModuleSecondaryNavColumnShell
                    bodyMinWidthPx={secondaryNavWidthPx}
                    forceHover={forceHoverToggle}
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
                    onToggle={
                      secondaryNavAllowPinned
                        ? pinSecondaryNavFromHover
                        : closeHoverPanel
                    }
                    pathname={pathname}
                    search={search}
                    secondaryItems={overlayLinkList}
                    toggleMode={
                      secondaryNavAllowPinned ? "pinOpen" : "collapse"
                    }
                  />
                </div>
              ) : null}

              <CopilotShellContentArea
                className={cn(
                  "relative z-0 flex min-w-0 flex-1 flex-col overflow-hidden",
                  contentStackBackground === "paper" && "bg-paper",
                  // End pane expanded: main collapses, the slot takes the row.
                  endPaneExpanded && "flex-[0_1_0px]"
                )}
              >
                <AppTopbar
                  appMenuActions={appMenuActions}
                  defaultTitle={defaultTopbarTitle}
                  hasSecondaryNav={hasSecondaryNav}
                  isSidebarHidden={isSidebarHidden}
                  isSidebarHovering={isHoveringSidebar}
                  moduleRootNavItem={moduleRootNavItem}
                  onMenuClick={() => setMobileOpen(true)}
                  onSecondaryNavHoverEnter={openHoverPanel}
                  onSecondaryNavHoverLeave={closeHoverPanel}
                  onToggleSecondaryNav={() => {
                    if (secondaryNavAllowPinned) {
                      setSecondaryNavOpen(true);
                      return;
                    }
                    // Overlay-only pages: toggle the hover sheet, never pin width.
                    if (overlayOpen) {
                      closeHoverPanel();
                      return;
                    }
                    openHoverPanel();
                  }}
                  onToggleSidebarHidden={() =>
                    updateSidebarHidden(!isSidebarHidden)
                  }
                  secondaryNavOpen={secondaryNavOpen}
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
                      contentStackBackground === "paper"
                        ? "bg-paper"
                        : "bg-background"
                    )}
                    style={
                      copilotOpen && dockMode === "bottom"
                        ? { paddingBottom: COPILOT_BOTTOM_DOCK_HEIGHT }
                        : undefined
                    }
                  >
                    {children}
                  </CopilotShellMain>
                </div>
              </CopilotShellContentArea>

              <div
                className={cn(
                  "flex h-full min-h-0",
                  contentStackBackground === "paper" && "bg-paper",
                  endPaneExpanded && "min-w-0 flex-1"
                )}
                ref={setWorkspaceEndPaneElement}
              />

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
