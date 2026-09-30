import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { TriangleAlert } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import {
  type ChatAttachmentScreen,
  screenChatAttachment,
} from "../../../lib/chat-attachment-screen.js";

interface PendingAsk {
  add: (files: File[]) => void;
  file: File;
  reason: Extract<ChatAttachmentScreen, { kind: "ask" }>["reason"];
}

/**
 * The composer side of attachment screening: blocked files become one error
 * line, files that need a yes wait in a notice above the chips.
 */
export function useAttachmentScreening(input: {
  setAttachmentError: (message: string | null) => void;
}): {
  notice: ReactNode;
  screenFiles: (files: File[], add: (files: File[]) => void) => void;
} {
  const { t } = useTranslation("common");
  const { setAttachmentError } = input;
  const [pending, setPending] = useState<PendingAsk[]>([]);

  const screenFiles = useCallback(
    (files: File[], add: (files: File[]) => void) => {
      setAttachmentError(null);
      Promise.all(files.map(screenChatAttachment)).then((results) => {
        const allowed: File[] = [];
        const blocked: string[] = [];
        const asks: PendingAsk[] = [];
        results.forEach((result, index) => {
          const file = files[index];
          if (!file) {
            return;
          }
          if (result.kind === "ok") {
            allowed.push(file);
          } else if (result.kind === "blocked") {
            blocked.push(
              t(`copilot.attachments.blocked.${result.reason}`, {
                name: file.name,
              })
            );
          } else {
            asks.push({ add, file, reason: result.reason });
          }
        });
        add(allowed);
        setAttachmentError(blocked.length > 0 ? blocked.join(" ") : null);
        if (asks.length > 0) {
          setPending((prev) => [...prev, ...asks]);
        }
      });
    },
    [setAttachmentError, t]
  );

  const settle = useCallback((ask: PendingAsk, attach: boolean) => {
    if (attach) {
      ask.add([ask.file]);
    }
    setPending((prev) => prev.filter((item) => item !== ask));
  }, []);

  const notice =
    pending.length > 0 ? (
      <div className="mx-1 mb-2 flex flex-col gap-1.5">
        {pending.map((ask) => (
          <div
            className={cn(
              "flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs"
            )}
            key={`${ask.file.name}-${ask.file.size}-${ask.file.lastModified}`}
          >
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <p className="min-w-0 flex-1">
              <span className="font-medium">{ask.file.name}</span>{" "}
              {t(`copilot.attachments.ask.${ask.reason}`)}
            </p>
            <Button
              className="h-6 px-2 text-xs"
              onClick={() => settle(ask, true)}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("copilot.attachments.ask.attach")}
            </Button>
            <Button
              className="h-6 px-2 text-xs"
              onClick={() => settle(ask, false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("copilot.attachments.ask.skip")}
            </Button>
          </div>
        ))}
      </div>
    ) : null;

  return { notice, screenFiles };
}
