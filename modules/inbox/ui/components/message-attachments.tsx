import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import { badgeVariants, cn, Skeleton } from "@engenty/ui-core";
import { Loader2, Paperclip } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { InboxAttachmentMeta } from "../api.js";
import { getInboxAttachment } from "../api.js";
import { isImageAttachment } from "../lib/is-image-attachment.js";
import { openInboxAttachmentFile } from "../lib/open-inbox-attachment.js";
import { inboxKeys, useInboxAttachmentQuery } from "../queries.js";

function formatSize(size: number | null | undefined): string {
  if (!size) {
    return "";
  }
  return ` (${Math.max(1, Math.round(size / 1024))} kB)`;
}

function useOpenInboxAttachment(messageId: string) {
  const { t } = useTranslation("inbox");
  const queryClient = useQueryClient();
  const [openingId, setOpeningId] = useState<string | null>(null);

  const openAttachment = async (attachment: InboxAttachmentMeta) => {
    const attachmentId = attachment.attachment_id;
    if (!attachmentId) {
      return;
    }

    setOpeningId(attachmentId);
    try {
      const data = await queryClient.fetchQuery({
        queryKey: inboxKeys.attachment(messageId, attachmentId),
        queryFn: ({ signal }) =>
          getInboxAttachment(
            { attachment_id: attachmentId, message_id: messageId },
            signal
          ),
        staleTime: 5 * 60_000,
      });
      openInboxAttachmentFile({
        dataBase64: data.data_base64,
        filename: data.filename ?? attachment.filename,
        mimeType: data.mime_type ?? attachment.mime_type,
      });
    } catch (error) {
      toast.error(t("toasts.attachmentOpenFailed", { error: String(error) }));
    } finally {
      setOpeningId(null);
    }
  };

  return { openAttachment, openingId };
}

function ImageAttachmentPreview({
  attachment,
  className,
  messageId,
}: {
  attachment: InboxAttachmentMeta;
  className?: string;
  messageId: string;
}) {
  const { t } = useTranslation("inbox");
  const { openAttachment } = useOpenInboxAttachment(messageId);
  const attachmentId = attachment.attachment_id;
  const query = useInboxAttachmentQuery(
    messageId,
    attachmentId,
    isImageAttachment(attachment)
  );
  const label = attachment.filename ?? t("thread.attachment");
  const src = useMemo(() => {
    if (!query.data?.data_base64) {
      return null;
    }
    const mime = query.data.mime_type ?? attachment.mime_type ?? "image/jpeg";
    return `data:${mime};base64,${query.data.data_base64}`;
  }, [attachment.mime_type, query.data]);

  const previewClassName = cn(
    "relative size-20 shrink-0 overflow-hidden rounded-md border bg-muted/30",
    src &&
      "cursor-pointer transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    className
  );

  if (query.isLoading) {
    return (
      <figure className={previewClassName} title={label}>
        <Skeleton className="size-full" />
      </figure>
    );
  }

  if (!src) {
    return (
      <figure className={previewClassName} title={label}>
        <div className="flex size-full items-center justify-center px-1 text-center text-[10px] text-muted-foreground">
          {label}
        </div>
      </figure>
    );
  }

  return (
    <button
      aria-label={t("thread.openAttachment", { name: label })}
      className={previewClassName}
      onClick={() => {
        void openAttachment(attachment);
      }}
      title={label}
      type="button"
    >
      <img
        alt=""
        aria-hidden
        className="size-full object-cover"
        height={80}
        loading="lazy"
        src={src}
        width={80}
      />
    </button>
  );
}

function FileAttachmentBadge({
  attachment,
  openingId,
  onOpen,
}: {
  attachment: InboxAttachmentMeta;
  openingId: string | null;
  onOpen: (attachment: InboxAttachmentMeta) => void;
}) {
  const { t } = useTranslation("inbox");
  const attachmentId = attachment.attachment_id;
  const isOpening = openingId === attachmentId;
  const label = attachment.filename ?? t("thread.attachment");

  return (
    <button
      aria-label={t("thread.openAttachment", { name: label })}
      className={cn(
        badgeVariants({ variant: "outline" }),
        "cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
      )}
      disabled={!attachmentId || isOpening}
      onClick={() => onOpen(attachment)}
      title={label}
      type="button"
    >
      {isOpening ? (
        <Loader2 className="mr-1 size-3 animate-spin" />
      ) : (
        <Paperclip className="mr-1 size-3" />
      )}
      {label}
      {formatSize(attachment.size)}
    </button>
  );
}

export function MessageAttachments({
  attachments,
  messageId,
}: {
  attachments: InboxAttachmentMeta[];
  messageId: string;
}) {
  const imageAttachments = attachments.filter(isImageAttachment);
  const fileAttachments = attachments.filter(
    (attachment) => !isImageAttachment(attachment)
  );
  const { openAttachment, openingId } = useOpenInboxAttachment(messageId);

  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t pt-2">
      {imageAttachments.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {imageAttachments.map((attachment, index) => (
            <ImageAttachmentPreview
              attachment={attachment}
              key={attachment.attachment_id ?? `image-${index}`}
              messageId={messageId}
            />
          ))}
        </div>
      ) : null}
      {fileAttachments.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {fileAttachments.map((attachment, index) => (
            <FileAttachmentBadge
              attachment={attachment}
              key={attachment.attachment_id ?? `file-${index}`}
              onOpen={(entry) => {
                void openAttachment(entry);
              }}
              openingId={openingId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
