import { seedMastraStudioDevConfig } from "@engenty/environment";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Label } from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  fetchStudioStatus,
  resolveStudioGatewayBaseUrl,
  runStudioActivate,
  type StudioTenantStatusResponse,
  studioPageUrl,
} from "./studio-activate.js";

interface MastraStudioDevSectionProps {
  accessToken: string;
  studioGatewayBaseUrl?: string;
}

export function MastraStudioDevSection({
  accessToken,
  studioGatewayBaseUrl,
}: MastraStudioDevSectionProps) {
  const { t } = useTranslation("common");
  const { currentTenant } = useWorkspaceContext();
  const [copiedStudioHeader, setCopiedStudioHeader] = useState(false);
  const [activating, setActivating] = useState(false);
  const [studioStatus, setStudioStatus] =
    useState<StudioTenantStatusResponse | null>(null);
  const [lastError, setLastError] = useState<number | null>(null);
  const studioBaseUrl = resolveStudioGatewayBaseUrl(studioGatewayBaseUrl);

  const refreshStatus = useCallback(async () => {
    const result = await fetchStudioStatus(accessToken);
    if (result.ok) {
      setStudioStatus(result.status);
      setLastError(null);
      return;
    }
    setStudioStatus(null);
    setLastError(result.status);
  }, [accessToken]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleCopyStudioHeader = useCallback(async () => {
    seedMastraStudioDevConfig({
      accessToken,
      gatewayBaseUrl: studioBaseUrl,
    });
    await navigator.clipboard.writeText(`Bearer ${accessToken}`);
    setCopiedStudioHeader(true);
    window.setTimeout(() => setCopiedStudioHeader(false), 1500);
  }, [accessToken, studioBaseUrl]);

  const handleActivate = useCallback(async () => {
    setActivating(true);
    const result = await runStudioActivate({
      accessToken,
      gatewayBaseUrl: studioBaseUrl,
      origin: window.location.origin,
    });
    setActivating(false);
    if (result.ok) {
      setStudioStatus(result.status);
      setLastError(null);
      return;
    }
    setLastError(result.status);
  }, [accessToken, studioBaseUrl]);

  const studioOff = lastError === 404;
  const envMismatch = lastError === 409;
  const activeTenantId = studioStatus?.tenantId;
  const tenantMatches =
    Boolean(currentTenant?.id) && currentTenant?.id === activeTenantId;

  return (
    <div className="space-y-3">
      {currentTenant ? (
        <div className="flex items-center gap-4">
          <Label className="w-36 shrink-0 text-sm">
            {t("authSection.mastraStudioTenant")}
          </Label>
          <span className="flex-1 font-mono text-xs">
            {currentTenant.name} ({currentTenant.id})
          </span>
        </div>
      ) : null}
      {tenantMatches ? (
        <div className="flex items-center gap-4">
          <Label className="w-36 shrink-0 text-sm">
            {t("authSection.mastraStudioActiveTenant")}
          </Label>
          <span className="text-muted-foreground text-xs">
            {activeTenantId}
          </span>
        </div>
      ) : null}
      <div className="flex items-center gap-4">
        <Label className="w-36 shrink-0 text-sm">
          {t("authSection.mastraStudioUrl")}
        </Label>
        <code className="flex-1 rounded-sm bg-muted px-2 py-1 font-mono text-xs">
          {studioBaseUrl}
        </code>
      </div>
      <div className="flex items-center gap-4">
        <Label className="w-36 shrink-0 text-sm">
          {t("authSection.mastraStudioPrefix")}
        </Label>
        <code className="flex-1 rounded-sm bg-muted px-2 py-1 font-mono text-xs">
          /ai
        </code>
      </div>
      <div className="flex items-center gap-4">
        <Label className="w-36 shrink-0 text-sm">
          {t("authSection.mastraStudioHeader")}
        </Label>
        <Button
          onClick={handleCopyStudioHeader}
          size="sm"
          type="button"
          variant="outline"
        >
          {copiedStudioHeader ? (
            <Check className="mr-2 size-3.5" />
          ) : (
            <Copy className="mr-2 size-3.5" />
          )}
          {copiedStudioHeader
            ? t("authSection.mastraStudioCopied")
            : t("authSection.mastraStudioCopyHeader")}
        </Button>
      </div>
      {studioOff ? (
        <p className="text-muted-foreground text-xs">
          {t("authSection.mastraStudioNeedFlag")}
        </p>
      ) : null}
      {envMismatch ? (
        <p className="text-destructive text-xs">
          {t("authSection.mastraStudioEnvMismatch")}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 pl-[calc(theme(spacing.36)+1rem)]">
        <Button
          disabled={activating || studioOff || !currentTenant}
          onClick={() => void handleActivate()}
          size="sm"
          type="button"
        >
          {t("authSection.mastraStudioActivate")}
        </Button>
        <Button asChild size="sm" type="button" variant="outline">
          <a
            href={
              typeof window === "undefined"
                ? studioPageUrl(studioBaseUrl)
                : studioPageUrl(window.location.origin)
            }
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink className="mr-2 size-3.5" />
            {t("authSection.mastraStudioOpen")}
          </a>
        </Button>
      </div>
    </div>
  );
}
