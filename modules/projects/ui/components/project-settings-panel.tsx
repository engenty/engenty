import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DatePicker,
  Input,
  SettingsCard,
  SettingsCardSeparator,
  SettingsSection,
  Switch,
} from "@engenty/ui-core";
import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { ProjectClientSettingsSection } from "./project-client-settings-section.js";
import type { ProjectClientSelection } from "./project-client-topline.js";

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
  /** Called on every change — the panel has no Save button. */
  onSave: (values: ProjectSettingsValues) => void | Promise<void>;
  portalEnabled: boolean;
  portalPassword: string | null;
  projectId: string;
  startDate: string | null;
  /** The team section (with the team module), after the client. */
  team?: ReactNode;
  timeplanEnabled: boolean;
}

/** Label left, control right — the offer sidebar's row. */
function SettingRow({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="shrink-0 text-muted-foreground text-sm">{label}</span>
      <div className="w-full min-w-0 sm:max-w-xs">{children}</div>
    </div>
  );
}

/** Title and hint on the left, the switch on the right. */
function SettingSwitchRow({
  checked,
  hint,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  hint?: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="font-semibold text-sm">{label}</p>
        {hint ? <p className="text-muted-foreground text-sm">{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

const PASSWORD_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const PASSWORD_LENGTH = 12;

/**
 * The project's settings for the detail page's doc sidebar (`DocSidebarLayout`
 * — inline column when wide, overlay sheet when narrow, as on an offer draft):
 * client and team, time planning (the switch that separates a full project
 * from a lean project room) and the client portal. Card sections per the
 * settings-form-section rule.
 *
 * Every change saves on its own (the password field on blur), so closing the
 * sidebar never throws work away.
 */
export function ProjectSettingsPanel({
  clientId: initialClientId,
  clientName: initialClientName,
  endDate: initialEndDate,
  onSave,
  portalEnabled: initialPortalEnabled,
  portalPassword: initialPassword,
  projectId,
  startDate: initialStartDate,
  team,
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

  const save = (patch: {
    client?: ProjectClientSelection;
    endDate?: string;
    password?: string;
    passwordProtected?: boolean;
    portalEnabled?: boolean;
    startDate?: string;
    timeplanEnabled?: boolean;
  }) => {
    const next = {
      client: patch.client ?? client,
      endDate: patch.endDate ?? endDate,
      password: patch.password ?? password,
      passwordProtected: patch.passwordProtected ?? passwordProtected,
      portalEnabled: patch.portalEnabled ?? portalEnabled,
      startDate: patch.startDate ?? startDate,
      timeplanEnabled: patch.timeplanEnabled ?? timeplanEnabled,
    };
    void onSave({
      client_id: next.client.client_id,
      client_name: next.client.client_name,
      timeplan_enabled: next.timeplanEnabled,
      // Dates belong to the time plan — turning it off clears them so a lean
      // project does not keep an invisible schedule.
      start_date: next.timeplanEnabled ? next.startDate || null : null,
      end_date: next.timeplanEnabled ? next.endDate || null : null,
      portal_enabled: next.portalEnabled,
      portal_password:
        next.portalEnabled && next.passwordProtected && next.password
          ? next.password
          : null,
    });
  };

  const generatePassword = () => {
    const nextPassword = Array.from(
      { length: PASSWORD_LENGTH },
      () => PASSWORD_CHARS[Math.floor(Math.random() * PASSWORD_CHARS.length)]
    ).join("");
    setPassword(nextPassword);
    save({ password: nextPassword });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Ideally we would show a toast here
  };

  return (
    <div className="flex flex-col gap-5">
      <ProjectClientSettingsSection
        clientId={client.client_id}
        clientName={client.client_name}
        onChange={(next) => {
          setClient(next);
          save({ client: next });
        }}
      />

      {team}

      {/* The section's switch is the setting; its card exists only while on. */}
      <SettingsSection
        action={
          <Switch
            aria-label={t("detail.projectSettings.timeplanSection")}
            checked={timeplanEnabled}
            onCheckedChange={(next) => {
              setTimeplanEnabled(next);
              save({ timeplanEnabled: next });
            }}
          />
        }
        description={t("detail.projectSettings.timeplanSectionDescription")}
        title={t("detail.projectSettings.timeplanSection")}
      >
        {timeplanEnabled ? (
          <SettingsCard>
            <SettingRow label={t("detail.projectSettings.startDate")}>
              <DatePicker
                className="w-full"
                onChange={(next) => {
                  setStartDate(next ?? "");
                  save({ startDate: next ?? "" });
                }}
                value={startDate || null}
              />
            </SettingRow>
            <SettingsCardSeparator />
            <SettingRow label={t("detail.projectSettings.endDate")}>
              <DatePicker
                className="w-full"
                onChange={(next) => {
                  setEndDate(next ?? "");
                  save({ endDate: next ?? "" });
                }}
                value={endDate || null}
              />
            </SettingRow>
          </SettingsCard>
        ) : null}
      </SettingsSection>

      <SettingsSection
        action={
          <Switch
            aria-label={t("detail.portal.enablePortal")}
            checked={portalEnabled}
            onCheckedChange={(next) => {
              setPortalEnabled(next);
              save({ portalEnabled: next });
            }}
          />
        }
        description={t("detail.projectSettings.portalSectionDescription")}
        title={t("detail.projectSettings.portalSection")}
      >
        {portalEnabled ? (
          <SettingsCard>
            <SettingSwitchRow
              checked={passwordProtected}
              hint={t("detail.portal.passwordProtectedHint", {
                defaultValue: "Require a password to access the portal",
              })}
              label={t("detail.portal.passwordProtected", {
                defaultValue: "Password protected",
              })}
              onCheckedChange={(next) => {
                setPasswordProtected(next);
                save({ passwordProtected: next });
              }}
            />
            {passwordProtected ? (
              <>
                <SettingsCardSeparator />
                <SettingRow label={t("detail.portal.password")}>
                  <div className="flex gap-2">
                    <Input
                      aria-label={t("detail.portal.password")}
                      onBlur={() => {
                        if (password !== (initialPassword || "")) {
                          save({});
                        }
                      }}
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
                </SettingRow>
              </>
            ) : null}
            <SettingsCardSeparator />
            <SettingRow label={t("detail.portal.portalUrl")}>
              <div className="flex gap-2">
                <Input
                  aria-label={t("detail.portal.portalUrl")}
                  readOnly
                  value={portalUrl}
                />
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
            </SettingRow>
          </SettingsCard>
        ) : null}
      </SettingsSection>
    </div>
  );
}
