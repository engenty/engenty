import { useTranslation } from "@engenty/i18n/ui";
import {
  CSVImportWizard,
  type CSVImportWizardLabels,
  type CsvCleanupRequest,
  connectionImportSourcesForDomain,
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
  cleanupContactsImportCsv,
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
      description: t("import.matchBy.descriptionShort"),
      label: t("import.id"),
      none: t("import.matchBy.none"),
      placeholder: t("import.matchBy.placeholder"),
      templateMode: t("import.template.mode"),
      templateModeDescription: t("import.template.modeDescription"),
      templateSyntax: t("import.template.syntax"),
    }),
    [t]
  );

  const labels: CSVImportWizardLabels = useMemo(
    () => ({
      aiMapping: t("import.ai.mapping"),
      aiMappingFailed: t("import.ai.failed"),
      aiMappingRunning: t("import.ai.running"),
      back: t("back", { defaultValue: "Back" }),
      cancel: t("cancel"),
      cancelImport: t("import.cancel", { defaultValue: "Cancel import" }),
      cleanedFile: t("import.cleaned", {
        defaultValue: "Cleaned upload ({{count}} fixes)",
      }),
      cleanupFailed: t("import.cleanupFailed", {
        defaultValue: "CSV cleanup failed; using local cleanup only",
      }),
      columnMapping: t("import.columnMapping"),
      dragDrop: t("import.csv.guidelines"),
      errorEmptyPaste: t("import.paste.empty"),
      errorInvalidFile: t("import.invalidFile"),
      importFailed: t("import.failed"),
      importing: t("import.importing"),
      importStart: t("import.start"),
      importSummary: t("import.summary"),
      loadedFile: t("import.loaded"),
      lowConfidence: t("import.lowConfidence"),
      mapRequired: t("import.mapRequired"),
      mappingPresets: t("import.presets.label"),
      mappingPresetsDescription: t("import.presets.description"),
      missingRequired: t("import.missingRequired"),
      noPreset: t("import.presets.none"),
      notMapped: t("import.notMapped"),
      pasteAction: t("import.paste.action"),
      pasteContinue: t("import.paste.continue"),
      pasteHint: t("import.paste.hint"),
      pastePlaceholder: t("import.paste.placeholder"),
      preview: t("preview"),
      previewRowOf: t("import.rowOf"),
      processing: t("processing"),
      save: t("save"),
      savePresetDescription: t("import.presets.saveDescription"),
      savePresetTitle: t("import.presets.saveTitle"),
      savedPreset: t("import.presets.saved"),
      selectColumn: t("import.selectColumn"),
      selectFile: t("selectFile"),
      templateMode: t("import.template.mode"),
      templateModeDescription: t("import.template.modeDescription"),
      templateSyntax: t("import.template.syntax"),
      title: t("import.title"),
      totalRows: t("import.csv.formatGuidelines"),
      uploadHint: t("import.upload.hint"),
      uploadedFileColumns: t("import.uploadedFile.columns"),
      uploadedFileInfoTitle: t("import.uploadedFile.infoTitle"),
      uploadedFileName: t("import.uploadedFile.name"),
      uploadedFilePreviewEmpty: t("import.uploadedFile.previewEmpty"),
      uploadedFilePreviewHide: t("import.uploadedFile.previewHide"),
      uploadedFilePreviewShow: t("import.uploadedFile.previewShow"),
      uploadedFileRows: t("import.uploadedFile.rows"),
      uploadTitle: t("import.upload.title"),
      valueEmpty: t("import.noData"),
      importIdPreviewLabel: t("import.id"),
    }),
    [t]
  );

  const connectionImport = useMemo(
    () => ({
      labels: {
        browseEmpty: t("import.connections.browseEmpty"),
        browseDescription: t("import.connections.browseDescription"),
        browseTitle: t("import.connections.browseTitle"),
        cancel: t("cancel"),
        connect: t("import.connections.connect"),
        connecting: t("import.connections.connecting"),
        connectOrg: t("import.connections.connectOrg"),
        connectPersonal: t("import.connections.connectPersonal"),
        connected: t("import.connections.connected"),
        credentialsTitle: t("import.connections.credentialsTitle"),
        loadingCatalog: t("import.connections.loadingCatalog"),
        notConnected: t("import.connections.notConnected"),
        openSettings: t("import.connections.openSettings"),
        sectionTitle: t("import.connections.sectionTitle"),
        submitCredentials: t("import.connections.submitCredentials"),
        use: t("import.connections.use"),
        useAccount: t("import.connections.useAccount"),
      },
      redirectTo: "/mdl/contacts/import",
      sources: connectionImportSourcesForDomain("contacts"),
    }),
    [t]
  );

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useContactsModuleSecondaryShellNav();

  usePageConfig({
    breadcrumbs: [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("import.label") },
    ],
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  const handleProgress = (progress: ImportRunProgress) => {
    const message = t("import.progress", {
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
          throw new Error(t("import.displayNameRequired"));
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
        const message = err instanceof Error ? err.message : t("import.failed");
        toast.error(
          t("import.rowFailed", {
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
        connectionImport={connectionImport}
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
              t("import.ai.applied", {
                count: suggested.length,
                defaultValue: `Applied ${suggested.length} AI mappings`,
              })
            );
          } else {
            toast.message(t("import.ai.noSuggestions"));
          }
          return suggested;
        }}
        onCleanup={async (input: CsvCleanupRequest) =>
          cleanupContactsImportCsv({
            csvText: input.csvText,
            fieldDefinitions: input.fieldDefinitions,
          })
        }
        onBack={() => navigate("/mdl/contacts")}
        onError={(message) => toast.error(message)}
        onImportComplete={(summary) => {
          if (progressToastId.current !== undefined) {
            toast.dismiss(progressToastId.current);
            progressToastId.current = undefined;
          }
          if (summary.canceled) {
            toast.message(
              t("import.canceled", {
                processed: summary.processed,
                total: summary.total,
                defaultValue: "Import canceled",
              })
            );
            return;
          }
          if (summary.failed > 0) {
            toast.warning(
              t("import.summary", {
                success: summary.success,
                failed: summary.failed,
                processed: summary.processed,
                total: summary.total,
                defaultValue: `Imported ${summary.success}/${summary.total}`,
              })
            );
          } else {
            toast.success(
              t("import.summary", {
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
