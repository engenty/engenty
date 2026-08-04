import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CompanyProfileSettingsForm } from "../components/company-profile/company-profile-settings-form.js";
import { setCompanyProfileDraftApplyHandler } from "../copilot-draft-bridge.js";
import { useCompanySettingsAgentUiSlice } from "../hooks/use-company-profile-agent-ui-slice.js";
import { useCompanyProfileForm } from "../hooks/use-company-profile-form.js";
import {
  useCompanyProfileSettingsQuery,
  useSetCompanyProfileSettingsMutation,
  useUploadCompanyLogoMutation,
} from "../queries.js";

export function CompanySettingsPage() {
  const { t } = useTranslation("company-profile");
  useCompanySettingsAgentUiSlice();
  const query = useCompanyProfileSettingsQuery();
  const saveMutation = useSetCompanyProfileSettingsMutation();
  const uploadLogoMutation = useUploadCompanyLogoMutation();
  const loading = query.isLoading;
  const saving = saveMutation.isPending;
  const uploadingLogo = uploadLogoMutation.isPending;
  const [saveError, setSaveError] = useState<string | null>(null);
  const syncedQueryRef = useRef<string | null>(null);
  const form = useCompanyProfileForm(query.data);

  useEffect(() => {
    if (!query.data) {
      return;
    }

    const serializedData = JSON.stringify(query.data);
    if (syncedQueryRef.current === serializedData) {
      return;
    }

    syncedQueryRef.current = serializedData;
    form.resetDraft(query.data);
  }, [form.resetDraft, query.data]);

  useEffect(() => {
    const applySuggestionsToDraft = async (
      patch: Record<string, string | null>
    ) => {
      setSaveError(null);
      form.applyPatch(patch);
    };

    setCompanyProfileDraftApplyHandler(applySuggestionsToDraft);
    return () => {
      setCompanyProfileDraftApplyHandler(null);
    };
  }, [form.applyPatch]);

  const saveSettings = async () => {
    setSaveError(null);
    try {
      await saveMutation.mutateAsync(form.draft);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleLogoUpload = async (file: File) => {
    setSaveError(null);
    try {
      const { logo_url } = await uploadLogoMutation.mutateAsync(file);
      form.updateField("logo_url", logo_url);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  };

  const breadcrumbs = useMemo(
    () => [
      { label: t("menu"), to: "/mdl/company-profile" },
      { label: t("settings") },
    ],
    [t]
  );
  const pageActions = useMemo(
    () => (
      <Button
        className="h-8 gap-1.5 px-2.5 text-xs"
        disabled={saving || loading || !form.hasChanges}
        onClick={() => void saveSettings()}
        size="sm"
        variant={form.hasChanges ? "default" : "outline"}
      >
        <Save className="h-3.5 w-3.5" />
        {saving ? t("saving") : t("saveSettings")}
      </Button>
    ),
    [form.draft, form.hasChanges, loading, saving, t]
  );

  usePageConfig({
    breadcrumbs,
    actions: pageActions,
  });

  if (loading) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl space-y-8 p-page text-muted-foreground text-sm">
          {t("loading")}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-8 p-page">
        {saveError && (
          <div
            className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
            role="alert"
          >
            {saveError}
          </div>
        )}
        <CompanyProfileSettingsForm
          onLogoUpload={handleLogoUpload}
          settings={form.draft}
          updateField={form.updateField}
          uploadingLogo={uploadingLogo}
        />
      </div>
    </div>
  );
}
