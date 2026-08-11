import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@engenty/ui-core";
import { Download } from "lucide-react";
import { useMemo } from "react";
import type { InboxAttachmentMeta } from "../api.js";
import { openInboxAttachmentFile } from "../lib/open-inbox-attachment.js";
import { useInboxAttachmentQuery } from "../queries.js";

export interface LightboxTarget {
  attachment: InboxAttachmentMeta;
  messageId: string;
}

/** Full-size preview for image attachments, with a download escape hatch. */
export function AttachmentLightbox({
  onOpenChange,
  target,
}: {
  onOpenChange: (open: boolean) => void;
  target: LightboxTarget | null;
}) {
  const { t } = useTranslation("inbox");
  const messageId = target?.messageId ?? "";
  const attachmentId = target?.attachment.attachment_id ?? null;
  const query = useInboxAttachmentQuery(
    messageId,
    attachmentId,
    Boolean(target)
  );
  const label = target?.attachment.filename ?? t("thread.attachment");
  const src = useMemo(() => {
    if (!query.data?.data_base64) {
      return null;
    }
    const mime =
      query.data.mime_type ?? target?.attachment.mime_type ?? "image/jpeg";
    return `data:${mime};base64,${query.data.data_base64}`;
  }, [query.data, target]);

  return (
    <Dialog onOpenChange={onOpenChange} open={Boolean(target)}>
      {/* Near-fullscreen: mail screenshots are wide, and shrinking them to a
          dialog-sized box defeats the point of opening them. */}
      <DialogContent className="flex h-[96vh] max-h-[96vh] w-[96vw] max-w-[96vw] flex-col gap-3 sm:max-w-[96vw]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="truncate pr-8 text-sm">{label}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-md bg-muted/30">
          {src ? (
            // biome-ignore lint/correctness/useImageSize: attachment preview scales to viewport; dimensions unknown until load
            <img
              alt={label}
              className="max-h-full w-auto max-w-full object-contain"
              src={src}
            />
          ) : (
            <Skeleton className="size-full" />
          )}
        </div>
        <div className="flex shrink-0 justify-end">
          <Button
            disabled={!query.data}
            onClick={() => {
              if (!query.data) {
                return;
              }
              openInboxAttachmentFile({
                dataBase64: query.data.data_base64,
                download: true,
                filename: query.data.filename ?? label,
                mimeType: query.data.mime_type ?? null,
              });
            }}
            size="sm"
            variant="outline"
          >
            <Download className="size-4" /> {t("thread.downloadAttachment")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
