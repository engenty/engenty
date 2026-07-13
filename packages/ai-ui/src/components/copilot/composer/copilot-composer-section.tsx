"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, DropdownMenuSeparator } from "@engenty/ui-core";
import { AnimatedSendIcon } from "@engenty/ui-icons";
import { ImageIcon, MessageSquarePlus, Mic, MicOff, XIcon } from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { EngentyAIContext } from "../../../agent-provider/engenty-ai-provider.js";
import type { SubmitMessage } from "../../../agent-provider/types.js";
import {
  resolveCopilotSpeechScopeRoot,
  useCopilotVoiceInputHotkey,
} from "../../../lib/speech/use-copilot-voice-input-hotkey.js";
import type { TranscribeSpeechAudio } from "../../../lib/speech/use-speech-to-text.js";
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_FILES,
  uploadChatAttachmentParts,
} from "../../../lib/upload-chat-attachment.js";
import {
  PromptInput,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  usePromptInputController,
} from "../../ai-elements/prompt-input";
import type { StarterPromptItem } from "./copilot-composer";
import { CopilotComposerMentionPopover } from "./copilot-composer-mention-popover";
import { CopilotComposerSpeechControl } from "./copilot-composer-speech-control";
import { useCopilotComposerMention } from "./use-copilot-composer-mention";
import { useCopilotComposerSpeech } from "./use-copilot-composer-speech";

export interface CopilotComposerSectionProps {
  compact?: boolean;
  compactCardChrome?: ReactNode;
  compactContextControl?: ReactNode;
  compactLeadingControl?: ReactNode;
  composerOverride?: ReactNode;
  composerPlaceholder: string;
  draft: string;
  /** When this key changes (after mount), focus the composer textarea. */
  focusComposerKey?: string | number | null;
  /** Optional @-mention targets (compact composer); choosing one sets per-send agent override. */
  mentionAgentCandidates?: Array<{ handle: string; id: string; name: string }>;
  onComposerMentionAgent?: (agentId: string) => void;
  onMultilineChange?: (multiline: boolean) => void;
  /** Start a fresh conversation from the composer (+) menu. Omit to hide it. */
  onNewChat?: () => void;
  /** Abort the in-flight AG-UI run (maps to PromptInputSubmit `onStop`). */
  onStop?: () => void;
  setDraft: Dispatch<SetStateAction<string>>;
  showStarterPrompts: boolean;
  starterPrompts?: StarterPromptItem[];
  status: "ready" | "streaming" | "submitted" | "error";
  submitMessage: SubmitMessage;
  transcribeAudio?: TranscribeSpeechAudio;
  voiceInputEnabled?: boolean;
  /** Toggle voice input with Mod+. in the copilot (default on). */
  voiceInputHotkeyEnabled?: boolean;
  voiceInputLang?: string;
}

/** Renders starter chips + PromptInput; must be used inside PromptInputProvider. */
export function CopilotComposerSection({
  compact = false,
  compactContextControl,
  compactLeadingControl,
  composerOverride,
  composerPlaceholder,
  draft,
  focusComposerKey,
  mentionAgentCandidates,
  onComposerMentionAgent,
  onNewChat,
  setDraft,
  showStarterPrompts,
  starterPrompts,
  status,
  submitMessage,
  onStop,
  transcribeAudio,
  voiceInputEnabled = true,
  voiceInputHotkeyEnabled = true,
  voiceInputLang,
  compactCardChrome,
  onMultilineChange,
}: CopilotComposerSectionProps) {
  const { t } = useTranslation("common");
  const attachments = usePromptInputAttachments();
  const controller = usePromptInputController();
  const aiContext = useContext(EngentyAIContext);
  const tenantId = aiContext?.tenantId ?? null;
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  useEffect(() => {
    controller.textInput.setInput(draft);
  }, [draft, controller.textInput]);

  const composerRootRef = useRef<HTMLDivElement | null>(null);
  const speechScopeRef = useRef<HTMLElement | null>(null);
  const prevFocusComposerKeyRef = useRef<string | number | null | undefined>(
    undefined
  );

  const assignComposerRoot = useCallback((node: HTMLDivElement | null) => {
    composerRootRef.current = node;
    speechScopeRef.current = resolveCopilotSpeechScopeRoot(node);
  }, []);

  const mention = useCopilotComposerMention({
    compact,
    mentionAgentCandidates,
    onComposerMentionAgent,
    setDraft,
  });

  useEffect(() => {
    if (focusComposerKey == null) {
      return;
    }
    if (prevFocusComposerKeyRef.current === undefined) {
      prevFocusComposerKeyRef.current = focusComposerKey;
      return;
    }
    if (prevFocusComposerKeyRef.current === focusComposerKey) {
      return;
    }
    prevFocusComposerKeyRef.current = focusComposerKey;
    const focusComposer = () => {
      const textarea =
        composerRootRef.current?.querySelector("textarea") ??
        mention.mentionComposerWrapRef.current?.querySelector("textarea");
      if (!(textarea instanceof HTMLTextAreaElement)) {
        return;
      }
      textarea.focus();
      const len = textarea.value.length;
      textarea.setSelectionRange(len, len);
    };
    let timeoutId: number | undefined;
    const frameId = requestAnimationFrame(() => {
      focusComposer();
      // AlertDialog / menu focus restore can run after the first frame.
      timeoutId = window.setTimeout(focusComposer, 0);
    });
    return () => {
      cancelAnimationFrame(frameId);
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };
  }, [focusComposerKey, mention.mentionComposerWrapRef]);

  const handleAddAttachments = useCallback(
    (event: Event) => {
      event.preventDefault();
      setAttachmentError(null);
      attachments.openFileDialog();
    },
    [attachments]
  );

  const handleAttachmentError = useCallback(
    (err: { code: "max_files" | "max_file_size" | "accept" }) => {
      if (err.code === "max_files") {
        setAttachmentError(t("copilot.attachments.tooMany"));
      } else if (err.code === "max_file_size") {
        setAttachmentError(t("copilot.attachments.tooLarge"));
      } else {
        setAttachmentError(t("copilot.attachments.rejected"));
      }
    },
    [t]
  );

  const handleNewChatSelect = useCallback(
    (event: Event) => {
      event.preventDefault();
      onNewChat?.();
    },
    [onNewChat]
  );

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      let text = message.text?.trim() ?? "";
      const files = message.files ?? [];
      if (!text && files.length === 0) {
        return;
      }
      const resolved = mention.resolveSubmitAgentOverride(text);
      text = resolved.text;
      if (!text && files.length === 0) {
        return;
      }

      let attachments: Awaited<ReturnType<typeof uploadChatAttachmentParts>> =
        [];
      if (files.length > 0) {
        if (!tenantId) {
          setAttachmentError(t("copilot.attachments.unavailable"));
          // Throw so PromptInput keeps the draft + attachments for a retry.
          throw new Error("chat_attachment_tenant_unavailable");
        }
        setAttachmentError(null);
        setIsUploadingAttachments(true);
        try {
          attachments = await uploadChatAttachmentParts({ files, tenantId });
        } catch {
          setAttachmentError(t("copilot.attachments.uploadFailed"));
          throw new Error("chat_attachment_upload_failed");
        } finally {
          setIsUploadingAttachments(false);
        }
      }

      submitMessage(text, {
        ...(resolved.requestedAgentId
          ? { requestedAgentId: resolved.requestedAgentId }
          : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      setDraft("");
      mention.clearMentionOnSubmit();
    },
    [mention, setDraft, submitMessage, t, tenantId]
  );

  const handleSilenceAutoSend = useCallback(
    (text: string) => {
      handleSubmit({ text, files: [] });
    },
    [handleSubmit]
  );

  const speech = useCopilotComposerSpeech({
    draft,
    onSilenceAutoSend: handleSilenceAutoSend,
    setDraft,
    status,
    transcribeAudio,
    voiceInputEnabled,
    voiceInputLang,
  });

  useCopilotVoiceInputHotkey({
    disabled:
      !(voiceInputHotkeyEnabled && voiceInputEnabled) ||
      status !== "ready" ||
      mention.mentionOpen,
    isProcessing: speech.isProcessing,
    isSupported: speech.isSupported,
    onToggle: speech.toggle,
    scopeRef: speechScopeRef,
  });

  const handleCompactKeyDown = useCallback<
    React.KeyboardEventHandler<HTMLTextAreaElement>
  >(
    (event) => {
      mention.handleMentionKeyDown(event);
    },
    [mention]
  );

  // One-row dock: when the textarea wraps to multiple lines, the +/- send
  // buttons move into the rounded corners (top-left / bottom-right).
  const [isMultiline, setIsMultiline] = useState(false);
  useEffect(() => {
    if (!compact) {
      return;
    }
    const el = mention.mentionComposerWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      const multiline = el.clientHeight > 40;
      setIsMultiline(multiline);
      onMultilineChange?.(multiline);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [compact, mention.mentionComposerWrapRef, onMultilineChange]);

  const isGenerating = status === "submitted" || status === "streaming";
  // Empty draft: the action button becomes the voice trigger; typing (or adding
  // an attachment) turns it into send. While listening it stays a stop-voice
  // control even as the transcript fills the draft.
  const showVoiceButton =
    voiceInputEnabled !== false &&
    speech.isSupported &&
    status === "ready" &&
    (speech.isListening ||
      speech.isProcessing ||
      (draft.trim().length === 0 && attachments.files.length === 0));

  const submitIcon =
    status === "error" ? (
      <XIcon className="size-4" />
    ) : (
      <AnimatedSendIcon size="sm" />
    );

  const speechControl = (
    <CopilotComposerSpeechControl
      listeningLabel={t("copilot.voiceInput.stop")}
      speech={speech}
      startLabel={t("copilot.voiceInput.start")}
      status={status}
      stopLabel={t("copilot.voiceInput.stop")}
    />
  );

  // Shared across both layouts: chips row + upload/error status line. Renders
  // inside PromptInputProvider so it can read the live attachment state.
  const attachmentsPreview = (
    <>
      <PromptInputAttachments className="mx-1 mb-2" />
      {isUploadingAttachments || attachmentError ? (
        <div
          className={cn(
            "mx-1 px-2 py-1.5 text-xs rounded",
            attachmentError ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {attachmentError ?? t("copilot.attachments.uploading")}
        </div>
      ) : null}
    </>
  );

  // Any file type is accepted — non-model files still land in the Vault.
  const attachmentInputProps = {
    maxFileSize: CHAT_ATTACHMENT_MAX_BYTES,
    maxFiles: CHAT_ATTACHMENT_MAX_FILES,
    multiple: true,
    onError: handleAttachmentError,
  } as const;

  if (composerOverride) {
    return (
      <div
        className={compact ? "relative" : "flex flex-col gap-3"}
        ref={assignComposerRoot}
      >
        {composerOverride}
      </div>
    );
  }

  if (compact) {
    // No footer controls -> everything fits one row (bottom dock).
    const singleRow = !(compactContextControl || compactLeadingControl);
    const actionMenu = (
      <PromptInputActionMenu>
        <PromptInputActionMenuTrigger
          aria-label="Add context"
          className="size-8 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
          size="icon-sm"
        />
        <PromptInputActionMenuContent align="start" className="z-45 w-56">
          {onNewChat ? (
            <>
              <PromptInputActionMenuItem onSelect={handleNewChatSelect}>
                <MessageSquarePlus className="size-4 shrink-0" />
                {t("copilot.newChat")}
              </PromptInputActionMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <PromptInputActionMenuItem onSelect={handleAddAttachments}>
            {t("copilot.attachments.add")}
          </PromptInputActionMenuItem>
          <PromptInputActionMenuItem disabled>
            Add current page
          </PromptInputActionMenuItem>
          <PromptInputActionMenuItem disabled>
            Add selection
          </PromptInputActionMenuItem>
        </PromptInputActionMenuContent>
      </PromptInputActionMenu>
    );
    const actionButton = showVoiceButton ? (
      <Button
        aria-label={
          speech.isListening
            ? t("copilot.voiceInput.stop")
            : t("copilot.voiceInput.start")
        }
        aria-pressed={speech.isListening}
        className="size-8 rounded-full shadow-none"
        disabled={speech.isProcessing}
        onClick={speech.toggle}
        size="icon-sm"
        type="button"
        variant="default"
      >
        {speech.isListening ? (
          <MicOff className="size-4" />
        ) : (
          <Mic className="size-4" />
        )}
      </Button>
    ) : (
      <PromptInputSubmit
        className={cn(
          "size-8 rounded-full shadow-none",
          isGenerating && onStop && "hover:bg-destructive/10"
        )}
        onStop={onStop}
        size="icon-sm"
        status={status}
        variant="default"
      >
        {isGenerating && onStop ? undefined : submitIcon}
      </PromptInputSubmit>
    );
    const textarea = (
      <PromptInputTextarea
        className="max-h-32 min-h-8 resize-none px-1 py-1.5 text-sm leading-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onChange={(e) =>
          mention.handleDraftControlledChange(
            e.currentTarget.value,
            e.currentTarget.selectionStart ?? e.currentTarget.value.length
          )
        }
        onKeyDown={handleCompactKeyDown}
        onSelect={(e) => {
          const t = e.currentTarget;
          const pos = t.selectionStart ?? t.value.length;
          if ((mentionAgentCandidates?.length ?? 0) > 0) {
            mention.updateMentionUi(t.value, pos);
          }
        }}
        placeholder={composerPlaceholder}
        rows={1}
      />
    );
    return (
      <div className="relative" ref={assignComposerRoot}>
        <PromptInput
          className="h-auto bg-transparent dark:bg-transparent"
          onSubmit={handleSubmit}
          plain
          {...attachmentInputProps}
        >
          {attachmentsPreview}
          {singleRow ? (
            <PromptInputBody>
              {/* Single line: clear the grip overlay (pr-7). Multiline: the
                  buttons tuck into the rounded corners (-m to match radius).
                  We switch container padding to pr-0 when multiline to place the send button
                  in the bottom-right corner, and apply compensating pr-7 on the textarea wrapper
                  so its available text width remains perfectly constant to avoid layout jittering. */}
              <div className="flex w-full gap-1.5">
                <div
                  className={cn(
                    "-ml-1",
                    isMultiline ? "self-start" : "self-center"
                  )}
                >
                  {actionMenu}
                </div>
                <div
                  className="relative min-w-0 flex-1 self-center"
                  ref={mention.mentionComposerWrapRef}
                >
                  {textarea}
                </div>
                {isMultiline && compactCardChrome ? (
                  <div className="-mr-1 flex flex-col justify-between self-stretch">
                    <div>{compactCardChrome}</div>
                    <div>{actionButton}</div>
                  </div>
                ) : (
                  <div className="-mr-1 flex items-center gap-1.5 self-end">
                    <div>{actionButton}</div>
                    {compactCardChrome}
                  </div>
                )}
              </div>
            </PromptInputBody>
          ) : (
            <>
              <PromptInputBody>
                <div
                  className="relative w-full"
                  ref={mention.mentionComposerWrapRef}
                >
                  {textarea}
                </div>
              </PromptInputBody>
              <PromptInputFooter className="items-center px-0 pt-0 pb-0">
                <PromptInputTools className="gap-1">
                  {compactLeadingControl}
                  {actionMenu}
                  {compactContextControl}
                </PromptInputTools>
                {actionButton}
              </PromptInputFooter>
            </>
          )}
        </PromptInput>
        <CopilotComposerMentionPopover
          applyMentionPick={mention.applyMentionPick}
          mentionFloatRef={mention.mentionFloatRef}
          mentionHighlight={mention.mentionHighlight}
          mentionOpen={mention.mentionOpen}
          mentionRows={mention.mentionRows}
          setMentionHighlight={mention.setMentionHighlight}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" ref={assignComposerRoot}>
      {showStarterPrompts && starterPrompts && starterPrompts.length > 0 && (
        <div className="shrink-0 overflow-x-auto overflow-y-hidden">
          <div className="flex flex-nowrap gap-2">
            {starterPrompts.map((item) => (
              <Button
                className="h-auto shrink-0 py-1.5 text-left font-normal"
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
        </div>
      )}
      <PromptInput onSubmit={handleSubmit} {...attachmentInputProps}>
        {attachmentsPreview}
        <PromptInputBody>
          <PromptInputTextarea
            className="min-h-[88px]"
            onChange={(e) => setDraft(e.target.value)}
            placeholder={composerPlaceholder}
          />
        </PromptInputBody>
        <PromptInputFooter className="pt-2">
          <PromptInputTools>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger
                aria-label={t("copilot.attachments.add")}
                className="size-8 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
                size="icon-sm"
              >
                <ImageIcon className="size-4" />
              </PromptInputActionMenuTrigger>
              <PromptInputActionMenuContent align="start" className="w-56">
                <PromptInputActionMenuItem onSelect={handleAddAttachments}>
                  {t("copilot.attachments.add")}
                </PromptInputActionMenuItem>
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
            {speechControl}
          </PromptInputTools>
          <PromptInputSubmit
            className={
              isGenerating && onStop
                ? "rounded-full hover:bg-destructive/10"
                : undefined
            }
            onStop={onStop}
            status={status}
            variant={isGenerating && onStop ? "ghost" : "default"}
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
