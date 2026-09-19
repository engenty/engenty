"use client";

import type { CSSProperties } from "react";
import type { CopilotFloatingSnapTarget } from "./copilot-drawer-utils";

const snapChrome = {
  borderColor: "hsl(var(--primary) / 0.5)",
  backgroundColor: "hsl(var(--primary) / 0.1)",
} as const;

export interface CopilotDrawerSnapOverlaysProps {
  bottomDockIndicatorStyle: CSSProperties | null;
  buttonFabIndicatorStyle: CSSProperties | null;
  sidebarDockIndicatorStyle: CSSProperties | null;
  snapTarget: CopilotFloatingSnapTarget;
  variant: "compact" | "floating";
}

export function CopilotDrawerSnapOverlays({
  bottomDockIndicatorStyle,
  buttonFabIndicatorStyle,
  sidebarDockIndicatorStyle,
  snapTarget,
  variant,
}: CopilotDrawerSnapOverlaysProps) {
  const dashedCardClass =
    variant === "compact"
      ? "pointer-events-none rounded-xl border-2 border-dashed"
      : "pointer-events-none";

  const sidebarStyle =
    variant === "floating" && sidebarDockIndicatorStyle
      ? {
          ...sidebarDockIndicatorStyle,
          borderRadius: 12,
          borderWidth: 2,
          borderStyle: "dashed" as const,
          borderColor: snapChrome.borderColor,
          backgroundColor: snapChrome.backgroundColor,
        }
      : null;

  return (
    <>
      {snapTarget === "sidebar" && sidebarDockIndicatorStyle && (
        <div
          className={variant === "compact" ? dashedCardClass : undefined}
          style={
            variant === "compact"
              ? { ...sidebarDockIndicatorStyle, ...snapChrome }
              : (sidebarStyle ?? undefined)
          }
        />
      )}
      {snapTarget === "button" && buttonFabIndicatorStyle && (
        <div
          className="pointer-events-none rounded-full border-2 border-dashed"
          style={{
            ...buttonFabIndicatorStyle,
            ...snapChrome,
          }}
        />
      )}
    </>
  );
}
