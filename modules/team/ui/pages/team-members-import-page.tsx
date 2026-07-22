import { useTranslation } from "@engenty/i18n/ui";
import {
  CSVImportWizard,
  type CSVImportWizardLabels,
  connectionImportSourcesForDomain,
  ImportPageShell,
  type ImportRunProgress,
  type ImportRunSummary,
  importPageContentClassName,
  type MatchByConfig,
} from "@engenty/import";
import { useQueryClient } from "@engenty/query-client";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Toaster, toast } from "sonner";
import {
  cleanupTeamImportCsv,
  findTeamMemberByEmail,
  findTeamMemberByImportId,
  getTeamImportPresets,
  saveTeamImportPreset,
  suggestTeamImportMappings,
} from "../api/import.js";
import { createTeamMember, updateTeamMember } from "../api.js";
import { useTeamMemberTaxonomyTerms } from "../hooks/use-team-member-taxonomy-terms.js";
import { useTeamModuleSecondaryShellNav } from "../hooks/use-team-module-secondary-shell-nav.js";
import { formatImportRowError } from "../lib/format-import-error.js";
import { ImportTaxonomyEnsurer } from "../lib/import-taxonomy-ensurer.js";
import {
  mapImportRowToTeamMemberCreateInput,
  mapImportRowToTeamMemberUpdatePatch,
  TEAM_IMPORT_FIELDS,
  TEAM_IMPORT_PREVIEW_COLUMNS,
} from "../lib/import-team-members.js";
import { teamModuleKeys } from "../team-module-queries.js";
import { TEAM_IMPORT_PATH, TEAM_MODULE_BASE } from "../team-paths.js";

const DEFAULT_MATCH_BY: MatchByConfig = { type: "none" };

export function TeamMembersImportPage() {
  const { t } = useTranslation("team");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const progressToastId = useRef<string | number | undefined>(undefined);
  const firstImportErrorRef = useRef<string | null>(null);
  const taxonomyEnsurerRef = useRef<ImportTaxonomyEnsurer | null>(null);
  const [matchByConfig, setMatchByConfig] =
    useState<MatchByConfig>(DEFAULT_MATCH_BY);
  const {
    isLoading: taxonomyLoading,
    locationTerms,
    roleTerms,
  } = useTeamMemberTaxonomyTerms();
  const taxonomy = useMemo(
    () => ({ roleTerms, locationTerms }),
    [locationTerms, roleTerms]
  );

  useEffect(() => {
    if (taxonomyLoading) {
      return;
    }
    if (!taxonomyEnsurerRef.current) {
      taxonomyEnsurerRef.current = new ImportTaxonomyEnsurer(taxonomy);
      return;
    }
    if (!taxonomyEnsurerRef.current.hasPendingChanges) {
      taxonomyEnsurerRef.current.reset(taxonomy);
    }
  }, [taxonomy, taxonomyLoading]);

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
      redirectTo: TEAM_IMPORT_PATH,
      sources: connectionImportSourcesForDomain("team"),
    }),
    [t]
  );

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useTeamModuleSecondaryShellNav();

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
        const ensurer = taxonomyEnsurerRef.current;
        if (!ensurer) {
          throw new Error(t("import.failed"));
        }
        const preparedRow = await ensurer.prepareRow(row);
        const input = mapImportRowToTeamMemberCreateInput(
          preparedRow,
          ensurer.getContext()
        );
        if (!input.full_name) {
          throw new Error(t("import.fullNameRequired"));
        }
        const now = new Date().toISOString();
        const matchValue = row.__match_id__?.trim() || null;
        const rowEmail = row.email?.trim() || null;

        if (matchValue) {
          let existing = await findTeamMemberByImportId(matchValue);
          if (!existing && rowEmail) {
            existing = await findTeamMemberByEmail(rowEmail);
          }
          if (existing) {
            const patch = mapImportRowToTeamMemberUpdatePatch(
              preparedRow,
              matchValue,
              now,
              ensurer.getContext()
            );
            await updateTeamMember(existing.id, patch);
            return;
          }
        }

        await createTeamMember({
          ...input,
          import_id: matchValue ?? input.import_id ?? null,
          last_imported_at: now,
        });
      } catch (err) {
        const message = formatImportRowError(err, t("import.failed"));
        if (!firstImportErrorRef.current) {
          firstImportErrorRef.current = t("import.rowFailed", {
            row: rowIndex + 1,
            message,
            defaultValue: `Row ${rowIndex + 1}: ${message}`,
          });
        }
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
        fieldDefinitions={TEAM_IMPORT_FIELDS}
        labels={labels}
        matchByConfig={matchByConfig}
        matchByLabels={matchByLabels}
        onAiMap={async (input: {
          csvHeaders: string[];
          fieldDefinitions: typeof TEAM_IMPORT_FIELDS;
          sampleRows: string[][];
        }) => {
          const suggested = await suggestTeamImportMappings({
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
        onCleanup={async (input) =>
          cleanupTeamImportCsv({
            csvText: input.csvText,
            fieldDefinitions: input.fieldDefinitions,
          })
        }
        onBack={() => navigate(TEAM_MODULE_BASE)}
        onError={(message: string) => toast.error(message)}
        onImportComplete={(summary: ImportRunSummary) => {
          if (progressToastId.current !== undefined) {
            toast.dismiss(progressToastId.current);
            progressToastId.current = undefined;
          }
          if (taxonomyEnsurerRef.current?.hasPendingChanges) {
            void queryClient.invalidateQueries({
              queryKey: teamModuleKeys.all,
            });
          }
          const sampleError = firstImportErrorRef.current;
          firstImportErrorRef.current = null;

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
          if (summary.success === 0 && summary.failed > 0) {
            toast.error(
              sampleError ??
                t("import.failedAll", {
                  failed: summary.failed,
                  defaultValue: `Import failed for all ${summary.failed} rows`,
                }),
              { duration: 10_000 }
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
              }),
              sampleError
                ? { description: sampleError, duration: 10_000 }
                : undefined
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
          navigate(TEAM_MODULE_BASE);
        }}
        onImportProgress={handleProgress}
        onImportRow={handleImportRow}
        onInfo={(message: string) => toast.message(message)}
        onMatchByConfigChange={setMatchByConfig}
        presetAdapter={{
          loadPresets: getTeamImportPresets,
          savePreset: saveTeamImportPreset,
        }}
        previewColumns={TEAM_IMPORT_PREVIEW_COLUMNS}
      />
    </ImportPageShell>
  );
}
