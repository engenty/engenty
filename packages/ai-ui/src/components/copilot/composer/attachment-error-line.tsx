import { useTranslation } from "@engenty/i18n/ui";
import { XIcon } from "lucide-react";
import { useEffect } from "react";

/** How long a file-picking error stays before it hides itself. */
const AUTO_HIDE_MS = 6000;

export interface AttachmentError {
  message: string;
  /** Stays until closed: the draft is waiting on it (a failed upload). */
  sticky?: boolean;
}

/**
 * The composer's attachment error: hides after a few seconds unless sticky,
 * and the × closes it at once.
 */
export function AttachmentErrorLine({
  error,
  onDismiss,
}: {
  error: AttachmentError;
  onDismiss: () => void;
}) {
  const { t } = useTranslation("common");
  useEffect(() => {
    if (error.sticky) {
      return;
    }
    const timer = setTimeout(onDismiss, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [error, onDismiss]);

  return (
    <div
      className="mx-1 mb-1 flex items-start gap-2 rounded-md bg-destructive/10 py-1 pr-1 pl-2 text-destructive text-xs"
      role="alert"
    >
      <p className="min-w-0 flex-1 py-0.5">{error.message}</p>
      <button
        aria-label={t("copilot.attachments.dismissError")}
        className="rounded p-0.5 hover:bg-destructive/15"
        onClick={onDismiss}
        type="button"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}
