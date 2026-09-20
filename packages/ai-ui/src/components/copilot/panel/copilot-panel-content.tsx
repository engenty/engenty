"use client";

import { cn, ScrollArea } from "@engenty/ui-core";
import { CopilotToolCallActionsProvider } from "../interrupts/copilot-tool-call-actions";
import { THREAD_CONTEXT_INLINE_PAD_VAR } from "../thread-context/thread-context-types";
import { CopilotTranscript } from "../transcript/copilot-transcript";
import { CopilotTranscriptLoading } from "../transcript/copilot-transcript-loading";
import {
  ChatTranscriptErrorBoundary,
  ChatTranscriptErrorCard,
} from "./chat-transcript-error-boundary";
import { CopilotPanelComposerBlock } from "./copilot-panel-composer-block";
import type { CopilotPanelContentProps } from "./copilot-panel-content-types";
import { CopilotDebugDetails } from "./copilot-panel-debug-details";
import { CopilotPanelInlineHeader } from "./copilot-panel-header";
import {
  CopilotPanelHitlAppliedBlock,
  CopilotPanelHitlPopover,
  CopilotPanelHitlTranscriptBlock,
} from "./copilot-panel-hitl-section";
import {
  COPILOT_TRANSCRIPT_TOP_FADE_CLASS,
  resolveCopilotEmptyLandingAlign,
  resolveCopilotTranscriptBottomPaddingClass,
} from "./copilot-panel-scroll-utils";
import { useChatNoResponseGuard } from "./use-chat-no-response-guard";
import { useCopilotPanelTranscriptScroll } from "./use-copilot-panel-transcript-scroll";

export type {
  CopilotEmptyLandingAlign,
  CopilotHeaderChrome,
  CopilotPanelContentProps,
} from "./copilot-panel-content-types";
export { CopilotPanelHeader } from "./copilot-panel-header";
export {
  COPILOT_DOCK_COMPOSER_CARD_CLASS,
  getCopilotTranscriptScrollTop,
  isCopilotScrollViewportNearBottom,
  resolveCopilotEmptyLandingAlign,
  resolveCopilotTranscriptBottomPaddingClass,
  shouldCenterCopilotEmptyLanding,
} from "./copilot-panel-scroll-utils";

export function CopilotPanelContent({
  agentDebugPayload,
  autoScrollKey,
  awaitingInterrupt = false,
  composerFocusKey,
  openInterrupt = null,
  routeStatusLabel,
  title = "Enhance",
  error,
  messages,
  pendingUserInsertIndex,
  pendingUserParts,
  pendingUserText,
  status,
  streamActivityCount,
  threadId = null,
  subAgentFullViewLabel,
  subAgentSectionLabels,
  startMode,
  draft,
  setDraft,
  submitMessage,
  composerPlaceholder,
  starterPrompts,
  reviewPromptLabel,
  thinkingLabel,
  latestSuggestions,
  selectedCandidateValues,
  selectedSuggestions,
  setSelectedCandidateValues,
  setSelectedSuggestions,
  isApplying,
  applyError,
  appliedSuggestions = [],
  artifactError,
  applySelectedLabel,
  cancelLabel,
  centerEmptyLanding: centerEmptyLandingProp,
  chatKind = null,
  emptyLandingAlign: emptyLandingAlignProp,
  emptyStateHeader,
  selectedCountLabel,
  suggestedUpdatesLabel,
  artifactLoadFailedLabel,
  clearLabel = "New chat",
  triggerType,
  panelMode,
  onNewChat,
  onApplySuggestions,
  onCancel,
  onStop,
  onPanelModeChange,
  onClose,
  dismissInterrupt,
  onSandboxCommandApprove,
  onSandboxCommandReject,
  attachLabel,
  detachLabel,
  closeLabel,
  headerVariant = "docked",
  headerChrome = "default",
  bodyOnly = false,
  compact = false,
  autoExpand = true,
  enableStatusFlap = true,
  engentyKind,
  contentBodyGutter = "default",
  composerDockStyle = false,
  composerLeadingControl,
  composerOverride,
  composerWrapperClassName,
  dockedInterruptSurface = null,
  dockedInterruptToolCallId = null,
  pendingInterruptToolCallIds,
  optimisticInterruptResults,
  respond,
  emptyStateSubtitle,
  emptyStateTitle,
  compactContextControl,
  minimalChrome = false,
  contextMenuLabel,
  contextOptions,
  onSelectContext,
  recentContextMenuLabel,
  recentContextOptions,
  selectedContextId,
  debugPayload,
  positionMenu,
  browserPanel,
  browserPanelLabel,
  browserPanelOpen = false,
  onToggleBrowserPanel,
  agentSessionChooser,
  mentionAgentCandidates,
  mentionRefSearch,
  onComposerMentionAgent,
  showAuthorLabels = false,
  onPressWizardCommand,
  slashCommands,
  transcriptContainerClassName,
  transcriptFooter = null,
  transcriptHeader = null,
  transcriptLoading = false,
  transcriptLoadingLabel = "Loading conversation",
  transcriptSurface = "default",
  transcribeAudio,
  voiceInputEnabled = true,
  voiceInputLang,
}: CopilotPanelContentProps) {
  const showAgentChooser = Boolean(agentSessionChooser);
  const showHeaderContext = Boolean(
    contextOptions &&
      contextOptions.length > 0 &&
      onSelectContext &&
      selectedContextId != null
  );

  const toolCardDensity =
    triggerType === "message_copilot" ? "default" : "compact";
  const showHitlInTranscript =
    latestSuggestions.length > 0 && triggerType === "message_copilot";
  const showHitlInPopover =
    latestSuggestions.length > 0 && triggerType !== "message_copilot";
  const showEmptyLanding =
    composerDockStyle &&
    messages.length === 0 &&
    !error &&
    status === "ready" &&
    !transcriptLoading;
  const showTranscriptLoading =
    transcriptLoading && messages.length === 0 && !error;
  const emptyLandingAlign = resolveCopilotEmptyLandingAlign({
    bodyOnly,
    composerDockStyle,
    emptyLandingAlign: emptyLandingAlignProp,
    preferCenter: centerEmptyLandingProp,
    showEmptyLanding,
  });
  const centerEmptyLanding = emptyLandingAlign === "center";
  const showEmptyLandingChrome = emptyLandingAlign != null;

  // The flap only auto-expands where the reply isn't already on screen — the
  // compact launcher/popover, which renders the composer shell directly (not
  // this panel). Every surface routed through CopilotPanelContent (drawer AND
  // full chat) shows the reply in the transcript above, so the flap must never
  // auto-expand its content over it. (`transcriptSurface === "chat"` only covered
  // full chat; the drawer uses "default" and was still auto-opening.) A reply
  // only exists once `messages` is non-empty, so this gate disables auto-expand
  // for any threaded surface while leaving manual expand (click/drag) intact.
  const resolvedAutoExpand =
    autoExpand && transcriptSurface !== "chat" && messages.length === 0;

  const { scrollAreaRef, showTranscriptTopFade } =
    useCopilotPanelTranscriptScroll({
      autoScrollKey,
      draft,
      messages,
      pendingUserText,
      pendingUserParts,
      showTranscriptLoading,
      status,
    });

  // Last-resort guard: surface a visible error when the backend drops the
  // stream silently (e.g. task-dispatcher not running, AI service down).
  const lastAssistantMessageId = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m && "role" in m && (m as { role: string }).role === "assistant") {
        return m.id;
      }
    }
    return null;
  })();
  const noResponseTimedOut = useChatNoResponseGuard({
    activityKey: streamActivityCount ?? null,
    lastAssistantMessageId,
    status,
    threadId,
  });

  const header = (
    <CopilotPanelInlineHeader
      agentSessionChooser={agentSessionChooser}
      attachLabel={attachLabel}
      browserPanelLabel={browserPanelLabel}
      browserPanelOpen={browserPanelOpen}
      chatKind={chatKind}
      clearLabel={clearLabel}
      closeLabel={closeLabel}
      contextMenuLabel={contextMenuLabel}
      contextOptions={contextOptions}
      detachLabel={detachLabel}
      headerChrome={headerChrome}
      headerVariant={headerVariant}
      onClose={onClose}
      onNewChat={onNewChat}
      onPanelModeChange={onPanelModeChange}
      onSelectContext={onSelectContext}
      onToggleBrowserPanel={onToggleBrowserPanel}
      panelMode={panelMode}
      positionMenu={positionMenu}
      recentContextMenuLabel={recentContextMenuLabel}
      recentContextOptions={recentContextOptions}
      selectedContextId={selectedContextId}
      showAgentChooser={showAgentChooser}
      showHeaderContext={showHeaderContext}
      title={title}
    />
  );

  const transcriptScrollHidden = showEmptyLandingChrome;
  const transcriptScrollShellClassName = transcriptScrollHidden
    ? "hidden"
    : compact
      ? "max-h-20 min-h-0 flex-1"
      : showEmptyLanding
        ? "min-h-0 flex-1 overflow-hidden"
        : "h-full min-h-0 flex-1";
  const transcriptScrollAreaClassName = transcriptScrollHidden
    ? "hidden"
    : compact
      ? "size-full px-1 pt-4"
      : "size-full px-3";
  const showTranscriptScrollTopFade = !(compact || transcriptScrollHidden);
  // Pad scroll *content* + composer (not the ScrollArea shell) so the
  // scrollbar stays on the far right while messages clear the float card.
  const threadContextFloatPad = {
    paddingRight: `var(${THREAD_CONTEXT_INLINE_PAD_VAR}, 0px)`,
  } as const;
  const composerFloatPad = {
    paddingRight:
      contentBodyGutter === "flush"
        ? `calc(0.75rem + var(${THREAD_CONTEXT_INLINE_PAD_VAR}, 0px))`
        : `var(${THREAD_CONTEXT_INLINE_PAD_VAR}, 0px)`,
  } as const;

  const body = (
    <div
      className={
        compact
          ? "flex min-h-0 flex-1 flex-col gap-1 px-3 pb-3"
          : composerDockStyle
            ? cn(
                "flex min-h-0 flex-1 flex-col gap-2 pb-3",
                contentBodyGutter === "flush" ? "px-0 pt-0" : "px-3 pt-0",
                centerEmptyLanding && "justify-center pb-[12vh]",
                emptyLandingAlign === "start" && "justify-start pt-0"
              )
            : "flex min-h-0 flex-1 flex-col gap-4 px-3 pt-0 pb-3"
      }
    >
      {!minimalChrome &&
        routeStatusLabel &&
        !showHeaderContext &&
        !showAgentChooser && (
          <p
            aria-live="polite"
            className="shrink-0 rounded-md bg-muted/50 px-2 py-1 text-muted-foreground text-xs"
            role="status"
          >
            {routeStatusLabel}
          </p>
        )}
      {browserPanelOpen && browserPanel ? (
        <div className="shrink-0">{browserPanel}</div>
      ) : null}
      <CopilotDebugDetails payload={debugPayload} title="Context payload" />
      <CopilotDebugDetails payload={agentDebugPayload} title="Agent info" />
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm">
          <p>{error.message}</p>
        </div>
      )}
      <div
        className={cn("relative", transcriptScrollShellClassName)}
        style={
          bodyOnly
            ? ({
                "--copilot-fade-color": "var(--color-background)",
              } as React.CSSProperties)
            : undefined
        }
      >
        {showTranscriptScrollTopFade ? (
          <div
            aria-hidden
            className={cn(
              COPILOT_TRANSCRIPT_TOP_FADE_CLASS,
              showTranscriptTopFade ? "opacity-100" : "opacity-0"
            )}
          />
        ) : null}
        <ScrollArea
          className={transcriptScrollAreaClassName}
          ref={scrollAreaRef}
        >
          <div
            className={cn(
              compact
                ? "space-y-1"
                : composerDockStyle
                  ? cn(
                      "space-y-5 pt-3 pl-2",
                      resolveCopilotTranscriptBottomPaddingClass({
                        compact,
                        composerDockStyle,
                        status,
                      })
                    )
                  : cn(
                      "space-y-4 pt-3 pl-2",
                      resolveCopilotTranscriptBottomPaddingClass({
                        compact,
                        composerDockStyle,
                        status,
                      })
                    )
            )}
            style={threadContextFloatPad}
          >
            {!minimalChrome &&
              messages.length === 0 &&
              !error &&
              startMode === "manual" &&
              draft.trim().length > 0 && (
                <p className="text-muted-foreground text-sm">
                  {reviewPromptLabel}
                </p>
              )}
            {transcriptHeader ? (
              <div className={cn(transcriptContainerClassName, "empty:hidden")}>
                {transcriptHeader}
              </div>
            ) : null}
            {showTranscriptLoading ? (
              <CopilotTranscriptLoading
                className={transcriptContainerClassName}
                label={transcriptLoadingLabel}
                surface={transcriptSurface}
              />
            ) : (
              <ChatTranscriptErrorBoundary>
                <CopilotToolCallActionsProvider
                  awaitingInterrupt={awaitingInterrupt}
                  dismissInterrupt={dismissInterrupt}
                  onSandboxCommandApprove={onSandboxCommandApprove}
                  onSandboxCommandReject={onSandboxCommandReject}
                  openInterrupt={openInterrupt}
                  optimisticInterruptResults={optimisticInterruptResults}
                  pendingInterruptToolCallIds={pendingInterruptToolCallIds}
                  respond={respond}
                  submitMessage={(text) => submitMessage(text)}
                >
                  <CopilotTranscript
                    awaitingInterrupt={awaitingInterrupt}
                    containerClassName={cn(
                      transcriptContainerClassName,
                      "motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-out"
                    )}
                    dockedInterruptToolCallId={dockedInterruptToolCallId}
                    messages={messages}
                    openInterrupt={openInterrupt}
                    pendingUserInsertIndex={pendingUserInsertIndex}
                    pendingUserParts={pendingUserParts}
                    pendingUserText={pendingUserText}
                    showAuthorLabels={showAuthorLabels}
                    status={status}
                    subAgentFullViewLabel={subAgentFullViewLabel}
                    subAgentSectionLabels={subAgentSectionLabels}
                    surface={transcriptSurface}
                    thinkingLabel={thinkingLabel}
                    threadId={threadId}
                    toolCardDensity={toolCardDensity}
                  />
                </CopilotToolCallActionsProvider>
              </ChatTranscriptErrorBoundary>
            )}
            {noResponseTimedOut && (
              <div className={transcriptContainerClassName}>
                <ChatTranscriptErrorCard
                  message="The AI service did not respond. Check that the AI service is running and try again."
                  title="No response received"
                />
              </div>
            )}
            {showHitlInTranscript ? (
              <CopilotPanelHitlTranscriptBlock
                applySelectedLabel={applySelectedLabel}
                cancelLabel={cancelLabel}
                isApplying={isApplying}
                latestSuggestions={latestSuggestions}
                onApplySuggestions={onApplySuggestions}
                onCancel={onCancel}
                selectedCandidateValues={selectedCandidateValues}
                selectedCountLabel={selectedCountLabel}
                selectedSuggestions={selectedSuggestions}
                setSelectedCandidateValues={setSelectedCandidateValues}
                setSelectedSuggestions={setSelectedSuggestions}
                suggestedUpdatesLabel={suggestedUpdatesLabel}
              />
            ) : null}
            {latestSuggestions.length === 0 ? (
              <CopilotPanelHitlAppliedBlock
                appliedSuggestions={appliedSuggestions}
                selectedCountLabel={selectedCountLabel}
                suggestedUpdatesLabel={suggestedUpdatesLabel}
              />
            ) : null}
            {applyError && (
              <p className="text-destructive text-sm">{applyError}</p>
            )}
            {artifactError && (
              <p className="text-destructive text-sm">
                {artifactLoadFailedLabel}: {artifactError}
              </p>
            )}
            {transcriptFooter ? (
              // `empty:hidden` because the slot is an ELEMENT that decides for
              // itself whether it has anything to say — without it a component
              // rendering null still leaves a gap under the last message.
              <div className={cn(transcriptContainerClassName, "empty:hidden")}>
                {transcriptFooter}
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </div>
      {showHitlInPopover ? (
        <CopilotPanelHitlPopover
          applySelectedLabel={applySelectedLabel}
          cancelLabel={cancelLabel}
          isApplying={isApplying}
          latestSuggestions={latestSuggestions}
          onApplySuggestions={onApplySuggestions}
          onCancel={onCancel}
          selectedCandidateValues={selectedCandidateValues}
          selectedCountLabel={selectedCountLabel}
          selectedSuggestions={selectedSuggestions}
          setSelectedCandidateValues={setSelectedCandidateValues}
          setSelectedSuggestions={setSelectedSuggestions}
          suggestedUpdatesLabel={suggestedUpdatesLabel}
        />
      ) : null}
      <div
        // A flush body draws no side gutter of its own — the transcript's
        // scroll area carries it. Repeat it here, or the composer runs to
        // both edges as soon as the lane is narrower than its measure. The
        // float reserve rides ON TOP of that gutter: as a bare inline
        // `padding-right` it would win over the class and leave the composer
        // flush on the right only.
        className={cn(contentBodyGutter === "flush" && "px-3")}
        style={composerFloatPad}
      >
        <CopilotPanelComposerBlock
          autoExpand={resolvedAutoExpand}
          centerEmptyLanding={centerEmptyLanding}
          compact={compact}
          compactContextControl={compactContextControl}
          composerDockStyle={composerDockStyle}
          composerFocusKey={composerFocusKey}
          composerLeadingControl={composerLeadingControl}
          composerOverride={composerOverride}
          composerPlaceholder={composerPlaceholder}
          composerWrapperClassName={composerWrapperClassName}
          dockedSurface={dockedInterruptSurface}
          draft={draft}
          emptyLandingAlign={emptyLandingAlign}
          emptyStateHeader={emptyStateHeader}
          emptyStateSubtitle={emptyStateSubtitle}
          emptyStateTitle={emptyStateTitle}
          enableStatusFlap={enableStatusFlap && !dockedInterruptSurface}
          engentyKind={engentyKind}
          error={error}
          mentionAgentCandidates={mentionAgentCandidates}
          mentionRefSearch={mentionRefSearch}
          messages={messages}
          onComposerMentionAgent={onComposerMentionAgent}
          onPressWizardCommand={onPressWizardCommand}
          onStop={onStop ?? onCancel}
          setDraft={setDraft}
          slashCommands={slashCommands}
          starterPrompts={starterPrompts}
          status={status}
          submitMessage={submitMessage}
          threadId={threadId}
          transcribeAudio={transcribeAudio}
          voiceInputEnabled={voiceInputEnabled}
          voiceInputLang={voiceInputLang}
        />
      </div>
    </div>
  );

  if (bodyOnly) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-transparent">
        {body}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-card">
      {header}
      {body}
    </div>
  );
}
