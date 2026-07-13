"use client";

import { Button, cn } from "@engenty/ui-core";
import { FileText, X } from "lucide-react";
import { usePromptInputAttachments } from "./prompt-input-local-context.js";

function isImage(mediaType: string | undefined): boolean {
  return typeof mediaType === "string" && mediaType.startsWith("image/");
}

export interface PromptInputAttachmentsProps {
  className?: string;
}

/**
 * Preview row for pending composer attachments: image thumbnails and file
 * chips, each removable. Renders nothing when there are no attachments. Reads
 * the shared attachment state (`usePromptInputAttachments`), so it works in the
 * global `PromptInputProvider` and the local `PromptInput` alike.
 */
export function PromptInputAttachments({
  className,
}: PromptInputAttachmentsProps) {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap gap-2 px-1 pt-1", className)}>
      {attachments.files.map((file) => {
        const label = file.filename ?? "attachment";
        return (
          <div
            className="group relative flex items-center gap-2 rounded-lg border border-border bg-muted/40 py-1 pr-1 pl-2"
            key={file.id}
          >
            {isImage(file.mediaType) && file.url ? (
              <img
                alt={label}
                className="size-9 rounded-md object-cover"
                height={36}
                src={file.url}
                width={36}
              />
            ) : (
              <span className="flex size-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                <FileText className="size-4" />
              </span>
            )}
            <span className="max-w-32 truncate text-xs" title={label}>
              {label}
            </span>
            <Button
              aria-label={`Remove ${label}`}
              className="size-6 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => attachments.remove(file.id)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
