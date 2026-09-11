import {
  PlaceholderHelperDialog,
  RichTextEditor,
} from "@engenty/commercial-editor";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { OfferSettings } from "../api.js";
import { useOffersSettingsAgentUiSlice } from "../hooks/use-offers-agent-ui-slice.js";
import { useOffersModuleSecondaryShellNav } from "../hooks/use-offers-module-secondary-shell-nav.js";
import {
  useOfferSettingsPageQuery,
  useSetDefaultOfferTemplateMutation,
  useSetOfferSettingsMutation,
} from "../queries.js";

const DEFAULT_SETTINGS: OfferSettings = {
  offer_id_prefix: "ang-{year}-",
  offer_id_offset: 1000,
  offer_id_postfix: "",
  default_intro: "",
  default_final_notes: "",
  valid_until_days: 30,
};

export function OffersSettingsPage() {
  const { t } = useTranslation("offers");
  useOffersSettingsAgentUiSlice();
  const query = useOfferSettingsPageQuery();
  const saveSettingsMutation = useSetOfferSettingsMutation();
  const setDefaultTemplateMutation = useSetDefaultOfferTemplateMutation();

  const loading = query.isLoading;
  const saving =
    saveSettingsMutation.isPending || setDefaultTemplateMutation.isPending;
  const error = query.error instanceof Error ? query.error.message : null;

  const [settings, setSettings] = useState<OfferSettings>(DEFAULT_SETTINGS);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [loadedTemplateId, setLoadedTemplateId] = useState<string>("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const initialSyncedRef = useRef(false);

  useEffect(() => {
    if (!query.data || initialSyncedRef.current) {
      return;
    }
    initialSyncedRef.current = true;
    const { settings: s, templates } = query.data;
    setSettings(s);
    const defaultTemplate =
      templates.find((tpl) => tpl.is_default) ?? templates[0];
    const templateId = defaultTemplate?.id ?? "";
    setSelectedTemplateId(templateId);
    setLoadedTemplateId(templateId);
  }, [query.data]);

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useOffersModuleSecondaryShellNav();

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("settings") },
    ],
    [moduleRootCrumb, t]
  );

  const handleSave = useCallback(async () => {
    setSaveError(null);
    try {
      await saveSettingsMutation.mutateAsync(settings);
      if (selectedTemplateId && selectedTemplateId !== loadedTemplateId) {
        await setDefaultTemplateMutation.mutateAsync(selectedTemplateId);
        setLoadedTemplateId(selectedTemplateId);
      }
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save settings"
      );
    }
  }, [
    loadedTemplateId,
    saveSettingsMutation,
    selectedTemplateId,
    setDefaultTemplateMutation,
    settings,
  ]);

  const pageActions = useMemo(
    () => (
      <Button disabled={saving} onClick={() => handleSave()} size="sm">
        {saving ? t("saving") : t("save")}
      </Button>
    ),
    [handleSave, saving, t]
  );

  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
  });

  if (loading) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="p-page text-muted-foreground text-sm">{t("loading")}</p>
      </div>
    );
  }

  const templates = query.data?.templates ?? [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-8 p-page">
        <div className="space-y-3">
          <div className="space-y-1">
            <h3 className="font-semibold text-base">
              {t("offersSettings.offerIdConfiguration")}
            </h3>
            <p className="text-muted-foreground text-sm">
              {t("offersSettings.configureOfferNumbers")}
            </p>
          </div>
          <div className="ui-card-panel overflow-hidden p-4">
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-2">
                <Label htmlFor="offer_id_prefix">
                  {t("offersSettings.prefix")}
                </Label>
                <Input
                  id="offer_id_prefix"
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      offer_id_prefix: event.target.value,
                    }))
                  }
                  value={settings.offer_id_prefix}
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="offer_id_offset">
                  {t("offersSettings.startNumber")}
                </Label>
                <Input
                  id="offer_id_offset"
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      offer_id_offset:
                        Number.parseInt(event.target.value, 10) || 0,
                    }))
                  }
                  type="number"
                  value={settings.offer_id_offset}
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="offer_id_postfix">
                  {t("offersSettings.postfixOptional")}
                </Label>
                <Input
                  id="offer_id_postfix"
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      offer_id_postfix: event.target.value,
                    }))
                  }
                  placeholder={t("offersSettings.optional")}
                  value={settings.offer_id_postfix}
                />
              </div>
            </div>
            <p className="mt-3 text-muted-foreground text-xs">
              {t("offersSettings.preview")}:{" "}
              {settings.offer_id_prefix.replace(
                "{year}",
                String(new Date().getFullYear())
              )}
              {settings.offer_id_offset}
              {settings.offer_id_postfix}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <h3 className="font-semibold text-base">
              {t("offersSettings.defaultTexts")}
            </h3>
            <p className="text-muted-foreground text-sm">
              {t("offersSettings.prefillNewOffers")}
            </p>
          </div>
          <div className="ui-card-panel overflow-hidden">
            <div className="p-4">
              <Label className="font-semibold text-base">
                {t("offersSettings.defaultIntroduction")}
              </Label>
              <p className="mb-2 text-muted-foreground text-sm">
                {t("offersSettings.shownAtBeginning")}
              </p>
              <div className="overflow-hidden rounded-md border border-input">
                <RichTextEditor
                  containerClassName="min-h-[140px] rounded-none border-0 focus-within:ring-0"
                  content={settings.default_intro}
                  hideHeadings
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      default_intro: value,
                    }))
                  }
                  placeholder={t("offersSettings.enterDefaultIntroduction")}
                  toolbarVariant="top"
                />
              </div>
              <div className="mt-2">
                <PlaceholderHelperDialog variant="expandable" />
              </div>
            </div>
            <div className="mx-4 border-b" />
            <div className="p-4">
              <Label className="font-semibold text-base">
                {t("offersSettings.defaultFinalNotes")}
              </Label>
              <p className="mb-2 text-muted-foreground text-sm">
                {t("offersSettings.shownAtEnd")}
              </p>
              <div className="overflow-hidden rounded-md border border-input">
                <RichTextEditor
                  containerClassName="min-h-[140px] rounded-none border-0 focus-within:ring-0"
                  content={settings.default_final_notes}
                  hideHeadings
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      default_final_notes: value,
                    }))
                  }
                  placeholder={t("offersSettings.enterDefaultFinalNotes")}
                  toolbarVariant="top"
                />
              </div>
              <div className="mt-2">
                <PlaceholderHelperDialog variant="expandable" />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <h3 className="font-semibold text-base">
              {t("offersSettings.templateAndDisplay")}
            </h3>
            <p className="text-muted-foreground text-sm">
              {t("offersSettings.templateAndDisplayDescription")}
            </p>
          </div>
          <div className="ui-card-panel overflow-hidden p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-sm">
                {t("offersSettings.managePdfTemplatesDescription")}
              </p>
              <Button asChild size="sm" variant="outline">
                <Link to="/settings/pdf-templates">
                  {t("offersSettings.managePdfTemplates")}
                </Link>
              </Button>
            </div>
            <Label className="mb-2 block">
              {t("offers.settings.selectTemplate")}
            </Label>
            <Select
              onValueChange={setSelectedTemplateId}
              value={selectedTemplateId}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("offers.settings.selectTemplate")}>
                  {selectedTemplateId
                    ? (templates.find((tpl) => tpl.id === selectedTemplateId)
                        ?.name ?? selectedTemplateId)
                    : t("offers.settings.selectTemplate")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <h3 className="font-semibold text-base">
              {t("offersSettings.validityPeriod")}
            </h3>
            <p className="text-muted-foreground text-sm">
              {t("offersSettings.setDefaultValidityPeriod")}
            </p>
          </div>
          <div className="ui-card-panel overflow-hidden p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label
                  className="font-semibold text-base"
                  htmlFor="valid_until_days"
                >
                  {t("offersSettings.validUntil")}
                </Label>
                <p className="text-muted-foreground text-sm">
                  {t("offersSettings.numberOfDaysUntilExpires")}
                </p>
              </div>
              <Input
                className="max-w-[120px]"
                id="valid_until_days"
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    valid_until_days:
                      Number.parseInt(event.target.value, 10) || 0,
                  }))
                }
                type="number"
                value={settings.valid_until_days}
              />
            </div>
          </div>
        </div>

        {(error || saveError) && (
          <p className="text-destructive text-sm">{error ?? saveError}</p>
        )}
      </div>
    </div>
  );
}
