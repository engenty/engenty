import type {
  AgentUiRunContext,
  AgUiOpenInterruptMetadata,
} from "@engenty/ag-ui-bridge";
import type { CopilotDockMode } from "@engenty/app-shell";
import type { EngentyKind } from "@engenty/ui-core";
import type { MutableRefObject, ReactNode } from "react";
import type { StarterPromptItem } from "../composer/copilot-composer.js";
import type { ChatSlashCommand } from "../composer/copilot-slash-command.js";
import type { CopilotHeaderChrome } from "../panel/copilot-panel-content.js";
import type { CopilotChatOnFinish } from "../session/copilot-chat-types.js";
import type { CopilotLayoutPersistenceApi } from "../session/copilot-layout-snapshot.js";
import type { CopilotRouteContext } from "../session/copilot-route-context.js";
import type { CopilotDrawerInjectedSession } from "./copilot-drawer-injected-session.js";

export type { CopilotDockMode } from "@engenty/app-shell";

export type CopilotGetHeaders = () => Promise<Record<string, string>>;

export type CopilotPanelMode = "docked" | "floating";

export interface CopilotDrawerProps {
  /** Labels for the who chooser in the window title bar. */
  agentChooserLabels?: {
    selectAgent: string;
  };
  agentDebugPayload?: unknown;
  agentUi?: AgentUiRunContext | null;
  applySelectedLabel?: string;
  artifactLoadFailedLabel?: string;
  attachLabel?: string;
  cancelLabel?: string;

  closeLabel?: string;
  compactLabel?: string;
  /** Optional control rendered below the compact composer (e.g. model chooser). */
  composerLeadingControl?: ReactNode;
  composerPlaceholder?: string;
  copilotContext?: CopilotRouteContext;
  /** Ref to shell-owned app-bar blob slot. From useCopilotShell. */
  copilotDockRef?: MutableRefObject<HTMLDivElement | null>;
  /** When set, persist floating layout via host merge (e.g. user-settings). From useCopilotShell().copilotLayout. */
  copilotLayout?: CopilotLayoutPersistenceApi | null;
  /** Ref to shell-owned inline sidebar container. From useCopilotShell. */
  copilotSidebarRef?: MutableRefObject<HTMLDivElement | null>;
  copyThreadCopiedLabel?: string;
  copyThreadLabel?: string;
  defaultPanelMode?: CopilotPanelMode;
  detachLabel?: string;
  /** Shell dock mode; when set, used for surface selection. */
  dockMode?: CopilotDockMode;
  dragHandleLabel?: string;
  floatingBoundsMargin?: number;
  getHeaders?: CopilotGetHeaders;
  /** Match app-shell page topbar chrome for the docked copilot header row. */
  headerChrome?: CopilotHeaderChrome;
  initialPrompt?: string;
  /** When set, drawer chat uses apps/ai AG-UI session from the host (`@engenty/ai-ui`) instead of an internal hook. */
  injectedSession?: CopilotDrawerInjectedSession;
  /** True when main content is mounted. From useCopilotShell. */
  mainContentReady?: boolean;
  /** Ref to main content. From useCopilotShell. */
  mainContentRef?: MutableRefObject<HTMLElement | null>;
  module: string;
  onApplySuccess?: () => void;
  onApplySuggestions?: (patch: Record<string, string | null>) => Promise<void>;
  /**
   * Invoked after each assistant message completes (mirrors AI SDK `onFinish`;
   * use for query invalidation when server tools mutate data).
   */
  onAssistantTurnFinish?: CopilotChatOnFinish;
  onOpenChange: (open: boolean) => void;
  onPanelModeChange?: (mode: CopilotPanelMode) => void;
  onSandboxCommandInterruptApprove?: (
    open: AgUiOpenInterruptMetadata
  ) => void | Promise<void>;
  onSandboxCommandInterruptReject?: (open: AgUiOpenInterruptMetadata) => void;
  open: boolean;
  openInterruptFromSession?: AgUiOpenInterruptMetadata | null;
  panelMode?: CopilotPanelMode;
  positionDrawerLabel?: string;
  /** The river's own page (`/copilot`, or `/s/<key>/copilot` inside a space). */
  positionFullscreenLabel?: string;
  positionHeadingLabel?: string;
  /** Position menu trigger aria label. */
  positionMenuAriaLabel?: string;
  positionSidebarLabel?: string;
  /** Draggable, resizable window over the page (`window` dock mode). */
  positionWindowLabel?: string;
  preferredDockMode?: CopilotDockMode | null;
  reviewPromptLabel?: string;
  routeKey: string;
  /** Current workspace tenant (optional; forwarded when posting frontend-tool results). */
  runtimeTenantId?: string | null;
  scope: Record<string, unknown> | null;
  selectedCountLabel?: string;
  sendLabel?: string;
  /** Apps/ai service base URL (`VITE_ENGENTY_AI_BASE_URL`). Used for session agent PATCH when `injectedSession` is set. */
  serviceBaseUrl?: string;
  /** Set preferred dock mode. From useCopilotShell. */
  setPreferredDockMode?: (mode: CopilotDockMode | null) => void;
  /**
   * Slash-command catalog for the composer. Optional, exactly like
   * `starterPrompts` — omit it and the "/" menu simply does not open, which is
   * what the docked chat did before this was plumbed through.
   */
  slashCommands?: ChatSlashCommand[];
  starterPrompts?: StarterPromptItem[];
  startMode?: "manual" | "auto";
  suggestedUpdatesLabel?: string;
  thinkingLabel?: string;
  title?: string;
  triggerType?: "message_copilot" | "button" | "shortcut";
  /** Blob flyout who list (Copilot + space Engenties). */
  whoOptions?: Array<{
    avatarUrl?: string | null;
    engenty: EngentyKind;
    id: string;
    name: string;
  }>;
  /** When set, Work/Window renders this lane instead of the Copilot session. */
  workPanelContent?: ReactNode;
}

export type { CopilotRouteContext } from "../session/copilot-route-context.js";
