import { MessageResponse } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { Card, cn } from "@engenty/ui-core";
import type { InboxMessage, InboxMessageDigest } from "../api.js";
import { formatInboxRelativeTime } from "../lib/format-relative-time.js";
import { CategoryTag } from "./category-tag.js";
import { EmailMessageBody } from "./email-message-body.js";
import { MessageAttachments } from "./message-attachments.js";
import { DIGEST_PROSE_CLASSES } from "./thread-assistant-zone.js";

function initialsFor(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || "?";
  const words = source.split(/[\s.@_-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words[1]?.[0] ?? "")).toUpperCase();
}

/** Stable pastel bucket per sender so the chat view is scannable. */
const AVATAR_CLASSES = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
];

function avatarClassFor(key: string): string {
  let hash = 0;
  for (let index = 0; index < key.length; index++) {
    hash = Math.imul(31, hash) + key.charCodeAt(index);
  }
  return AVATAR_CLASSES[Math.abs(hash) % AVATAR_CLASSES.length];
}

export function DigestMessageRow({
  digest,
  message,
  own,
  pending,
}: {
  digest: InboxMessageDigest | undefined;
  message: InboxMessage;
  own: boolean;
  /** True while the digest is still being generated — show the original body. */
  pending?: boolean;
}) {
  const { i18n } = useTranslation("inbox");
  const senderKey = message.from_email ?? message.from_name ?? "?";
  const content = digest?.content_md.trim();
  return (
    <div className={cn("flex gap-2.5", own && "flex-row-reverse")}>
      <span
        className={cn(
          "mt-1 flex size-7 shrink-0 items-center justify-center rounded-full font-semibold text-[10px]",
          own ? "bg-primary/15 text-primary" : avatarClassFor(senderKey)
        )}
      >
        {initialsFor(message.from_name, message.from_email)}
      </span>
      <Card
        className={cn(
          "min-w-0 max-w-[85%] gap-0 px-3.5 py-2.5",
          own && "bg-primary/[0.04]",
          pending && "opacity-90"
        )}
      >
        <div
          className={cn(
            "flex items-baseline gap-2",
            own && "flex-row-reverse text-right"
          )}
        >
          <span className="truncate font-medium text-sm">
            {message.from_name ?? message.from_email ?? "—"}
          </span>
          <span className="shrink-0 text-muted-foreground text-xs">
            {formatInboxRelativeTime(
              message.received_at ?? message.created_at,
              i18n.language
            )}
          </span>
          {digest && digest.category !== "conversation" ? (
            <CategoryTag category={digest.category} />
          ) : null}
        </div>
        {content && !pending ? (
          <div className={DIGEST_PROSE_CLASSES}>
            <MessageResponse>{content}</MessageResponse>
          </div>
        ) : (
          <div className="mt-1">
            <EmailMessageBody message={message} />
            {message.attachments_json.length > 0 ? (
              <MessageAttachments
                attachments={message.attachments_json}
                messageId={message.id}
              />
            ) : null}
          </div>
        )}
        {digest && !pending && digest.attachments_json.length > 0 ? (
          <MessageAttachments
            attachments={digest.attachments_json}
            messageId={message.id}
          />
        ) : null}
      </Card>
    </div>
  );
}
