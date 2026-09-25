import type { CopilotDockMode } from "@engenty/app-shell";
import type { EngentyKind } from "@engenty/ui-core";
import type { MutableRefObject, ReactNode } from "react";
import type { StarterPromptItem } from "../composer/copilot-composer.js";
import type { CopilotHeaderChrome } from "../panel/copilot-panel-content.js";
import type { CopilotLayoutPersistenceApi } from "../session/copilot-layout-snapshot.js";
import type { CopilotRouteContext } from "../session/copilot-route-context.js";

export type { CopilotDockMode } from "@engenty/app-shell";

export type CopilotGetHeaders = () => Promise<Record<string, string>>;

export type CopilotPanelMode = "docked" | "floating";

export interface CopilotDrawerProps {
  agentChooserLabels?: {
    selectAgent: string;
  };
  attachLabel?: string;
  closeLabel?: string;
  composerLeadingControl?: ReactNode;
  composerPlaceholder?: string;
  copilotContext?: CopilotRouteContext;
  copilotDockRef?: MutableRefObject<HTMLDivElement | null>;
  copilotLayout?: CopilotLayoutPersistenceApi | null;
  copilotSidebarRef?: MutableRefObject<HTMLDivElement | null>;
  defaultPanelMode?: CopilotPanelMode;
  dockMode?: CopilotDockMode;
  floatingBoundsMargin?: number;
  headerChrome?: CopilotHeaderChrome;
  mainContentReady?: boolean;
  mainContentRef?: MutableRefObject<HTMLElement | null>;
  module: string;
  onOpenChange: (open: boolean) => void;
  onPanelModeChange?: (mode: CopilotPanelMode) => void;
  /** After a sandbox command is approved — the page it came from refreshes. */
  onSandboxApproved?: () => void;
  open: boolean;
  panelMode?: CopilotPanelMode;
  positionDrawerLabel?: string;
  positionFullscreenLabel?: string;
  positionHeadingLabel?: string;
  positionMenuAriaLabel?: string;
  positionSidebarLabel?: string;
  positionWindowLabel?: string;
  preferredDockMode?: CopilotDockMode | null;
  routeKey: string;
  scope: Record<string, unknown> | null;
  setPreferredDockMode?: (mode: CopilotDockMode | null) => void;
  /** A module's own openers for its page (its copilot contribution). */
  starterPrompts?: StarterPromptItem[];
  title?: string;
  whoOptions?: Array<{
    avatarUrl?: string | null;
    engenty: EngentyKind;
    id: string;
    name: string;
  }>;
  /** A hired Engenty's chat in the companion's place (the who chooser). */
  workPanelContent?: ReactNode;
}

export type { CopilotRouteContext } from "../session/copilot-route-context.js";
