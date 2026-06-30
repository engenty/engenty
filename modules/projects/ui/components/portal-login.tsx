import { useTranslation } from "@engenty/i18n/ui";
import { Button, Input, Label } from "@engenty/ui-core";
import { useCallback, useState } from "react";

const PORTAL_VERIFIED_KEY = "portal_verified_";

export function getPortalVerifiedKey(projectId: string) {
  return `${PORTAL_VERIFIED_KEY}${projectId}`;
}

export function isPortalVerified(projectId: string): boolean {
  try {
    return sessionStorage.getItem(getPortalVerifiedKey(projectId)) === "1";
  } catch {
    return false;
  }
}

export function setPortalVerified(projectId: string) {
  try {
    sessionStorage.setItem(getPortalVerifiedKey(projectId), "1");
  } catch {
    // ignore
  }
}

export function clearPortalVerified(projectId: string) {
  try {
    sessionStorage.removeItem(getPortalVerifiedKey(projectId));
  } catch {
    // ignore
  }
}

interface PortalLoginProps {
  introText: string | null;
  onError?: (message: string) => void;
  onVerified: () => void;
  projectId: string;
  projectTitle: string;
}

export function PortalLogin({
  projectId,
  projectTitle,
  introText,
  onVerified,
  onError,
}: PortalLoginProps) {
  const { t } = useTranslation("projects");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reportError = useCallback(
    (msg: string) => {
      setError(msg);
      onError?.(msg);
    },
    [onError]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!password.trim() || loading) {
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const { verifyPortalPassword } = await import("../api.js");
        const { verified } = await verifyPortalPassword(projectId, password);
        if (verified) {
          setPortalVerified(projectId);
          onVerified();
        } else {
          reportError(t("portal.invalidPassword"));
        }
      } catch (err) {
        reportError(err instanceof Error ? err.message : "Failed to verify");
      } finally {
        setLoading(false);
      }
    },
    [projectId, password, loading, onVerified, reportError, t]
  );

  return (
    <div className="mx-auto max-w-md space-y-6 rounded-lg border bg-card p-6">
      <h1 className="font-semibold text-xl">{projectTitle}</h1>
      {introText && (
        <p className="text-muted-foreground text-sm">{introText}</p>
      )}
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <Label htmlFor="portal-password">{t("portal.password")}</Label>
          <Input
            autoComplete="current-password"
            className="mt-1"
            id="portal-password"
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("portal.passwordPlaceholder")}
            required
            type="password"
            value={password}
          />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <Button className="w-full" disabled={loading} type="submit">
          {loading ? t("portal.verifying") : t("portal.login")}
        </Button>
      </form>
    </div>
  );
}
