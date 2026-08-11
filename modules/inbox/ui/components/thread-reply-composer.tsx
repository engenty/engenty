import { RichEditor } from "@engenty/tiptap-editor";
import "@engenty/tiptap-editor/styles.css";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Input, Label } from "@engenty/ui-core";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { InboxThreadDetail } from "../api.js";

const DRAFT_KEY_PREFIX = "engenty.inbox.replyDraft.";

export interface ReplyDraft {
  bodyMarkdown: string;
  subject: string;
  to: string;
}

function draftStorageKey(threadId: string): string {
  return `${DRAFT_KEY_PREFIX}${threadId}`;
}

export function readReplyDraft(threadId: string): ReplyDraft | null {
  try {
    const raw = sessionStorage.getItem(draftStorageKey(threadId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<ReplyDraft>;
    if (
      typeof parsed.to !== "string" ||
      typeof parsed.subject !== "string" ||
      typeof parsed.bodyMarkdown !== "string"
    ) {
      return null;
    }
    return {
      bodyMarkdown: parsed.bodyMarkdown,
      subject: parsed.subject,
      to: parsed.to,
    };
  } catch {
    return null;
  }
}

export function writeReplyDraft(threadId: string, draft: ReplyDraft): void {
  sessionStorage.setItem(draftStorageKey(threadId), JSON.stringify(draft));
}

export function clearReplyDraft(threadId: string): void {
  sessionStorage.removeItem(draftStorageKey(threadId));
}

export function defaultReplyTo(
  detail: InboxThreadDetail,
  ownEmails: Set<string>
): string {
  for (const message of detail.messages.toReversed()) {
    const email = message.from_email?.trim().toLowerCase();
    if (email && !ownEmails.has(email)) {
      return message.from_email?.trim() ?? email;
    }
  }
  return detail.thread.participants
    .filter((email) => !ownEmails.has(email.toLowerCase()))
    .join(", ");
}

export function defaultReplySubject(
  subject: string | null | undefined
): string {
  const trimmed = subject?.trim() ?? "";
  if (!trimmed) {
    return "";
  }
  return /^re:\s/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

/**
 * In-thread email reply composer. Send persists a local draft only — provider
 * send is not wired yet.
 */
export function ThreadReplyComposer({
  detail,
  ownEmails,
}: {
  detail: InboxThreadDetail;
  ownEmails: Set<string>;
}) {
  const { t } = useTranslation("inbox");
  const threadId = detail.thread.id;
  const defaults = useMemo(
    () => ({
      bodyMarkdown: "",
      subject: defaultReplySubject(detail.thread.subject),
      to: defaultReplyTo(detail, ownEmails),
    }),
    [detail, ownEmails]
  );

  const [to, setTo] = useState(defaults.to);
  const [subject, setSubject] = useState(defaults.subject);
  const [bodyMarkdown, setBodyMarkdown] = useState(defaults.bodyMarkdown);
  const [editorKey, setEditorKey] = useState(0);

  useEffect(() => {
    const stored = readReplyDraft(threadId);
    setTo(stored?.to ?? defaults.to);
    setSubject(stored?.subject ?? defaults.subject);
    setBodyMarkdown(stored?.bodyMarkdown ?? "");
    setEditorKey((key) => key + 1);
  }, [threadId, defaults]);

  const onSaveDraft = () => {
    writeReplyDraft(threadId, { bodyMarkdown, subject, to });
    toast.success(t("footer.draftSaved"));
  };

  const onDiscard = () => {
    clearReplyDraft(threadId);
    setTo(defaults.to);
    setSubject(defaults.subject);
    setBodyMarkdown("");
    setEditorKey((key) => key + 1);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <Label
            className="w-14 shrink-0 text-muted-foreground text-xs"
            htmlFor="inbox-reply-to"
          >
            {t("footer.to")}
          </Label>
          <Input
            className="h-8"
            id="inbox-reply-to"
            onChange={(event) => setTo(event.target.value)}
            value={to}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label
            className="w-14 shrink-0 text-muted-foreground text-xs"
            htmlFor="inbox-reply-subject"
          >
            {t("footer.subject")}
          </Label>
          <Input
            className="h-8"
            id="inbox-reply-subject"
            onChange={(event) => setSubject(event.target.value)}
            value={subject}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-md border bg-background">
        <RichEditor
          className="min-h-[8rem] text-sm [&_.tiptap-toolbar]:border-b [&_.tiptap]:min-h-[6rem] [&_.tiptap]:px-3 [&_.tiptap]:py-2"
          key={`${threadId}-${editorKey}`}
          markdown={bodyMarkdown}
          onChange={(_json, markdown) => setBodyMarkdown(markdown)}
          placeholder={t("footer.replyPlaceholder")}
          showBlockChrome={false}
          showToolbar
          slashCommands={false}
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button onClick={onDiscard} size="sm" type="button" variant="ghost">
          {t("footer.discard")}
        </Button>
        <Button onClick={onSaveDraft} size="sm" type="button">
          {t("footer.send")}
        </Button>
      </div>
    </div>
  );
}
