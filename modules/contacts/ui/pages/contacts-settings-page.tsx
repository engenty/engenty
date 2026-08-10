import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import {
  CONTRIBUTIONS_INVALIDATE_EVENT,
  usePageConfig,
} from "@engenty/ui-plugin-sdk";
import { Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ContactsRoleMenuConfig,
  FIXED_CONTACT_ROLES,
} from "../api/role-menu-settings.js";
import type { ContactSettings } from "../api/settings.js";
import { ContactLanguagesSection } from "../components/settings/contact-languages-section.js";
import { IdFormatSection } from "../components/settings/id-format-section.js";
import { RoleCategoriesSection } from "../components/settings/role-categories-section.js";
import { useContactsSettingsAgentUiSlice } from "../hooks/use-contacts-agent-ui-slice.js";
import {
  useContactSettingsPageQuery,
  useSaveContactSettingsPageMutation,
} from "../queries.js";

const DEFAULT_ROLE_MENU: ContactsRoleMenuConfig = {
  items: FIXED_CONTACT_ROLES.map((role, index) => ({
    slug: role,
    visible: true,
    order: index,
  })),
};
const DEFAULT_CONTACT_SETTINGS: ContactSettings = {
  id_prefix: "C-{year}-",
  id_offset: 1000,
  id_postfix: "",
  salutations: [],
  languages: [],
  default_language: "",
};

export function ContactsSettingsPage() {
  const { t } = useTranslation("contacts");
  const { t: tCommon } = useTranslation("common");
  useContactsSettingsAgentUiSlice();
  const query = useContactSettingsPageQuery();
  const saveMutation = useSaveContactSettingsPageMutation();
  const loading = query.isLoading;
  const saving = saveMutation.isPending;
  const initialSyncedRef = useRef(false);
  const [settings, setSettings] = useState<ContactSettings>(
    DEFAULT_CONTACT_SETTINGS
  );
  const [roleMenuConfig, setRoleMenuConfig] =
    useState<ContactsRoleMenuConfig>(DEFAULT_ROLE_MENU);
  const [newSalutation, setNewSalutation] = useState("");
  const [newLanguage, setNewLanguage] = useState("");

  useEffect(() => {
    if (!query.data || initialSyncedRef.current) {
      return;
    }
    initialSyncedRef.current = true;
    setSettings(query.data.settings);
    setRoleMenuConfig(query.data.roleMenuConfig);
  }, [query.data]);

  const originalSettings = query.data?.settings ?? null;
  const originalRoleMenuConfig = query.data?.roleMenuConfig ?? null;

  const previewId = `${settings.id_prefix.replace("{year}", String(new Date().getFullYear()))}${settings.id_offset}${settings.id_postfix}`;

  const saveSettings = useCallback(async () => {
    try {
      await saveMutation.mutateAsync({ settings, roleMenuConfig });
      window.dispatchEvent(new Event(CONTRIBUTIONS_INVALIDATE_EVENT));
    } catch {
      // Error surfaced via saveMutation.error
    }
  }, [settings, roleMenuConfig, saveMutation]);

  const hasChanges = useMemo(() => {
    if (!(originalSettings && originalRoleMenuConfig)) {
      return false;
    }
    return (
      JSON.stringify(settings) !== JSON.stringify(originalSettings) ||
      JSON.stringify(roleMenuConfig) !== JSON.stringify(originalRoleMenuConfig)
    );
  }, [settings, originalSettings, roleMenuConfig, originalRoleMenuConfig]);

  // Settings pages carry the settings nav, not the contacts module nav (the
  // contact list/roles rail is irrelevant while configuring the module).
  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(tCommon("navigation.settings"));

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("settings") },
    ],
    [moduleRootCrumb, t]
  );
  const pageActions = useMemo(
    () => (
      <Button
        className="h-8 gap-1.5 px-2.5 text-xs"
        disabled={saving || loading || !hasChanges}
        onClick={() => void saveSettings()}
        size="sm"
        variant={hasChanges ? "default" : "outline"}
      >
        <Save className="h-3.5 w-3.5" />
        {saving ? t("saving") : t("saveSettings")}
      </Button>
    ),
    [hasChanges, loading, saveSettings, saving, t]
  );

  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  if (loading) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl space-y-6 p-page text-muted-foreground text-sm">
          {t("loading")}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-6 p-page">
        <div>
          <h1 className="font-semibold text-xl">{t("settingsTitle")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("settingsDescription")}
          </p>
        </div>

        <IdFormatSection
          idOffset={settings.id_offset}
          idPostfix={settings.id_postfix}
          idPrefix={settings.id_prefix}
          onIdOffsetChange={(v) =>
            setSettings((prev) => ({ ...prev, id_offset: v }))
          }
          onIdPostfixChange={(v) =>
            setSettings((prev) => ({ ...prev, id_postfix: v }))
          }
          onIdPrefixChange={(v) =>
            setSettings((prev) => ({ ...prev, id_prefix: v }))
          }
          previewId={previewId}
        />

        <RoleCategoriesSection
          config={roleMenuConfig}
          onConfigChange={setRoleMenuConfig}
        />

        <ContactLanguagesSection
          defaultLanguage={settings.default_language}
          languages={settings.languages}
          newLanguage={newLanguage}
          newSalutation={newSalutation}
          onDefaultLanguageChange={(v) =>
            setSettings((prev) => ({ ...prev, default_language: v }))
          }
          onLanguagesChange={(v) =>
            setSettings((prev) => ({ ...prev, languages: v }))
          }
          onNewLanguageChange={setNewLanguage}
          onNewSalutationChange={setNewSalutation}
          onSalutationsChange={(v) =>
            setSettings((prev) => ({ ...prev, salutations: v }))
          }
          salutations={settings.salutations}
        />
      </div>
    </div>
  );
}
