import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { useMemo, useState } from "react";
import type { InboxMessage } from "../api.js";
import {
  splitQuotedEmailHtml,
  splitQuotedPlainText,
} from "../lib/email-reply-split.js";

/**
 * Render an email body with the quoted reply chain collapsed. HTML bodies are
 * sandboxed in an iframe (`sandbox=""` — no scripts, no same-origin) instead
 * of being injected into the app DOM; plain-text bodies render as-is.
 */
export function EmailMessageBody({ message }: { message: InboxMessage }) {
  const { t } = useTranslation("inbox");
  const [showQuoted, setShowQuoted] = useState(false);

  const parts = useMemo(() => {
    if (message.body_html) {
      const { latest, quoted } = splitQuotedEmailHtml(message.body_html);
      return { kind: "html" as const, latest, quoted };
    }
    if (message.body_text) {
      const { latest, quoted } = splitQuotedPlainText(message.body_text);
      return { kind: "text" as const, latest, quoted };
    }
    return { kind: "empty" as const, latest: "", quoted: null };
  }, [message.body_html, message.body_text]);

  if (parts.kind === "empty") {
    return (
      <p className="text-muted-foreground text-sm">{t("thread.emptyBody")}</p>
    );
  }

  const visible =
    showQuoted && parts.quoted ? parts.latest + parts.quoted : parts.latest;

  return (
    <div className="space-y-2">
      {parts.kind === "html" ? (
        <SandboxedHtml html={visible} />
      ) : (
        <pre className="whitespace-pre-wrap break-words font-sans text-sm">
          {visible}
        </pre>
      )}
      {parts.quoted ? (
        <Button
          onClick={() => setShowQuoted((value) => !value)}
          size="sm"
          variant="ghost"
        >
          {showQuoted ? t("thread.hideQuoted") : t("thread.showQuoted")}
        </Button>
      ) : null}
    </div>
  );
}

function SandboxedHtml({ html }: { html: string }) {
  const srcDoc = useMemo(
    () =>
      `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{font-family:system-ui,sans-serif;font-size:14px;margin:8px;word-break:break-word}</style></head><body>${html}</body></html>`,
    [html]
  );
  return (
    <iframe
      className="min-h-40 w-full rounded border-0 bg-white"
      sandbox=""
      srcDoc={srcDoc}
      title="email-body"
    />
  );
}
