"use client";

import type { AgentTurnMessageLike } from "@engenty/ag-ui-bridge";
import { Button, cn, useBlobCharacterCycle } from "@engenty/ui-core";
import type { ReactNode } from "react";
import { useState } from "react";
import type { SubmitMessage } from "../../../agent-provider/types.js";
import type { TranscribeSpeechAudio } from "../../../lib/speech/use-speech-to-text.js";
import { PromptInputProvider } from "../../ai-elements/prompt-input";
import { CopilotCompactComposerShell } from "../composer/copilot-compact-composer-shell";
import type { StarterPromptItem } from "../composer/copilot-composer";
import { CopilotComposerSection } from "../composer/copilot-composer-section";
import { CopilotComposerUsageMeter } from "../composer/copilot-composer-usage-meter";

export function CopilotPanelComposerBlock({
  autoExpand = true,
  centerEmptyLanding,
  compact,
  enableStatusFlap = true,
  compactContextControl,
  composerDockStyle,
  composerFocusKey,
  composerLeadingControl,
  composerOverride,
  composerPlaceholder,
  composerWrapperClassName,
  draft,
  emptyStateSubtitle,
  emptyStateTitle,
  error,
  mentionAgentCandidates,
  mentionRefSearch,
  messages,
  onComposerMentionAgent,
  onStop,
  setDraft,
  slashCommands,
  starterPrompts,
  status,
  threadId = null,
  submitMessage,
  transcribeAudio,
  voiceInputEnabled = true,
  voiceInputLang,
}: {
  centerEmptyLanding: boolean;
  autoExpand?: boolean;
  compact: boolean;
  enableStatusFlap?: boolean;
  compactContextControl?: ReactNode;
  composerDockStyle: boolean;
  composerFocusKey?: string | number | null;
  composerLeadingControl?: ReactNode;
  composerOverride?: ReactNode;
  composerPlaceholder: string;
  composerWrapperClassName?: string;
  draft: string;
  emptyStateSubtitle?: string;
  emptyStateTitle?: string;
  error?: Error | null;
  mentionAgentCandidates?: Array<{ handle: string; id: string; name: string }>;
  mentionRefSearch?: import("../composer/use-copilot-composer-mention.js").MentionRefSearch;
  messages: readonly (AgentTurnMessageLike & { id: string })[];
  onComposerMentionAgent?: (agentId: string) => void;
  onStop?: () => void;
  setDraft: (value: string) => void;
  slashCommands?: import("../composer/copilot-slash-command.js").ChatSlashCommand[];
  starterPrompts?: StarterPromptItem[];
  status: "ready" | "streaming" | "submitted" | "error";
  threadId?: string | null;
  submitMessage: SubmitMessage;
  transcribeAudio?: TranscribeSpeechAudio;
  voiceInputEnabled?: boolean;
  voiceInputLang?: string;
}) {
  const blobCharacter = useBlobCharacterCycle();
  const [isMultiline, setIsMultiline] = useState(false);

  return (
    <div
      className={
        composerWrapperClassName
          ? cn("shrink-0", composerWrapperClassName)
          : "shrink-0"
      }
      data-copilot-speech-scope
    >
      {centerEmptyLanding && emptyStateTitle ? (
        <div className="mb-6 space-y-1 text-center">
          <p className="font-medium text-2xl text-foreground tracking-tight md:text-3xl">
            {emptyStateTitle}
          </p>
          {emptyStateSubtitle ? (
            <p className="text-muted-foreground text-sm">
              {emptyStateSubtitle}
            </p>
          ) : null}
        </div>
      ) : null}
      <PromptInputProvider initialInput={draft}>
        <div className={cn("relative", centerEmptyLanding && "w-full")}>
          {composerDockStyle ? (
            <CopilotCompactComposerShell
              autoExpand={autoExpand}
              belowCard={
                composerLeadingControl || compactContextControl ? (
                  <div className="flex items-center gap-2">
                    {composerLeadingControl}
                    {compactContextControl}
                  </div>
                ) : undefined
              }
              chatStatus={status}
              enableStatusFlap={enableStatusFlap}
              errorMessage={error?.message ?? null}
              forceActive={centerEmptyLanding}
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
              belowCard={
                compactContextControl ? (
                  <div className="flex items-center gap-2">
                    {compactContextControl}
                  </div>
                ) : undefined
              }
              chatStatus={status}
              enableStatusFlap={enableStatusFlap}
              errorMessage={error?.message ?? null}
              forceActive={centerEmptyLanding}
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
              <CopilotComposerSection
                composerOverride={composerOverride}
                composerPlaceholder={composerPlaceholder}
                draft={draft}
                focusComposerKey={composerFocusKey}
                mentionAgentCandidates={mentionAgentCandidates}
                mentionRefSearch={mentionRefSearch}
                onComposerMentionAgent={onComposerMentionAgent}
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
      {centerEmptyLanding && starterPrompts && starterPrompts.length > 0 ? (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
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
  );
}
