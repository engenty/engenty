import { Button, Separator } from "@engenty/ui-core";
import { Sparkles } from "lucide-react";
import type {
  ColumnMapping,
  CSVImportWizardLabels,
  ImportFieldDefinition,
  ImportPreset,
  ImportPresetAdapter,
  MatchByConfig,
  MatchByLabels,
  ParsedCSV,
  PreviewColumn,
} from "../types.js";
import { ColumnMappingPanel } from "./ColumnMappingPanel.js";
import { MatchByControl } from "./MatchByControl.js";
import { PresetSelector } from "./PresetSelector.js";
import { PreviewPanel } from "./PreviewPanel.js";

export interface ImportMappingStepProps {
  aiMapping: boolean;
  csvData: ParsedCSV;
  csvFilename: string | null;
  error: string | null;
  fieldDefinitions: ImportFieldDefinition[];
  importing: boolean;
  labels: CSVImportWizardLabels;
  mappings: ColumnMapping[];
  matchByConfig?: MatchByConfig;
  matchByLabels?: MatchByLabels;
  onAiMap?: () => void;
  onCancel: () => void;
  onCancelImport: () => void;
  onImport: () => void;
  onMappingChange: (
    fieldKey: string,
    csvColumnIndex: number | null,
    template?: { isTemplate: boolean; templateStr: string }
  ) => void;
  onMatchByConfigChange?: (config: MatchByConfig) => void;
  onSavePresetClick: () => void;
  onSelectPreset: (name: string | null) => void;
  presetAdapter: ImportPresetAdapter | undefined;
  presets: ImportPreset[];
  previewColumns: PreviewColumn[];
  progress: { processed: number; total: number } | null;
  selectedPreset: string | null;
}

export function ImportMappingStep({
  labels,
  csvData,
  csvFilename,
  mappings,
  presets,
  selectedPreset,
  presetAdapter,
  fieldDefinitions,
  previewColumns,
  error,
  aiMapping,
  importing,
  progress,
  onAiMap,
  onMappingChange,
  onImport,
  onCancelImport,
  onCancel,
  onSelectPreset,
  onSavePresetClick,
  matchByConfig,
  matchByLabels,
  onMatchByConfigChange,
}: ImportMappingStepProps) {
  const previewFields = fieldDefinitions.filter((field) =>
    previewColumns.some((column) => column.key === field.key)
  );

  const hasAnyMapping = mappings.some(
    (m) =>
      m.csvColumnIndex !== null ||
      (m.isTemplate === true && (m.template?.trim() ?? "").length > 0)
  );

  return (
    <div>
      {error && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="mt-6 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-2xl">{labels.columnMapping}</h3>
            <div className="flex items-center gap-2">
              {onAiMap && (
                <Button
                  disabled={aiMapping || importing}
                  onClick={() => onAiMap()}
                  size="sm"
                  variant="ai"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {aiMapping ? labels.aiMappingRunning : labels.aiMapping}
                </Button>
              )}
              <Button disabled={importing || !hasAnyMapping} onClick={onImport}>
                {importing ? labels.importing : labels.importStart}
              </Button>
              {progress && (
                <span className="text-muted-foreground text-sm">
                  {progress.processed}/{progress.total}
                </span>
              )}
            </div>
          </div>
          {presetAdapter && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-sm">
                    {labels.mappingPresets}
                  </h3>
                  <p className="text-muted-foreground text-xs">
                    {labels.mappingPresetsDescription}
                  </p>
                </div>
                <PresetSelector
                  noPresetLabel={labels.noPreset}
                  onSaveClick={onSavePresetClick}
                  onSelectPreset={onSelectPreset}
                  presets={presets}
                  selectedPreset={selectedPreset ?? undefined}
                />
              </div>
              <Separator />
            </>
          )}
          {matchByConfig !== undefined &&
            matchByLabels &&
            onMatchByConfigChange && (
              <>
                <MatchByControl
                  config={matchByConfig}
                  csvData={csvData}
                  labels={matchByLabels}
                  onConfigChange={onMatchByConfigChange}
                />
                <Separator />
              </>
            )}
          <ColumnMappingPanel
            csvHeaders={csvData.headers}
            fields={fieldDefinitions}
            labels={{
              lowConfidence: labels.lowConfidence,
              missingRequired: labels.missingRequired,
              notMapped: labels.notMapped,
              templateMode: labels.templateMode,
              templateModeDescription: labels.templateModeDescription,
              templateSyntax: labels.templateSyntax,
            }}
            mappings={mappings}
            onMappingChange={onMappingChange}
          />
        </div>
        <div className="min-w-0">
          <PreviewPanel
            csvHeaders={csvData.headers}
            csvRows={csvData.rows}
            emptyValueLabel={labels.valueEmpty}
            fields={previewFields}
            fileName={csvFilename}
            importIdLabel={labels.importIdPreviewLabel}
            labels={{
              preview: labels.preview,
              rowOf: labels.previewRowOf,
              templateTag: labels.templateMode,
              uploadedFileColumns: labels.uploadedFileColumns,
              uploadedFileInfoTitle: labels.uploadedFileInfoTitle,
              uploadedFileName: labels.uploadedFileName,
              uploadedFilePreviewEmpty: labels.uploadedFilePreviewEmpty,
              uploadedFilePreviewHide: labels.uploadedFilePreviewHide,
              uploadedFilePreviewShow: labels.uploadedFilePreviewShow,
              uploadedFileRows: labels.uploadedFileRows,
            }}
            mappings={mappings}
            matchByConfig={matchByConfig}
          />
        </div>
      </div>
    </div>
  );
}
