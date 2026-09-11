import { useCoreAuthSession } from "@engenty/auth-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  SettingsFormSection,
} from "@engenty/ui-core";
import { useCallback, useState } from "react";
import { ChangePasswordSection } from "./change-password-section.js";

interface AuthenticationSectionProps {
  userId: string;
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

export function AuthenticationSection({ userId }: AuthenticationSectionProps) {
  const { t } = useTranslation("common");
  const { session } = useCoreAuthSession();
  const [dialogOpen, setDialogOpen] = useState(false);
  const user = session?.user;

  const handlePasswordChanged = useCallback(() => setDialogOpen(false), []);

  if (!user) {
    return null;
  }

  const identities =
    (user as { identities?: Array<{ provider: string }> }).identities ?? [];

  return (
    <SettingsFormSection
      cardClassName="space-y-3"
      cardVariant="compact"
      description={t("authSection.description")}
      title={t("authSection.title")}
    >
      <div className="flex items-center gap-4">
        <span className="w-36 shrink-0 font-medium text-sm">
          {t("authSection.loginEmail")}
        </span>
        <span className="flex-1 font-mono text-sm">{user.email ?? "—"}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="w-36 shrink-0 font-medium text-sm">
          {t("authSection.userId")}
        </span>
        <span className="flex-1 truncate font-mono text-muted-foreground text-xs">
          {user.id}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-4">
          <span className="w-36 shrink-0 pt-0.5 font-medium text-sm">
            {t("authSection.authMethods")}
          </span>
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
    </SettingsFormSection>
  );
}
