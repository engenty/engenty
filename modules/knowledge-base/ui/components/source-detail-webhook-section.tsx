import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { Copy, RefreshCw } from "lucide-react";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import type { KbSource } from "../../src/schema/types.js";

function maskTail(value: string, visibleChars: number) {
  if (value.length <= visibleChars) {
    return value;
  }
  return `••••••••${value.slice(-visibleChars)}`;
}

export function SourceDetailWebhookSection({
  lastPlainToken,
  onRegenerate,
  regeneratePending,
  source,
}: {
  lastPlainToken: string | null;
  onRegenerate: () => void;
  regeneratePending: boolean;
  source: KbSource;
}) {
  const { t } = useTranslation("kb");

  const hasStoredSecret = Boolean(source.webhook_token_hash);
  const webhookPath = lastPlainToken
    ? `/api/kb/source-webhooks/${lastPlainToken}`
    : null;

  const maskedDisplay = useMemo(() => {
    if (lastPlainToken) {
      return maskTail(lastPlainToken, 6);
    }
    if (source.webhook_token_hash) {
      return maskTail(source.webhook_token_hash, 6);
    }
    return null;
  }, [lastPlainToken, source.webhook_token_hash]);

  const copyToClipboard = useCallback(async () => {
    if (!webhookPath) {
      return;
    }
    try {
      await navigator.clipboard.writeText(webhookPath);
      toast.success(t("sources.webhook_copied"));
    } catch {
      toast.error(t("sources.webhook_copy_failed"));
    }
  }, [t, webhookPath]);

  return (
    <div className="ui-canvas-panel rounded-lg border-0 bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="font-semibold text-sm">
            {t("sources.webhook_section_title")}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t("sources.webhook_section_hint")}
          </p>
        </div>
        <Button
          className="shrink-0"
          disabled={regeneratePending}
          onClick={onRegenerate}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCw className="mr-1.5 h-4 w-4" />
          {t("sources.webhook_regenerate")}
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        {maskedDisplay ? (
          <>
            <code className="min-w-0 flex-1 break-all rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">
              {lastPlainToken ? (
                <>
                  <span className="text-muted-foreground">
                    /api/kb/source-webhooks/
                  </span>
                  <span>{maskedDisplay}</span>
                </>
              ) : (
                <span className="text-muted-foreground">{maskedDisplay}</span>
              )}
            </code>
            <Button
              className="shrink-0"
              disabled={!webhookPath}
              onClick={() => void copyToClipboard()}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Copy className="mr-1.5 h-4 w-4" />
              {t("sources.webhook_copy")}
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("sources.webhook_no_token")}
          </p>
        )}
      </div>

      <p className="mt-2 text-muted-foreground text-xs">
        {lastPlainToken
          ? t("sources.webhook_copy_hint_plain")
          : hasStoredSecret
            ? t("sources.webhook_copy_hint_masked")
            : t("sources.webhook_copy_hint_generate")}
      </p>
    </div>
  );
}
