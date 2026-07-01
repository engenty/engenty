import { useTranslation } from "@engenty/i18n/ui";
import {
  CSVImportWizard,
  type CSVImportWizardLabels,
  ImportPageShell,
  type ImportRunProgress,
  importPageContentClassName,
  type MatchByConfig,
} from "@engenty/import";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Toaster, toast } from "sonner";
import {
  createContact,
  findContactByImportId,
  findContactByReferenceId,
  getContactsImportPresets,
  saveContactsImportPreset,
  suggestContactsImportMappings,
  updateContact,
} from "../api.js";
import { useContactsModuleSecondaryShellNav } from "../hooks/use-contacts-module-secondary-shell-nav.js";
import {
  CONTACTS_IMPORT_FIELDS,
  CONTACTS_IMPORT_PREVIEW_COLUMNS,
  mapImportRowToContactCreateInput,
  mapImportRowToContactUpdatePatch,
} from "../lib/import-contacts.js";

const DEFAULT_MATCH_BY: MatchByConfig = { type: "none" };

export function ContactsImportPage() {
  const { t } = useTranslation("contacts");
  const navigate = useNavigate();
  const progressToastId = useRef<string | number | undefined>(undefined);
  const [matchByConfig, setMatchByConfig] =
    useState<MatchByConfig>(DEFAULT_MATCH_BY);

  const matchByLabels = useMemo(
    () => ({
      description: t("importMatchByDescriptionShort"),
      label: t("importId"),
      none: t("importMatchByNone"),
      placeholder: t("importMatchByPlaceholder"),
      templateMode: t("importTemplateMode"),
      templateModeDescription: t("importTemplateModeDescription"),
      templateSyntax: t("importTemplateSyntax"),
    }),
    [t]
  );

  const labels: CSVImportWizardLabels = useMemo(
    () => ({
      aiMapping: t("importAiMapping"),
      aiMappingFailed: t("importAiMappingFailed"),
      aiMappingRunning: t("importAiMappingRunning"),
      back: t("back", { defaultValue: "Back" }),
      cancel: t("cancel"),
      cancelImport: t("cancelImport", { defaultValue: "Cancel import" }),
      columnMapping: t("importColumnMapping"),
      dragDrop: t("importCsvGuidelines"),
      errorInvalidFile: t("importInvalidFile"),
      importFailed: t("importFailed"),
      importing: t("importing"),
      importStart: t("importStart"),
      importSummary: t("importSummary"),
      loadedFile: t("importLoaded"),
      lowConfidence: t("importLowConfidence"),
      mapRequired: t("importMapRequired"),
      mappingPresets: t("importMappingPresets"),
      mappingPresetsDescription: t("importMappingPresetsDescription"),
      missingRequired: t("importMissingRequired"),
      noPreset: t("importNoPreset"),
      notMapped: t("importNotMapped"),
      preview: t("preview"),
      previewRowOf: t("importRowOf"),
      processing: t("processing"),
      save: t("save"),
      savePresetDescription: t("importSavePresetDescription"),
      savePresetTitle: t("importSavePresetTitle"),
      savedPreset: t("importPresetSaved"),
      selectColumn: t("importSelectColumn"),
      selectFile: t("selectFile"),
      templateMode: t("importTemplateMode"),
      templateModeDescription: t("importTemplateModeDescription"),
      templateSyntax: t("importTemplateSyntax"),
      title: t("importClientsTitle"),
      totalRows: t("importCsvFormatGuidelines"),
      uploadHint: t("importUploadHint"),
      uploadedFileColumns: t("importUploadedFileColumns"),
      uploadedFileInfoTitle: t("importUploadedFileInfoTitle"),
      uploadedFileName: t("importUploadedFileName"),
      uploadedFilePreviewEmpty: t("importUploadedFilePreviewEmpty"),
      uploadedFilePreviewHide: t("importUploadedFilePreviewHide"),
      uploadedFilePreviewShow: t("importUploadedFilePreviewShow"),
      uploadedFileRows: t("importUploadedFileRows"),
      uploadTitle: t("importUploadTitle"),
      valueEmpty: t("importNoData"),
      importIdPreviewLabel: t("importId"),
    }),
    [t]
  );

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useContactsModuleSecondaryShellNav();

  usePageConfig({
    breadcrumbs: [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("import") },
    ],
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  const handleProgress = (progress: ImportRunProgress) => {
    const message = t("importProgress", {
      processed: progress.processed,
      total: progress.total,
      success: progress.success,
      failed: progress.failed,
      defaultValue: `Imported ${progress.processed}/${progress.total}`,
    });
    if (progressToastId.current === undefined) {
      progressToastId.current = toast.loading(message);
      return;
    }
    toast.loading(message, { id: progressToastId.current });
  };

  const handleImportRow = useCallback(
    async (row: Record<string, string>, rowIndex: number) => {
      try {
        const input = mapImportRowToContactCreateInput(row);
        if (!input.display_name) {
          throw new Error(t("importDisplayNameRequired"));
        }
        const now = new Date().toISOString();
        const matchValue = row.__match_id__?.trim() || null;

        if (matchValue) {
          let existing = await findContactByImportId(matchValue);
          if (!existing) {
            existing = await findContactByReferenceId(matchValue);
          }
          if (existing) {
            const patch = mapImportRowToContactUpdatePatch(
              row,
              matchValue,
              now
            );
            await updateContact(existing.id, patch);
            return;
          }
        }

        await createContact({
          ...input,
          import_id: matchValue ?? input.import_id ?? null,
          last_imported_at: now,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : t("importFailed");
        toast.error(
          t("importRowFailed", {
            row: rowIndex + 1,
            message,
            defaultValue: `Row ${rowIndex + 1}: ${message}`,
          })
        );
        throw err;
      }
    },
    [t]
  );

  return (
    <ImportPageShell>
      <Toaster />
      <CSVImportWizard
        className={importPageContentClassName}
        fieldDefinitions={CONTACTS_IMPORT_FIELDS}
        labels={labels}
        matchByConfig={matchByConfig}
        matchByLabels={matchByLabels}
        onAiMap={async (input) => {
          const suggested = await suggestContactsImportMappings({
            csvHeaders: input.csvHeaders,
            fieldDefinitions: input.fieldDefinitions,
            sampleRows: input.sampleRows,
          });
          if (suggested.length) {
            toast.success(
              t("importAiMappingApplied", {
                count: suggested.length,
                defaultValue: `Applied ${suggested.length} AI mappings`,
              })
            );
          } else {
            toast.message(t("importAiMappingNoSuggestions"));
          }
          return suggested;
        }}
        onBack={() => navigate("/mdl/contacts")}
        onError={(message) => toast.error(message)}
        onImportComplete={(summary) => {
          if (progressToastId.current !== undefined) {
            toast.dismiss(progressToastId.current);
            progressToastId.current = undefined;
          }
          if (summary.canceled) {
            toast.message(
              t("importCanceled", {
                processed: summary.processed,
                total: summary.total,
                defaultValue: "Import canceled",
              })
            );
            return;
          }
          if (summary.failed > 0) {
            toast.warning(
              t("importSummary", {
                success: summary.success,
                failed: summary.failed,
                processed: summary.processed,
                total: summary.total,
                defaultValue: `Imported ${summary.success}/${summary.total}`,
              })
            );
          } else {
            toast.success(
              t("importSummary", {
                success: summary.success,
                failed: summary.failed,
                processed: summary.processed,
                total: summary.total,
                defaultValue: `Imported ${summary.success}/${summary.total}`,
              })
            );
          }
          navigate("/mdl/contacts");
        }}
        onImportProgress={handleProgress}
        onImportRow={handleImportRow}
        onInfo={(message) => toast.message(message)}
        onMatchByConfigChange={setMatchByConfig}
        onSuccess={(message) => toast.success(message)}
        presetAdapter={{
          loadPresets: getContactsImportPresets,
          savePreset: saveContactsImportPreset,
        }}
        previewColumns={CONTACTS_IMPORT_PREVIEW_COLUMNS}
      />
    </ImportPageShell>
  );
}
