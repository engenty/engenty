import type {
  AgentUiRunContext,
  AgUiOpenInterruptMetadata,
  Message,
} from "@engenty/ag-ui-bridge";
import type { MutableRefObject } from "react";
import type { CopilotAgentSessionChooserSession } from "../composer/copilot-agent-session-chooser";
import type { StarterPromptItem } from "../composer/copilot-composer";
import type { CopilotHeaderChrome } from "../panel/copilot-panel-content";
import type { CopilotChatOnFinish } from "../session/copilot-chat-types.js";
import type { CopilotLayoutPersistenceApi } from "../session/copilot-layout-snapshot";
import type { CopilotRouteContext } from "../session/copilot-route-context.js";
import type { CopilotDrawerInjectedSession } from "./copilot-drawer-injected-session.js";

export type CopilotGetHeaders = () => Promise<Record<string, string>>;

export type CopilotPanelMode = "docked" | "floating";

/** Shell-level dock mode; when provided, overrides panelMode for layout. */
export type CopilotDockMode =
  | "floating"
  | "mini-floating"
  | "drawer"
  | "sidebar"
  | "bottom";

export interface CopilotDrawerProps {
  agentChooserLabels?: {
    emptySessions: string;
    /** Display name for the default `engenty.copilot` agent in compact agent picker. */
    generalCopilot?: string;
    newSession: string;
    selectAgent: string;
    sessionsHeading: string;
  };
  agentDebugPayload?: unknown;
  /** When true, header and compact surfaces use the Agent / Session chooser; context stays on the current page. */
  agentSessionChooserEnabled?: boolean;
  agentUi?: AgentUiRunContext | null;
  applySelectedLabel?: string;
  artifactLoadFailedLabel?: string;
  attachLabel?: string;
  cancelLabel?: string;
  /**
   * When `floatingChatRouteBinding` is enabled, used as `copilotContext` for the chat session only
   * (e.g. virtual `/chat/...` routing) while header/apply keep using the main `copilotContext`.
   */
  chatRouteCopilotContext?: CopilotRouteContext;
  chooserMenuAgentId?: string | null;
  chooserMenuSessions?: CopilotAgentSessionChooserSession[];
  chooserMenuSessionsLoading?: boolean;
  clearLabel?: string;
  closeLabel?: string;
  compactLabel?: string;
  composerPlaceholder?: string;
  copilotContext?: CopilotRouteContext;
  /** When set, persist floating layout via host merge (e.g. user-settings). From useCopilotShell().copilotLayout. */
  copilotLayout?: CopilotLayoutPersistenceApi | null;
  /** Ref to shell-owned inline sidebar container. From useCopilotShell. */
  copilotSidebarRef?: MutableRefObject<HTMLDivElement | null>;
  defaultPanelMode?: CopilotPanelMode;
  detachLabel?: string;
  /** Shell dock mode; when set, used for surface selection. */
  dockMode?: CopilotDockMode;
  dragHandleLabel?: string;
  floatingBoundsMargin?: number;
  /** Canonical server-backed messages for route-bound floating chat (`historyMode: "none"`). */
  floatingChatCanonicalMessages?: readonly Message[];
  floatingChatCanonicalMessagesLoading?: boolean;
  /** When true, thread id comes from `injectedSession` (host binding), not drawer-local storage. */
  floatingChatRouteBinding?: boolean;
  getHeaders?: CopilotGetHeaders;
  /** Match app-shell page topbar chrome for the docked copilot header row. */
  headerChrome?: CopilotHeaderChrome;
  initialPrompt?: string;
  /** When set, drawer chat uses apps/ai AG-UI session from the host (`@engenty/ai-ui`) instead of an internal hook. */
  injectedSession?: CopilotDrawerInjectedSession;
  /** True when main content is mounted. From useCopilotShell. */
  mainContentReady?: boolean;
  /** Ref to main content for bottom-dock portal. From useCopilotShell. */
  mainContentRef?: MutableRefObject<HTMLElement | null>;
  module: string;
  onApplySuccess?: () => void;
  onApplySuggestions?: (patch: Record<string, string | null>) => Promise<void>;
  /**
   * When not using `floatingChatRouteBinding`, invoked after each assistant message completes
   * (mirrors AI SDK `onFinish`; use for query invalidation when server tools mutate data).
   */
  onAssistantTurnFinish?: CopilotChatOnFinish;
  onChooserMenuAgentIdChange?: (agentId: string | null) => void;
  /** Called after each assistant turn when `floatingChatRouteBinding` is enabled. */
  onFloatingChatFinish?: () => void;
  onFrontendToolInterruptApprove?: (
    open: AgUiOpenInterruptMetadata
  ) => void | Promise<void>;
  onFrontendToolInterruptReject?: (open: AgUiOpenInterruptMetadata) => void;
  onOpenChange: (open: boolean) => void;
  onPanelModeChange?: (mode: CopilotPanelMode) => void;
  open: boolean;
  openInterruptFromSession?: AgUiOpenInterruptMetadata | null;
  panelMode?: CopilotPanelMode;
  positionBottomLabel?: string;
  /** Compact launcher / FAB-style placement. */
  positionButtonLabel?: string;
  positionDrawerLabel?: string;
  positionFloatingLabel?: string;
  positionHeadingLabel?: string;
  /** Bottom-dock ⋮ menu: aria label for the position trigger. */
  positionMenuAriaLabel?: string;
  positionSidebarLabel?: string;
  preferredDockMode?: CopilotDockMode | null;
  /**
   * When true with `agentSessionChooserEnabled`, `chooserMenuSessions` is a flat recent-session list
   * (not per-agent submenu). Host should load tenant sessions (e.g. `useAppsAiThreadsQuery`).
   */
  recentSessionsChooser?: boolean;
  registeredAgents?: Array<{
    chat_triggers?: {
      include_in_chat_picker: boolean;
      is_active: boolean;
    };
    description?: string | null;
    id: string;
    name: string;
  }>;
  registeredAgentsLoading?: boolean;
  requestedAgentId?: string;
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
  starterPrompts?: StarterPromptItem[];
  startMode?: "manual" | "auto";
  suggestedUpdatesLabel?: string;
  thinkingLabel?: string;
  title?: string;
  triggerType?: "message_copilot" | "button" | "shortcut";
}

export type { CopilotRouteContext } from "../session/copilot-route-context.js";
