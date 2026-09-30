import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { FileUp, TriangleAlert } from "lucide-react";
import { dragCarriesExecutable } from "../../../lib/chat-attachment-screen.js";
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_FILES,
} from "../../../lib/upload-chat-attachment.js";
import type { FileDragInfo } from "../../ai-elements/prompt-input";

/**
 * Replaces the composer's contents while files are dragged over the chat:
 * where to drop, how many, the limits, and a warning when the drag already
 * shows a program (names are only readable after the drop).
 */
export function ComposerDropOverlay({ drag }: { drag: FileDragInfo }) {
  const { t } = useTranslation("common");
  const count = drag.types.length;
  const warn = dragCarriesExecutable(drag.types);
  const tooMany = count > CHAT_ATTACHMENT_MAX_FILES;
  const Icon = warn ? TriangleAlert : FileUp;
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-20 flex items-center gap-3 rounded-[inherit] border-2 border-dashed px-4",
        warn
          ? "border-destructive/60 bg-card text-destructive"
          : "border-primary/60 bg-card text-foreground"
      )}
    >
      <Icon className={cn("size-5 shrink-0", warn ? "" : "text-primary")} />
      <div className="min-w-0 text-sm leading-tight">
        <p className="font-medium">
          {warn
            ? t("copilot.attachments.drop.executable")
            : count > 0
              ? t("copilot.attachments.drop.title", { count })
              : t("copilot.attachments.drop.titleUnknown")}
        </p>
        <p
          className={cn(
            "text-xs",
            tooMany ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {t("copilot.attachments.drop.limits", {
            maxFiles: CHAT_ATTACHMENT_MAX_FILES,
            maxMb: Math.round(CHAT_ATTACHMENT_MAX_BYTES / (1024 * 1024)),
          })}
        </p>
      </div>
    </div>
  );
}
