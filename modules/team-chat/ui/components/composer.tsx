import {
  CHAT_ATTACHMENT_MAX_FILES,
  type ChatAttachmentUpload,
  uploadChatAttachment,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Avatar,
  AvatarFallback,
  Button,
  cn,
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerSearch,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@engenty/ui-core";
import {
  AtSign,
  Bot,
  Loader2,
  Megaphone,
  Paperclip,
  SendHorizonal,
  SmilePlus,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { currentTenantId, isImageMime } from "../lib/attachments.js";
import { authorInitials } from "../lib/format.js";

/** Icon button wrapped in a tooltip (the composer controls are icon-only). */
function ActionTip({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export interface MentionCandidate {
  id: string;
  /** Token written into the message text, e.g. `<@u:uuid>` or `<!here>`. */
  insert: string;
  kind: "agent" | "broadcast" | "user";
  label: string;
  sublabel?: string;
}

export interface ComposerProps {
  /** Slim variant for inline thread replies (no chrome, no hint line). */
  compact?: boolean;
  /** Conversation id — groups uploaded attachments under its storage prefix. */
  conversationId?: string;
  disabled?: boolean;
  mentionCandidates?: MentionCandidate[];
  onSend: (text: string, files: ChatAttachmentUpload[]) => Promise<void> | void;
  placeholder: string;
  sending?: boolean;
}

const MENTION_QUERY = /(^|\s)@([\w.-]*)$/;

function useMentionState(
  text: string,
  cursor: number,
  candidates: MentionCandidate[]
) {
  return useMemo(() => {
    if (candidates.length === 0) {
      return null;
    }
    const match = MENTION_QUERY.exec(text.slice(0, cursor));
    if (!match) {
      return null;
    }
    const query = (match[2] ?? "").toLowerCase();
    const matches = candidates
      .filter(
        (candidate) =>
          !query ||
          candidate.label.toLowerCase().includes(query) ||
          candidate.sublabel?.toLowerCase().includes(query)
      )
      .slice(0, 8);
    if (matches.length === 0) {
      return null;
    }
    const start = cursor - (match[2]?.length ?? 0) - 1;
    return { end: cursor, matches, start };
  }, [text, cursor, candidates]);
}

interface PendingAttachment {
  id: string;
  previewUrl: string | null;
  upload: ChatAttachmentUpload | null;
  uploading: boolean;
}

export function Composer({
  compact = false,
  conversationId,
  disabled = false,
  mentionCandidates = [],
  onSend,
  placeholder,
  sending = false,
}: ComposerProps) {
  const { t } = useTranslation("team-chat");
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploading = attachments.some((attachment) => attachment.uploading);
  const canSend =
    !(disabled || sending || uploading) &&
    (text.trim().length > 0 || attachments.some((a) => a.upload));
  const mention = useMentionState(text, cursor, mentionCandidates);

  const addFiles = (files: FileList | File[]) => {
    const list = [...files].slice(
      0,
      Math.max(0, CHAT_ATTACHMENT_MAX_FILES - attachments.length)
    );
    for (const file of list) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setAttachments((previous) => [
        ...previous,
        {
          id,
          previewUrl: isImageMime(file.type) ? URL.createObjectURL(file) : null,
          upload: null,
          uploading: true,
        },
      ]);
      void (async () => {
        try {
          const tenantId = await currentTenantId();
          if (!tenantId) {
            throw new Error("no tenant");
          }
          const upload = await uploadChatAttachment({
            file,
            tenantId,
            threadId: conversationId
              ? `team-chat-${conversationId}`
              : "team-chat",
          });
          setAttachments((previous) =>
            previous.map((entry) =>
              entry.id === id ? { ...entry, upload, uploading: false } : entry
            )
          );
        } catch (error) {
          toast.error(t("toasts.uploadFailed", { error: String(error) }));
          setAttachments((previous) =>
            previous.filter((entry) => entry.id !== id)
          );
        }
      })();
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((previous) => previous.filter((entry) => entry.id !== id));
  };

  const insertAtCursor = (snippet: string) => {
    const textarea = textareaRef.current;
    const at = textarea?.selectionStart ?? text.length;
    const next = `${text.slice(0, at)}${snippet}${text.slice(at)}`;
    setText(next);
    const nextCursor = at + snippet.length;
    setCursor(nextCursor);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const submit = () => {
    const value = text.trim();
    const files = attachments
      .map((attachment) => attachment.upload)
      .filter((upload): upload is ChatAttachmentUpload => Boolean(upload));
    if (!canSend || (!value && files.length === 0)) {
      return;
    }
    setText("");
    setAttachments([]);
    void onSend(value, files);
  };

  const pick = (candidate: MentionCandidate) => {
    if (!mention) {
      return;
    }
    const next = `${text.slice(0, mention.start)}${candidate.insert} ${text.slice(mention.end)}`;
    setText(next);
    const nextCursor = mention.start + candidate.insert.length + 1;
    setCursor(nextCursor);
    setHighlight(0);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(nextCursor, nextCursor);
      }
    });
  };

  const syncCursor = (target: HTMLTextAreaElement) => {
    setCursor(target.selectionStart ?? target.value.length);
  };

  return (
    <div
      className={cn(
        "relative",
        compact ? "px-3 py-1.5" : "border-border/60 border-t bg-card px-4 py-3"
      )}
    >
      {mention ? (
        <div className="ui-canvas-floating absolute bottom-full left-4 z-30 mb-1 w-72 overflow-hidden rounded-md py-1">
          {mention.matches.map((candidate, index) => (
            <button
              className={cn(
                "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm",
                index === highlight ? "bg-muted" : "hover:bg-muted/60"
              )}
              key={candidate.id}
              onClick={() => pick(candidate)}
              onMouseEnter={() => setHighlight(index)}
              type="button"
            >
              {candidate.kind === "user" ? (
                <Avatar className="size-5">
                  <AvatarFallback className="text-[9px]">
                    {authorInitials(candidate.label)}
                  </AvatarFallback>
                </Avatar>
              ) : candidate.kind === "agent" ? (
                <Bot className="size-4 text-muted-foreground" />
              ) : (
                <Megaphone className="size-4 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">{candidate.label}</span>
              {candidate.sublabel ? (
                <span className="truncate text-muted-foreground text-xs">
                  {candidate.sublabel}
                </span>
              ) : null}
            </button>
          ))}
          <div className="flex items-center gap-1 border-border/60 border-t px-2 pt-1 text-[10px] text-muted-foreground">
            <AtSign className="size-3" /> {t("composer.mentionHint")}
          </div>
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <div className="mb-1.5 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <span
              className="ui-canvas-field relative inline-flex items-center gap-1.5 p-1 pr-6 text-xs"
              key={attachment.id}
            >
              {attachment.previewUrl ? (
                <img
                  alt=""
                  className="size-10 rounded-[3px] object-cover"
                  height={40}
                  src={attachment.previewUrl}
                  width={40}
                />
              ) : (
                <Paperclip className="size-4 text-muted-foreground" />
              )}
              <span className="max-w-36 truncate">
                {attachment.upload?.filename ?? "…"}
              </span>
              {attachment.uploading ? (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              ) : null}
              <button
                aria-label={t("composer.removeAttachment")}
                className="absolute top-0.5 right-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-muted"
                onClick={() => removeAttachment(attachment.id)}
                type="button"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <input
        className="hidden"
        multiple
        onChange={(event) => {
          if (event.target.files?.length) {
            addFiles(event.target.files);
            event.target.value = "";
          }
        }}
        ref={fileInputRef}
        type="file"
      />

      <div className="ui-canvas-field flex items-end gap-2 p-1.5">
        <ActionTip label={t("composer.attach")}>
          <Button
            aria-label={t("composer.attach")}
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
            size="icon-sm"
            variant="ghost"
          >
            <Paperclip className="size-4" />
          </Button>
        </ActionTip>
        <Popover onOpenChange={setEmojiOpen} open={emojiOpen}>
          <ActionTip label={t("composer.emoji")}>
            <PopoverTrigger asChild>
              <Button
                aria-label={t("composer.emoji")}
                disabled={disabled}
                size="icon-sm"
                variant="ghost"
              >
                <SmilePlus className="size-4" />
              </Button>
            </PopoverTrigger>
          </ActionTip>
          <PopoverContent align="start" className="w-fit p-0" side="top">
            <EmojiPicker
              className="h-[300px]"
              onEmojiSelect={({ emoji }) => {
                setEmojiOpen(false);
                insertAtCursor(emoji);
              }}
            >
              <EmojiPickerSearch />
              <EmojiPickerContent />
            </EmojiPicker>
          </PopoverContent>
        </Popover>
        <Textarea
          className="max-h-40 min-h-9 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          disabled={disabled}
          onChange={(event) => {
            setText(event.target.value);
            syncCursor(event.target);
            setHighlight(0);
          }}
          onClick={(event) => syncCursor(event.currentTarget)}
          onKeyDown={(event) => {
            if (mention) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlight((value) =>
                  Math.min(value + 1, mention.matches.length - 1)
                );
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlight((value) => Math.max(value - 1, 0));
                return;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                const candidate =
                  mention.matches[highlight] ?? mention.matches[0];
                if (candidate) {
                  pick(candidate);
                }
                return;
              }
              if (event.key === "Escape") {
                // Collapse the popover by moving the cursor marker off the query.
                setCursor(0);
                return;
              }
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          onKeyUp={(event) => syncCursor(event.currentTarget)}
          onPaste={(event) => {
            const files = [...(event.clipboardData?.files ?? [])];
            if (files.length > 0) {
              event.preventDefault();
              addFiles(files);
            }
          }}
          placeholder={placeholder}
          ref={textareaRef}
          rows={1}
          value={text}
        />
        <ActionTip label={t("composer.send")}>
          <Button
            aria-label={t("composer.send")}
            disabled={!canSend}
            onClick={submit}
            size="icon"
            variant={canSend ? "default" : "ghost"}
          >
            <SendHorizonal className="size-4" />
          </Button>
        </ActionTip>
      </div>
      {compact ? null : (
        <p className="mt-1 px-1 text-[11px] text-muted-foreground">
          {t("composer.hint")}
        </p>
      )}
    </div>
  );
}
