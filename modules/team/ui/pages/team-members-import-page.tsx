import { useTranslation } from "@engenty/i18n/ui";
import {
  CSVImportWizard,
  type CSVImportWizardLabels,
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
import { TEAM_MODULE_BASE } from "../team-paths.js";

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
      title: t("importTeamTitle"),
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
    useTeamModuleSecondaryShellNav();

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
        const ensurer = taxonomyEnsurerRef.current;
        if (!ensurer) {
          throw new Error(t("importFailed"));
        }
        const preparedRow = await ensurer.prepareRow(row);
        const input = mapImportRowToTeamMemberCreateInput(
          preparedRow,
          ensurer.getContext()
        );
        if (!input.full_name) {
          throw new Error(t("importFullNameRequired"));
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
        const message = formatImportRowError(err, t("importFailed"));
        if (!firstImportErrorRef.current) {
          firstImportErrorRef.current = t("importRowFailed", {
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
              t("importCanceled", {
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
                t("importFailedAll", {
                  failed: summary.failed,
                  defaultValue: `Import failed for all ${summary.failed} rows`,
                }),
              { duration: 10_000 }
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
              }),
              sampleError
                ? { description: sampleError, duration: 10_000 }
                : undefined
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
