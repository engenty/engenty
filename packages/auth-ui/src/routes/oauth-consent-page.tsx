import { Button } from "@engenty/ui-core";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { AuthLoginLayout } from "../components/auth-login-layout";
import { McpConsentForm } from "../components/mcp-consent-form";
import {
  AUTH_TRANSLATIONS,
  type AuthLocale,
  detectAuthLocale,
} from "../lib/auth-i18n";
import {
  type AuthorizationDetails,
  approveMcpConsent,
  denyMcpConsent,
  loadMcpConsent,
  type McpRiskLevel,
  pendingMcpLoginHref,
  redirectHost,
  type SpaceOption,
} from "../lib/mcp-consent";

type ConsentPhase = "loading" | "need_login" | "consent" | "error";

function ConsentShell({
  children,
  locale,
  onLocaleChange,
}: {
  children: ReactNode;
  locale: AuthLocale;
  onLocaleChange: (locale: AuthLocale) => void;
}) {
  return (
    <AuthLoginLayout locale={locale} onLocaleChange={onLocaleChange}>
      {children}
    </AuthLoginLayout>
  );
}

/** MCP OAuth consent, using the same branded shell as contextual sign-in. */
export function OAuthConsentPage() {
  const [searchParams] = useSearchParams();
  const authorizationId = searchParams.get("authorization_id")?.trim() ?? "";
  const [locale, setLocale] = useState<AuthLocale>(detectAuthLocale);
  const [phase, setPhase] = useState<ConsentPhase>("loading");
  const [loginTo, setLoginTo] = useState<string | null>(null);
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [spaces, setSpaces] = useState<SpaceOption[]>([]);
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([]);
  const [maxRiskLevel, setMaxRiskLevel] = useState<McpRiskLevel>("medium");
  const [accessToken, setAccessToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const t = AUTH_TRANSLATIONS[locale].mcpConsent;

  const load = useCallback(async () => {
    if (!authorizationId) {
      setError(t.missingRequest);
      setPhase("error");
      return;
    }
    setPhase("loading");
    setError(null);
    try {
      const result = await loadMcpConsent(authorizationId);
      if ("loginTo" in result) {
        setLoginTo(result.loginTo);
        setPhase("need_login");
        return;
      }
      setDetails(result.details);
      setSpaces(result.spaces);
      setSelectedSpaceIds(result.spaces[0]?.id ? [result.spaces[0].id] : []);
      setAccessToken(result.token);
      setPhase("consent");
    } catch (loadError) {
      setError(
        loadError instanceof Error &&
          loadError.message === "invalid_authorization_request"
          ? t.invalidRequest
          : t.loadFailed
      );
      setPhase("error");
    }
  }, [authorizationId, t.invalidRequest, t.loadFailed, t.missingRequest]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSpace = (spaceId: string) => {
    setSelectedSpaceIds((current) =>
      current.includes(spaceId)
        ? current.filter((id) => id !== spaceId)
        : [...current, spaceId]
    );
  };

  const approve = async () => {
    if (!(details && accessToken)) {
      return;
    }
    if (selectedSpaceIds.length === 0) {
      setError(t.selectSpace);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const redirect = await approveMcpConsent({
        authorizationId,
        clientId: details.client.id,
        maxRiskLevel,
        spaceIds: selectedSpaceIds,
        token: accessToken,
      });
      window.location.assign(redirect);
    } catch {
      setError(t.saveFailed);
      setSubmitting(false);
    }
  };

  const deny = async () => {
    setSubmitting(true);
    setError(null);
    try {
      window.location.assign(await denyMcpConsent(authorizationId));
    } catch {
      setError(t.consentFailed);
      setSubmitting(false);
    }
  };

  if (phase === "need_login" && loginTo) {
    return <Navigate replace to={loginTo} />;
  }

  if (phase === "loading") {
    return (
      <ConsentShell locale={locale} onLocaleChange={setLocale}>
        <p className="px-1 text-muted-foreground text-sm">{t.loading}</p>
      </ConsentShell>
    );
  }

  if (phase === "error" || !details) {
    return (
      <ConsentShell locale={locale} onLocaleChange={setLocale}>
        <div className="space-y-4">
          <div className="space-y-1 px-1">
            <h1 className="font-heading font-semibold text-2xl tracking-tight">
              {t.unavailable}
            </h1>
            <p className="text-destructive text-sm">{error ?? t.loadFailed}</p>
          </div>
          <Button
            className="w-full"
            onClick={() => {
              void pendingMcpLoginHref(authorizationId).then((href) =>
                window.location.assign(href)
              );
            }}
            size="lg"
            type="button"
            variant="outline"
          >
            {t.retry}
          </Button>
        </div>
      </ConsentShell>
    );
  }

  return (
    <ConsentShell locale={locale} onLocaleChange={setLocale}>
      <McpConsentForm
        clientLabel={details.client.name || details.client.id || "Client"}
        email={details.user.email || "you"}
        error={error}
        host={redirectHost(details.redirect_uri)}
        locale={locale}
        maxRiskLevel={maxRiskLevel}
        onApprove={() => void approve()}
        onDeny={() => void deny()}
        onRiskChange={setMaxRiskLevel}
        onSpaceToggle={toggleSpace}
        selectedSpaceIds={selectedSpaceIds}
        spaces={spaces}
        submitting={submitting}
      />
    </ConsentShell>
  );
}
