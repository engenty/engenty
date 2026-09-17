import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  CardSection,
  DatePicker,
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
import {
  ProjectClientPicker,
  type ProjectClientSelection,
} from "./project-client-picker.js";

export interface ProjectSettingsValues {
  client_id: string | null;
  client_name: string | null;
  end_date: string | null;
  portal_enabled: boolean;
  portal_password: string | null;
  start_date: string | null;
  timeplan_enabled: boolean;
}

interface ProjectSettingsPanelProps {
  clientId: string | null;
  clientName: string | null;
  endDate: string | null;
  onClose: () => void;
  onSave: (values: ProjectSettingsValues) => void | Promise<void>;
  open: boolean;
  portalEnabled: boolean;
  portalPassword: string | null;
  projectId: string;
  startDate: string | null;
  timeplanEnabled: boolean;
}

interface SettingToggleRowProps {
  checked: boolean;
  hint: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * Toggle row: switch sits on the label's line, the hint runs full width
 * underneath it. In a side panel the settings 8/4 grid squeezes the hint into
 * a narrow column and leaves the switch floating away from its label.
 */
function SettingToggleRow({
  checked,
  hint,
  label,
  onCheckedChange,
}: SettingToggleRowProps) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 font-medium text-foreground text-sm leading-none">
          {label}
        </div>
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      <p className="mt-1.5 text-muted-foreground text-sm leading-snug">
        {hint}
      </p>
    </div>
  );
}

const PASSWORD_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const PASSWORD_LENGTH = 12;

/**
 * Everything that is configured per project rather than per view: time planning
 * (the switch that separates a full project from a lean project room) and the
 * client portal. Grouped into card sections per the settings-form-section rule.
 */
export function ProjectSettingsPanel({
  clientId: initialClientId,
  clientName: initialClientName,
  endDate: initialEndDate,
  onClose,
  onSave,
  open,
  portalEnabled: initialPortalEnabled,
  portalPassword: initialPassword,
  projectId,
  startDate: initialStartDate,
  timeplanEnabled: initialTimeplanEnabled,
}: ProjectSettingsPanelProps) {
  const { t } = useTranslation("projects");
  const [client, setClient] = useState<ProjectClientSelection>({
    client_id: initialClientId,
    client_name: initialClientName,
  });
  const [timeplanEnabled, setTimeplanEnabled] = useState(
    initialTimeplanEnabled
  );
  const [startDate, setStartDate] = useState(initialStartDate ?? "");
  const [endDate, setEndDate] = useState(initialEndDate ?? "");
  const [portalEnabled, setPortalEnabled] = useState(initialPortalEnabled);
  const [passwordProtected, setPasswordProtected] = useState(
    Boolean(initialPassword)
  );
  const [password, setPassword] = useState(initialPassword || "");
  const [saving, setSaving] = useState(false);

  const portalUrl = `${window.location.origin}/portal/${projectId}`;

  useEffect(() => {
    setClient({ client_id: initialClientId, client_name: initialClientName });
    setTimeplanEnabled(initialTimeplanEnabled);
    setStartDate(initialStartDate ?? "");
    setEndDate(initialEndDate ?? "");
    setPortalEnabled(initialPortalEnabled);
    setPasswordProtected(Boolean(initialPassword));
    setPassword(initialPassword || "");
  }, [
    initialClientId,
    initialClientName,
    initialTimeplanEnabled,
    initialStartDate,
    initialEndDate,
    initialPortalEnabled,
    initialPassword,
  ]);

  const generatePassword = () => {
    const nextPassword = Array.from(
      { length: PASSWORD_LENGTH },
      () => PASSWORD_CHARS[Math.floor(Math.random() * PASSWORD_CHARS.length)]
    ).join("");
    setPassword(nextPassword);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Ideally we would show a toast here
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        client_id: client.client_id,
        client_name: client.client_name,
        timeplan_enabled: timeplanEnabled,
        // Dates belong to the time plan — turning it off clears them so a lean
        // project does not keep an invisible schedule.
        start_date: timeplanEnabled ? startDate || null : null,
        end_date: timeplanEnabled ? endDate || null : null,
        portal_enabled: portalEnabled,
        portal_password:
          portalEnabled && passwordProtected && password ? password : null,
      });
      onClose();
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: module-level error logging until evlog transport is available
      console.error("Failed to save project settings:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidePanel onOpenChange={onClose} open={open}>
      <SidePanelContent>
        <SidePanelHeader>
          <SidePanelTitle>{t("detail.projectSettings.title")}</SidePanelTitle>
        </SidePanelHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 pt-2 pb-6">
          <CardSection
            description={t("detail.projectSettings.clientSectionDescription")}
            title={t("detail.projectSettings.clientSection")}
          >
            <ProjectClientPicker
              clientId={client.client_id}
              clientName={client.client_name}
              onChange={setClient}
            />
          </CardSection>

          {/* The section title *is* the setting - its switch turns the whole
              block on, so there is no separate "Enable …" row, and the card
              only exists while there is something to configure. */}
          <CardSection>
            <CardSection.Header
              action={
                <Switch
                  checked={timeplanEnabled}
                  onCheckedChange={setTimeplanEnabled}
                />
              }
              description={t(
                "detail.projectSettings.timeplanSectionDescription"
              )}
              title={t("detail.projectSettings.timeplanSection")}
            />
            {timeplanEnabled && (
              <CardSection.Body variant="compact">
                {/* Stacked, not side by side: the side panel is narrow and a
                    formatted date ("August 27th, 2026") does not fit a half
                    column. */}
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    {/* DatePicker renders a popover trigger, not an input —
                        label by proximity rather than a dangling `htmlFor`. */}
                    <Label>{t("detail.projectSettings.startDate")}</Label>
                    <DatePicker
                      className="mt-1 w-full"
                      onChange={(next) => setStartDate(next ?? "")}
                      value={startDate || null}
                    />
                  </div>
                  <div>
                    <Label>{t("detail.projectSettings.endDate")}</Label>
                    <DatePicker
                      className="mt-1 w-full"
                      onChange={(next) => setEndDate(next ?? "")}
                      value={endDate || null}
                    />
                  </div>
                </div>
              </CardSection.Body>
            )}
          </CardSection>

          <CardSection>
            <CardSection.Header
              action={
                <Switch
                  checked={portalEnabled}
                  onCheckedChange={setPortalEnabled}
                />
              }
              description={t("detail.projectSettings.portalSectionDescription")}
              title={t("detail.projectSettings.portalSection")}
            />
            {portalEnabled && (
              <CardSection.Body
                className="space-y-0 divide-y divide-border"
                variant="compact"
              >
                <SettingToggleRow
                  checked={passwordProtected}
                  hint={t("detail.portal.passwordProtectedHint", {
                    defaultValue: "Require a password to access the portal",
                  })}
                  label={t("detail.portal.passwordProtected", {
                    defaultValue: "Password protected",
                  })}
                  onCheckedChange={setPasswordProtected}
                />

                {passwordProtected && (
                  <div className="space-y-2 pt-3">
                    <Label htmlFor="portal-password">
                      {t("detail.portal.password")}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="portal-password"
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

                <div className="space-y-2 pt-3">
                  <Label htmlFor="portal-url">
                    {t("detail.portal.portalUrl")}
                  </Label>
                  <div className="flex gap-2">
                    <Input id="portal-url" readOnly value={portalUrl} />
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
              </CardSection.Body>
            )}
          </CardSection>

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
