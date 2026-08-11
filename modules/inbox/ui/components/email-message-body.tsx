import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InboxMessage } from "../api.js";
import {
  splitQuotedEmailHtml,
  splitQuotedPlainText,
  stripTrailingHtmlChrome,
} from "../lib/email-reply-split.js";

/**
 * Render an email body with the quoted reply chain collapsed. HTML bodies are
 * sandboxed in an iframe (`allow-same-origin` only — no scripts) so we can
 * measure content height and grow the frame; plain-text bodies render as-is.
 */
export function EmailMessageBody({
  className,
  message,
}: {
  className?: string;
  message: InboxMessage;
}) {
  const { t } = useTranslation("inbox");
  const [showQuoted, setShowQuoted] = useState(false);

  const parts = useMemo(() => {
    if (message.body_html) {
      const { latest, quoted } = splitQuotedEmailHtml(message.body_html);
      return {
        kind: "html" as const,
        latest: stripTrailingHtmlChrome(latest),
        quoted,
      };
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
    <div className={cn("flex flex-col gap-2", className)}>
      {parts.kind === "html" ? (
        <SandboxedHtml html={visible} />
      ) : (
        <pre className="whitespace-pre-wrap break-words font-sans text-sm">
          {visible}
        </pre>
      )}
      {parts.quoted ? (
        <Button
          className="shrink-0 self-start"
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

function measureDocumentHeight(doc: Document): number {
  const { body, documentElement } = doc;
  return Math.ceil(
    Math.max(
      80,
      body?.scrollHeight ?? 0,
      body?.offsetHeight ?? 0,
      documentElement?.scrollHeight ?? 0,
      documentElement?.offsetHeight ?? 0
    )
  );
}

function SandboxedHtml({
  className,
  html,
}: {
  className?: string;
  html: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(80);

  const srcDoc = useMemo(
    () =>
      `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>html,body{margin:0;overflow:hidden}body{font-family:system-ui,sans-serif;font-size:14px;padding:8px;word-break:break-word}</style></head><body>${html}</body></html>`,
    [html]
  );

  const syncHeight = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) {
      return;
    }
    setHeight(measureDocumentHeight(doc));
  }, []);

  useEffect(() => {
    setHeight(80);
  }, [srcDoc]);

  useEffect(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!(iframe && doc?.body)) {
      return;
    }

    syncHeight();

    const observer = new ResizeObserver(() => {
      syncHeight();
    });
    observer.observe(doc.body);

    const onImageLoad = () => syncHeight();
    for (const image of doc.images) {
      if (!image.complete) {
        image.addEventListener("load", onImageLoad);
        image.addEventListener("error", onImageLoad);
      }
    }

    return () => {
      observer.disconnect();
      for (const image of doc.images) {
        image.removeEventListener("load", onImageLoad);
        image.removeEventListener("error", onImageLoad);
      }
    };
  }, [srcDoc, syncHeight]);

  return (
    <iframe
      className={cn("block w-full border-0 bg-transparent", className)}
      onLoad={syncHeight}
      ref={iframeRef}
      sandbox="allow-same-origin"
      scrolling="no"
      srcDoc={srcDoc}
      style={{ height, overflow: "hidden" }}
      title="email-body"
    />
  );
}
