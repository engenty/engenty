import { cn } from "@engenty/ui-core";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import type {
  NavigationItem,
  NavigationSection,
  ShellSidebarConfig,
} from "../types/shell";
import {
  type AppBarPosition,
  appBarHideTransform,
  appBarTooltipSide,
  isHorizontalAppBarPosition,
} from "../types/shell-app-bar-position";
import { AppBarContextMenu } from "./app-bar-context-menu";
import { AppSidebar } from "./app-sidebar";

function appBarFixedInsetClass(position: AppBarPosition): string {
  switch (position) {
    case "left":
      return "inset-y-0 left-0";
    case "right":
      return "inset-y-0 right-0";
    case "top":
      return "inset-x-0 top-0";
    case "bottom":
      return "inset-x-0 bottom-0";
  }
}

function appBarHoverStripClass(position: AppBarPosition): string {
  switch (position) {
    case "left":
      return "top-0 bottom-0 left-0 w-2";
    case "right":
      return "top-0 bottom-0 right-0 w-2";
    case "top":
      return "top-0 right-0 left-0 h-2";
    case "bottom":
      return "right-0 bottom-0 left-0 h-2";
  }
}

function appBarHiddenIndicatorClass(position: AppBarPosition): string {
  switch (position) {
    case "left":
      return "top-1/2 left-1 h-10 w-[5px] -translate-y-1/2";
    case "right":
      return "top-1/2 right-1 h-10 w-[5px] -translate-y-1/2";
    case "top":
      return "top-1 left-1/2 h-[5px] w-10 -translate-x-1/2";
    case "bottom":
      return "bottom-1 left-1/2 h-[5px] w-10 -translate-x-1/2";
  }
}

export function AppBarRail({
  compact,
  contextMenu,
  hidden,
  hovering,
  modulesReorderable,
  onCloseContextMenu,
  onContextMenu,
  onHiddenChange,
  onItemHoverEnter,
  onItemHoverLeave,
  onModulesReorder,
  onMouseEnter,
  onMouseLeave,
  onOpenAppMenu,
  onPositionChange,
  position,
  railCopilotSlot,
  railEndSlot,
  sections,
  shell,
  spacesZone,
  thickness,
}: {
  compact: boolean;
  contextMenu: { x: number; y: number } | null;
  hidden: boolean;
  hovering: boolean;
  modulesReorderable?: boolean;
  onCloseContextMenu: () => void;
  onContextMenu: (event: MouseEvent) => void;
  onHiddenChange: (hidden: boolean) => void;
  onItemHoverEnter?: (item: NavigationItem) => void;
  onItemHoverLeave?: () => void;
  onModulesReorder?: (orderedIds: string[]) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onOpenAppMenu: () => void;
  onPositionChange: (position: AppBarPosition) => void;
  position: AppBarPosition;
  railCopilotSlot?: ReactNode;
  railEndSlot?: ReactNode;
  sections: NavigationSection[];
  shell: ShellSidebarConfig;
  spacesZone?: ReactNode;
  thickness: number;
}) {
  const horizontal = isHorizontalAppBarPosition(position);
  const collapsed = hidden && !hovering;
  const spacerStyle: CSSProperties = horizontal
    ? { height: collapsed ? 0 : thickness }
    : { width: collapsed ? 0 : thickness };
  const barStyle: CSSProperties = {
    ...(horizontal ? { height: thickness } : { width: thickness }),
    transform: collapsed
      ? appBarHideTransform(position, thickness)
      : "translate(0px, 0px)",
  };

  return (
    <div
      className={cn(
        "hidden shrink-0 transition-[width,height] duration-300 ease-in-out md:block",
        horizontal ? "w-full" : "h-full"
      )}
      style={spacerStyle}
    >
      {hidden ? (
        <div
          className={cn("fixed z-45", appBarHoverStripClass(position))}
          onMouseEnter={onMouseEnter}
        />
      ) : null}

      {collapsed ? (
        <div
          className={cn(
            "pointer-events-none fixed z-50 rounded-full border border-sidebar-border bg-sidebar shadow-xs transition-all duration-300",
            appBarHiddenIndicatorClass(position)
          )}
        />
      ) : null}

      <div
        className={cn(
          "fixed z-40 hidden overflow-visible transition-all duration-300 ease-in-out md:block",
          appBarFixedInsetClass(position)
        )}
        onContextMenu={onContextMenu}
        onMouseEnter={hidden ? onMouseEnter : undefined}
        onMouseLeave={hidden ? onMouseLeave : undefined}
        style={barStyle}
      >
        <AppSidebar
          compact={compact}
          modulesReorderable={modulesReorderable}
          onItemHoverEnter={onItemHoverEnter}
          onItemHoverLeave={onItemHoverLeave}
          onModulesReorder={onModulesReorder}
          onOpenAppMenu={onOpenAppMenu}
          orientation={horizontal ? "horizontal" : "vertical"}
          position={position}
          railCopilotSlot={railCopilotSlot}
          railEndSlot={railEndSlot}
          sections={sections}
          shell={shell}
          sidebarWidth={thickness}
          spacesZone={spacesZone}
          style={horizontal ? { height: thickness } : { width: thickness }}
          tooltipSide={appBarTooltipSide(position)}
        />
      </div>

      {contextMenu ? (
        <AppBarContextMenu
          hidden={hidden}
          onHiddenChange={onHiddenChange}
          onOpenChange={(open) => {
            if (!open) {
              onCloseContextMenu();
            }
          }}
          onPositionChange={onPositionChange}
          open
          position={position}
          submenuSide={appBarTooltipSide(position)}
          x={contextMenu.x}
          y={contextMenu.y}
        />
      ) : null}
    </div>
  );
}
