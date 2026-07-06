"use client";

import type { AgentTurnMessageLike } from "@engenty/ag-ui-bridge";
import { Button } from "@engenty/ui-core";
import { ArrowDownRight } from "lucide-react";
import type {
  ComponentPropsWithoutRef,
  Dispatch,
  ReactNode,
  SetStateAction,
} from "react";
import { cloneElement, isValidElement, useState } from "react";
import { PromptInputProvider } from "../../ai-elements/prompt-input";
import type { CopilotRouteContext } from "../session/copilot-route-context.js";
import { CopilotCompactComposerShell } from "./copilot-compact-composer-shell";
import { CopilotComposerSection } from "./copilot-composer-section";
import { CopilotContextDropdown } from "./copilot-context-dropdown";

export interface CopilotCompactContextOption {
  id: string;
  label: string;
  routeContext: CopilotRouteContext;
}

export interface CopilotCompactLauncherProps {
  agentTickerErrorMessage?: string | null;
  agentTickerMessages?: readonly AgentTurnMessageLike[];
  collapseToCircleLabel?: string;
  composerPlaceholder: string;
  /** When set, replaces the route context dropdown beside the composer. */
  contextControlOverride?: ReactNode;
  contextOptions: CopilotCompactContextOption[];
  draft: string;
  dragHandleProps?: ComponentPropsWithoutRef<"div">;
  /** Pending HITL interrupt UI, rendered in the status flap above the input. */
  interruptContent?: ReactNode;
  onCollapseToCircle?: () => void;
  /** Start a fresh conversation (exposed in the composer (+) menu). */
  onNewChat?: () => void;
  onSelectContext: (value: string) => void;
  /** Optimistic user text while a run is in flight (flap "sending" preview). */
  pendingUserText?: string | null;
  /** Shell position menu (⋮); rendered before the drag handle when set. */
  positionMenu?: ReactNode;
  recentContextOptions?: CopilotCompactContextOption[];
  selectedContextId: string;
  setDraft: Dispatch<SetStateAction<string>>;
  status: "ready" | "streaming" | "submitted" | "error";
  submitMessage: (
    text: string,
    options?: { requestedAgentId?: string }
  ) => void;
}

export function CopilotCompactLauncher({
  agentTickerErrorMessage = null,
  agentTickerMessages = [],
  collapseToCircleLabel = "Very compact",
  contextControlOverride,
  composerPlaceholder,
  contextOptions,
  draft,
  dragHandleProps,
  interruptContent = null,
  onCollapseToCircle,
  onNewChat,
  pendingUserText = null,
  positionMenu,
  onSelectContext,
  recentContextOptions,
  selectedContextId,
  setDraft,
  status,
  submitMessage,
}: CopilotCompactLauncherProps) {
  const [isMultiline, setIsMultiline] = useState(false);

  const combinedGripMenu =
    isValidElement(positionMenu) && dragHandleProps
      ? cloneElement(positionMenu as any, {
          gripLabel: "Drag to move",
          gripPointerDown: dragHandleProps.onPointerDown,
          gripPointerMove: dragHandleProps.onPointerMove,
          gripPointerLeave: dragHandleProps.onPointerLeave,
          gripPointerUp: dragHandleProps.onPointerUp,
        })
      : positionMenu;

  const compactChrome = (
    <div className="flex items-center gap-1">
      {onCollapseToCircle ? (
        <Button
          aria-label={collapseToCircleLabel}
          className="h-6 w-6 shrink-0"
          onClick={onCollapseToCircle}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ArrowDownRight className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      ) : null}
      {combinedGripMenu}
    </div>
  );

  return (
    <CopilotCompactComposerShell
      belowCard={
        contextControlOverride ?? (
          <CopilotContextDropdown
            onSelect={onSelectContext}
            options={contextOptions}
            recentOptions={recentContextOptions}
            selectedId={selectedContextId}
            variant="compact"
          />
        )
      }
      chatStatus={status}
      errorMessage={agentTickerErrorMessage}
      interruptContent={interruptContent}
      isMultiline={isMultiline}
      messages={agentTickerMessages}
      pendingUserText={pendingUserText}
      variant="dock"
    >
      <PromptInputProvider initialInput={draft}>
        <CopilotComposerSection
          compact
          compactCardChrome={compactChrome}
          composerPlaceholder={composerPlaceholder}
          draft={draft}
          onMultilineChange={setIsMultiline}
          onNewChat={onNewChat}
          setDraft={setDraft}
          showStarterPrompts={false}
          status={status}
          submitMessage={submitMessage}
        />
      </PromptInputProvider>
    </CopilotCompactComposerShell>
  );
}
