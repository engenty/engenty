"use client";

import type { AgentTurnMessageLike } from "@engenty/ag-ui-bridge";
import { Button, cn } from "@engenty/ui-core";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useState } from "react";
import type { SubmitMessage } from "../../../agent-provider/types.js";
import type { TranscribeSpeechAudio } from "../../../lib/speech/use-speech-to-text.js";
import { PromptInputProvider } from "../../ai-elements/prompt-input";
import { CHAT_LANE_COLUMN_CLASS } from "../chat-lane/chat-lane-layout.js";
import { CopilotCompactComposerShell } from "../composer/copilot-compact-composer-shell";
import type { StarterPromptItem } from "../composer/copilot-composer";
import { CopilotComposerSection } from "../composer/copilot-composer-section";
import { CopilotComposerUsageMeter } from "../composer/copilot-composer-usage-meter";
import { CopilotEmptyLandingIntro } from "./copilot-empty-landing-intro";
import type { CopilotEmptyLandingAlign } from "./copilot-panel-content-types";

export function CopilotPanelComposerBlock({
  autoExpand = true,
  centerEmptyLanding,
  compact,
  enableStatusFlap = true,
  composerDockStyle,
  composerFocusKey,
  composerLeadingControl,
  composerOverride,
  composerPlaceholder,
  composerWrapperClassName,
  dockedSurface,
  draft,
  emptyLandingAlign,
  emptyStateHeader,
  emptyStateSubtitle,
  emptyStateTitle,
  engentyKind,
  error,
  mentionAgentCandidates,
  mentionRefSearch,
  messages,
  onComposerMentionAgent,
  onStop,
  setDraft,
  onPressWizardCommand,
  slashCommands,
  starterPrompts,
  status,
  threadId = null,
  submitMessage,
  transcribeAudio,
  voiceInputEnabled = true,
  voiceInputLang,
}: {
  engentyKind?: import("@engenty/ai-core/browser").AgentEngentyKind;
  centerEmptyLanding: boolean;
  autoExpand?: boolean;
  compact: boolean;
  enableStatusFlap?: boolean;
  composerDockStyle: boolean;
  composerFocusKey?: string | number | null;
  composerLeadingControl?: ReactNode;
  composerOverride?: ReactNode;
  composerPlaceholder: string;
  composerWrapperClassName?: string;
  /** Docked surfaces (message queue, approval cards) — rendered as a flap
   *  attached directly behind the composer card (see shell `dockContent`). */
  dockedSurface?: ReactNode;
  draft: string;
  emptyLandingAlign?: CopilotEmptyLandingAlign;
  emptyStateHeader?: ReactNode;
  emptyStateSubtitle?: string;
  emptyStateTitle?: string;
  error?: Error | null;
  mentionAgentCandidates?: Array<{ handle: string; id: string; name: string }>;
  mentionRefSearch?: import("../composer/use-copilot-composer-mention.js").MentionRefSearch;
  messages: readonly (AgentTurnMessageLike & { id: string })[];
  onComposerMentionAgent?: (agentId: string) => void;
  onStop?: () => void;
  setDraft: Dispatch<SetStateAction<string>>;
  onPressWizardCommand?: import("../composer/copilot-composer-section.js").CopilotComposerSectionProps["onPressWizardCommand"];
  slashCommands?: import("../composer/copilot-slash-command.js").ChatSlashCommand[];
  starterPrompts?: StarterPromptItem[];
  status: "ready" | "streaming" | "submitted" | "error";
  threadId?: string | null;
  submitMessage: SubmitMessage;
  transcribeAudio?: TranscribeSpeechAudio;
  voiceInputEnabled?: boolean;
  voiceInputLang?: string;
}) {
  const [isMultiline, setIsMultiline] = useState(false);
  const showEmptyChrome = emptyLandingAlign != null || centerEmptyLanding;
  const emptyIntroAlignsStart = emptyLandingAlign === "start";

  return (
    <div
      className={
        composerWrapperClassName
          ? cn("shrink-0", composerWrapperClassName)
          : "shrink-0"
      }
      data-copilot-speech-scope
    >
      {showEmptyChrome ? (
        <CopilotEmptyLandingIntro
          alignStart={emptyIntroAlignsStart}
          header={emptyStateHeader}
          subtitle={emptyStateSubtitle}
          title={emptyStateTitle}
        />
      ) : null}
      <div
        className={cn(
          emptyIntroAlignsStart &&
            showEmptyChrome &&
            `${CHAT_LANE_COLUMN_CLASS} mt-16 md:mt-20`
        )}
      >
        <PromptInputProvider initialInput={draft}>
          <div className={cn("relative", showEmptyChrome && "w-full")}>
            {composerDockStyle ? (
              <CopilotCompactComposerShell
                autoExpand={autoExpand}
                belowCard={
                  composerLeadingControl ? (
                    <div className="flex items-center gap-2">
                      {composerLeadingControl}
                    </div>
                  ) : undefined
                }
                chatStatus={status}
                dockContent={dockedSurface}
                enableStatusFlap={enableStatusFlap}
                engentyKind={engentyKind}
                errorMessage={error?.message ?? null}
                forceActive={showEmptyChrome}
                isMultiline={isMultiline}
                messages={messages}
                threadId={threadId}
                variant="dock-tinted"
              >
                <CopilotComposerSection
                  compact
                  composerOverride={composerOverride}
                  composerPlaceholder={composerPlaceholder}
                  draft={draft}
                  focusComposerKey={composerFocusKey}
                  mentionAgentCandidates={mentionAgentCandidates}
                  mentionRefSearch={mentionRefSearch}
                  onComposerMentionAgent={onComposerMentionAgent}
                  onMultilineChange={setIsMultiline}
                  onPressWizardCommand={onPressWizardCommand}
                  onStop={onStop}
                  setDraft={setDraft}
                  showStarterPrompts={false}
                  slashCommands={slashCommands}
                  starterPrompts={starterPrompts}
                  status={status}
                  submitMessage={submitMessage}
                  transcribeAudio={transcribeAudio}
                  voiceInputEnabled={voiceInputEnabled}
                  voiceInputLang={voiceInputLang}
                />
              </CopilotCompactComposerShell>
            ) : compact ? (
              <CopilotCompactComposerShell
                autoExpand={autoExpand}
                chatStatus={status}
                dockContent={dockedSurface}
                enableStatusFlap={enableStatusFlap}
                engentyKind={engentyKind}
                errorMessage={error?.message ?? null}
                forceActive={showEmptyChrome}
                isMultiline={isMultiline}
                messages={messages}
                threadId={threadId}
              >
                <CopilotComposerSection
                  compact
                  composerOverride={composerOverride}
                  composerPlaceholder={composerPlaceholder}
                  draft={draft}
                  focusComposerKey={composerFocusKey}
                  mentionAgentCandidates={mentionAgentCandidates}
                  mentionRefSearch={mentionRefSearch}
                  onComposerMentionAgent={onComposerMentionAgent}
                  onMultilineChange={setIsMultiline}
                  onPressWizardCommand={onPressWizardCommand}
                  onStop={onStop}
                  setDraft={setDraft}
                  showStarterPrompts={false}
                  slashCommands={slashCommands}
                  status={status}
                  submitMessage={submitMessage}
                  transcribeAudio={transcribeAudio}
                  voiceInputEnabled={voiceInputEnabled}
                  voiceInputLang={voiceInputLang}
                />
              </CopilotCompactComposerShell>
            ) : (
              <div className="flex flex-col">
                {dockedSurface ? (
                  <div className="mb-3">{dockedSurface}</div>
                ) : null}
                <CopilotComposerSection
                  composerOverride={composerOverride}
                  composerPlaceholder={composerPlaceholder}
                  draft={draft}
                  focusComposerKey={composerFocusKey}
                  mentionAgentCandidates={mentionAgentCandidates}
                  mentionRefSearch={mentionRefSearch}
                  onComposerMentionAgent={onComposerMentionAgent}
                  onPressWizardCommand={onPressWizardCommand}
                  onStop={onStop}
                  setDraft={setDraft}
                  showStarterPrompts={messages.length === 0}
                  slashCommands={slashCommands}
                  starterPrompts={starterPrompts}
                  status={status}
                  submitMessage={submitMessage}
                  transcribeAudio={transcribeAudio}
                  voiceInputEnabled={voiceInputEnabled}
                  voiceInputLang={voiceInputLang}
                />
                <CopilotComposerUsageMeter
                  chatStatus={status}
                  threadId={threadId}
                />
              </div>
            )}
          </div>
        </PromptInputProvider>
        {showEmptyChrome && starterPrompts && starterPrompts.length > 0 ? (
          <div
            className={cn(
              "mt-4 flex flex-wrap gap-2",
              emptyIntroAlignsStart ? "justify-start" : "justify-center"
            )}
          >
            {starterPrompts.map((item) => (
              <Button
                className="h-9 rounded-full bg-background/80 px-4 font-normal shadow-sm"
                key={item.id}
                onClick={() => setDraft(item.prompt)}
                size="sm"
                type="button"
                variant="outline"
              >
                {item.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
