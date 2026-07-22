import { useTranslation } from "@engenty/i18n/ui";
import {
  CSVImportWizard,
  type CSVImportWizardLabels,
  type CsvCleanupRequest,
  connectionImportSourcesForDomain,
  ImportPageShell,
  type ImportRunProgress,
  importPageContentClassName,
} from "@engenty/import";
import { useQueryClient } from "@engenty/query-client";
import { usePageConfig, useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Toaster, toast } from "sonner";
import {
  cleanupSecretsImportCsv,
  getSecretsImportPresets,
  saveSecretsImportPreset,
  suggestSecretsImportMappings,
} from "../api/import.js";
import { createSecret } from "../api.js";
import { useSecretsModuleSecondaryShellNav } from "../hooks/use-secrets-module-secondary-shell-nav.js";
import {
  mapImportRowToSecretCreateInput,
  SECRETS_IMPORT_FIELDS,
  SECRETS_IMPORT_PREVIEW_COLUMNS,
  type SecretImportContext,
} from "../lib/import-secrets.js";
import { secretsKeys, useClientsQuery, useProjectsQuery } from "../queries.js";
import { SECRETS_IMPORT_PATH, SECRETS_MODULE_BASE } from "../secrets-paths.js";

export function SecretsImportPage() {
  const { t } = useTranslation("secrets");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentTenant, currentUserId } = useWorkspaceContext();
  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useSecretsModuleSecondaryShellNav();
  const progressToastId = useRef<string | number | undefined>(undefined);
  const clientsQuery = useClientsQuery();
  const projectsQuery = useProjectsQuery();

  const importContext = useMemo<SecretImportContext>(
    () => ({
      clients: clientsQuery.data ?? [],
      currentUserId: currentUserId ?? "",
      projects: projectsQuery.data ?? [],
      tenantId: currentTenant?.id ?? "",
    }),
    [clientsQuery.data, currentTenant?.id, currentUserId, projectsQuery.data]
  );

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb
        ? [moduleRootCrumb]
        : [{ label: t("menu.secrets"), to: SECRETS_MODULE_BASE }]),
      { label: t("import.label") },
    ],
    [moduleRootCrumb, t]
  );

  usePageConfig({
    breadcrumbs,
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

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
      redirectTo: SECRETS_IMPORT_PATH,
      sources: connectionImportSourcesForDomain("secrets"),
    }),
    [t]
  );

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
        const input = mapImportRowToSecretCreateInput(row, importContext);
        await createSecret(input);
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
    [importContext, t]
  );

  return (
    <ImportPageShell>
      <Toaster />
      <CSVImportWizard
        className={importPageContentClassName}
        connectionImport={connectionImport}
        fieldDefinitions={SECRETS_IMPORT_FIELDS}
        labels={labels}
        onAiMap={async (input) => {
          const suggested = await suggestSecretsImportMappings({
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
          cleanupSecretsImportCsv({
            csvText: input.csvText,
            fieldDefinitions: input.fieldDefinitions,
          })
        }
        onBack={() => navigate(SECRETS_MODULE_BASE)}
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
          if (summary.success > 0) {
            void queryClient.invalidateQueries({
              queryKey: secretsKeys.list(),
            });
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
          navigate(SECRETS_MODULE_BASE);
        }}
        onImportProgress={handleProgress}
        onImportRow={handleImportRow}
        onInfo={(message) => toast.message(message)}
        onSuccess={(message) => toast.success(message)}
        presetAdapter={{
          loadPresets: getSecretsImportPresets,
          savePreset: saveSecretsImportPreset,
        }}
        previewColumns={SECRETS_IMPORT_PREVIEW_COLUMNS}
      />
    </ImportPageShell>
  );
}
