import { useTranslation } from "@engenty/i18n/ui";
import { Avatar, AvatarFallback, Button, cn, Textarea } from "@engenty/ui-core";
import { AtSign, Bot, Megaphone, SendHorizonal } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { authorInitials } from "../lib/format.js";

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
  disabled?: boolean;
  mentionCandidates?: MentionCandidate[];
  onSend: (text: string) => Promise<void> | void;
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

export function Composer({
  compact = false,
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const canSend = !(disabled || sending) && text.trim().length > 0;
  const mention = useMentionState(text, cursor, mentionCandidates);

  const submit = () => {
    const value = text.trim();
    if (!(canSend && value)) {
      return;
    }
    setText("");
    void onSend(value);
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

      <div className="ui-canvas-field flex items-end gap-2 p-1.5">
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
          placeholder={placeholder}
          ref={textareaRef}
          rows={1}
          value={text}
        />
        <Button
          aria-label={t("composer.send")}
          disabled={!canSend}
          onClick={submit}
          size="icon"
          variant={canSend ? "default" : "ghost"}
        >
          <SendHorizonal className="size-4" />
        </Button>
      </div>
      {compact ? null : (
        <p className="mt-1 px-1 text-[11px] text-muted-foreground">
          {t("composer.hint")}
        </p>
      )}
    </div>
  );
}
