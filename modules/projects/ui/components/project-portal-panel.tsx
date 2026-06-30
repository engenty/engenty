import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Input,
  Label,
  SidePanel,
  SidePanelContent,
  SidePanelHeader,
  SidePanelTitle,
  Switch,
} from "@engenty/ui-core";
import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

interface ProjectPortalPanelProps {
  enabled: boolean;
  onClose: () => void;
  onSave: (enabled: boolean, password: string | null) => Promise<void>;
  open: boolean;
  password: string | null;
  projectId: string;
}

export function ProjectPortalPanel({
  open,
  onClose,
  projectId,
  enabled: initialEnabled,
  password: initialPassword,
  onSave,
}: ProjectPortalPanelProps) {
  const { t } = useTranslation("projects");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [passwordProtected, setPasswordProtected] = useState(
    Boolean(initialPassword)
  );
  const [password, setPassword] = useState(initialPassword || "");
  const [saving, setSaving] = useState(false);

  const portalUrl = `${window.location.origin}/portal/${projectId}`;

  useEffect(() => {
    setEnabled(initialEnabled);
    setPasswordProtected(Boolean(initialPassword));
    setPassword(initialPassword || "");
  }, [initialEnabled, initialPassword]);

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const newPassword = Array.from(
      { length: 12 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join("");
    setPassword(newPassword);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Ideally we would show a toast here
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(
        enabled,
        enabled && passwordProtected && password ? password : null
      );
      onClose();
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: module-level error logging until evlog transport is available
      console.error("Failed to save portal settings:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidePanel onOpenChange={onClose} open={open}>
      <SidePanelContent>
        <SidePanelHeader>
          <SidePanelTitle>{t("detail.portal.settings")}</SidePanelTitle>
        </SidePanelHeader>

        <div className="flex flex-1 flex-col space-y-6 overflow-y-auto px-6 pt-2 pb-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-semibold text-base">
                {t("detail.portal.enablePortal")}
              </Label>
              <p className="text-muted-foreground text-sm">
                {t("detail.portal.enablePortalDescription")}
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {enabled && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-semibold text-sm">
                    {t("detail.portal.passwordProtected", {
                      defaultValue: "Password protected",
                    })}
                  </Label>
                  <p className="text-muted-foreground text-xs">
                    {t("detail.portal.passwordProtectedHint", {
                      defaultValue: "Require a password to access the portal",
                    })}
                  </p>
                </div>
                <Switch
                  checked={passwordProtected}
                  onCheckedChange={setPasswordProtected}
                />
              </div>

              {passwordProtected && (
                <div className="space-y-2">
                  <Label>{t("detail.portal.password")}</Label>
                  <div className="flex gap-2">
                    <Input
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t("detail.portal.enterPassword")}
                      type="text"
                      value={password}
                    />
                    <Button
                      onClick={() => copyToClipboard(password)}
                      size="icon"
                      variant="outline"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={generatePassword}
                      size="icon"
                      variant="outline"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {t("detail.portal.passwordHint")}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>{t("detail.portal.portalUrl")}</Label>
                <div className="flex gap-2">
                  <Input readOnly value={portalUrl} />
                  <Button
                    onClick={() => copyToClipboard(portalUrl)}
                    size="icon"
                    variant="outline"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => window.open(portalUrl, "_blank")}
                    size="icon"
                    variant="outline"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}

          <div className="mt-auto flex justify-end gap-2 border-t pt-4">
            <Button onClick={onClose} size="sm" variant="outline">
              {t("detail.portal.cancel")}
            </Button>
            <Button disabled={saving} onClick={handleSave} size="sm">
              {saving ? t("detail.portal.saving") : t("detail.portal.save")}
            </Button>
          </div>
        </div>
      </SidePanelContent>
    </SidePanel>
  );
}
