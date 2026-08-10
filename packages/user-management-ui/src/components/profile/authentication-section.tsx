import { useCoreAuthSession } from "@engenty/auth-ui";
import {
  isEngentyDeveloperModeUiEnabled,
  seedMastraStudioDevConfig,
  subscribeDeveloperModePreference,
} from "@engenty/environment";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Label,
} from "@engenty/ui-core";
import { Check, Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ChangePasswordSection } from "./change-password-section.js";

interface AuthenticationSectionProps {
  /** Gateway host for Studio (e.g. `https://engenty.localhost` from `VITE_ENGENTY_AI_BASE_URL`). */
  studioGatewayBaseUrl?: string;
  userId: string;
}

function resolveStudioGatewayBaseUrl(explicit?: string): string {
  const fromProp = explicit?.trim();
  if (fromProp) {
    return fromProp.replace(/\/$/, "");
  }
  const fromVite = (
    import.meta as ImportMeta & { env?: Record<string, string | undefined> }
  ).env?.VITE_ENGENTY_AI_BASE_URL?.trim();
  if (fromVite) {
    return fromVite.replace(/\/$/, "");
  }
  return "https://engenty.localhost";
}

function identityProviderLabel(
  provider: string,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  switch (provider) {
    case "email":
      return t("authSection.providerEmail");
    case "google":
      return t("authSection.providerGoogle");
    case "github":
      return t("authSection.providerGithub");
    case "apple":
      return t("authSection.providerApple");
    case "azure":
      return t("authSection.providerAzure");
    default:
      return t("authSection.providerOther", { provider });
  }
}

export function AuthenticationSection({
  userId,
  studioGatewayBaseUrl,
}: AuthenticationSectionProps) {
  const { t } = useTranslation("common");
  const { session } = useCoreAuthSession();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copiedStudioHeader, setCopiedStudioHeader] = useState(false);
  const [developerModeEnabled, setDeveloperModeEnabled] = useState(
    isEngentyDeveloperModeUiEnabled
  );
  const user = session?.user;

  const handlePasswordChanged = useCallback(() => setDialogOpen(false), []);
  const studioBaseUrl = resolveStudioGatewayBaseUrl(studioGatewayBaseUrl);

  const syncMastraStudioConfig = useCallback(() => {
    if (!session?.access_token) {
      return;
    }
    seedMastraStudioDevConfig({
      accessToken: session.access_token,
      gatewayBaseUrl: studioBaseUrl,
    });
  }, [session?.access_token, studioBaseUrl]);

  const handleCopyStudioHeader = useCallback(async () => {
    if (!session?.access_token) {
      return;
    }
    syncMastraStudioConfig();
    await navigator.clipboard.writeText(`Bearer ${session.access_token}`);
    setCopiedStudioHeader(true);
    window.setTimeout(() => setCopiedStudioHeader(false), 1500);
  }, [session?.access_token, syncMastraStudioConfig]);

  useEffect(
    () =>
      subscribeDeveloperModePreference(() => {
        setDeveloperModeEnabled(isEngentyDeveloperModeUiEnabled());
      }),
    []
  );

  const showMastraStudioDevInfo =
    developerModeEnabled && Boolean(session?.access_token);

  useEffect(() => {
    if (!showMastraStudioDevInfo) {
      return;
    }
    syncMastraStudioConfig();
  }, [showMastraStudioDevInfo, syncMastraStudioConfig]);

  if (!user) {
    return null;
  }

  const identities =
    (user as { identities?: Array<{ provider: string }> }).identities ?? [];

  return (
    <div className="space-y-2">
      <h2 className="font-medium text-lg">{t("authSection.title")}</h2>
      <p className="text-muted-foreground text-sm">
        {t("authSection.description")}
      </p>
      <Card className="rounded-sm">
        <div className="space-y-4 p-4">
          <div className="flex items-center gap-4">
            <Label className="w-36 shrink-0 text-sm">
              {t("authSection.loginEmail")}
            </Label>
            <span className="flex-1 font-mono text-sm">
              {user.email ?? "—"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Label className="w-36 shrink-0 text-sm">
              {t("authSection.userId")}
            </Label>
            <span className="flex-1 truncate font-mono text-muted-foreground text-xs">
              {user.id}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-4">
              <Label className="w-36 shrink-0 pt-0.5 text-sm">
                {t("authSection.authMethods")}
              </Label>
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {identities.length === 0 ? (
                  <span className="text-muted-foreground text-sm">—</span>
                ) : (
                  identities.map((id, idx) => {
                    const ident = id as {
                      provider: string;
                      provider_id?: string;
                      id?: string;
                    };
                    return (
                      <Badge
                        key={ident.id ?? `${ident.provider}-${idx}`}
                        variant="secondary"
                      >
                        {identityProviderLabel(ident.provider, t)}
                      </Badge>
                    );
                  })
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 pl-[calc(theme(spacing.36)+1rem)]">
              <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    {t("authSection.changePassword")}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>{t("authSection.changePassword")}</DialogTitle>
                  </DialogHeader>
                  <ChangePasswordSection
                    embedded
                    onSuccess={handlePasswordChanged}
                    userId={userId}
                  />
                </DialogContent>
              </Dialog>
            </div>
          </div>
          {showMastraStudioDevInfo ? (
            <div className="border-border border-t pt-4">
              <div className="mb-3">
                <h3 className="font-medium text-sm">
                  {t("authSection.mastraStudioTitle")}
                </h3>
                <p className="text-muted-foreground text-xs">
                  {t("authSection.mastraStudioDescription")}
                </p>
              </div>
              <div className="space-y-3">
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
              </div>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
