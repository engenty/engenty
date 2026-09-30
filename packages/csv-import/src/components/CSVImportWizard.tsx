import { useEffect } from "react";
import { useCSVImportWizard } from "../hooks/useCSVImportWizard.js";
import { useInitialImportFile } from "../initial-import-file.js";
import type { CSVImportWizardProps, ImportWizardSnapshot } from "../types.js";
import { ImportMappingStep } from "./ImportMappingStep.js";
import { ImportUploadStep } from "./ImportUploadStep.js";
import { SavePresetDialog } from "./SavePresetDialog.js";

export type {
  AiMappingRequest,
  CSVImportWizardLabels,
  CSVImportWizardProps,
  ImportPresetAdapter,
  PreviewColumn,
} from "../types.js";

export function CSVImportWizard({
  connectionImport,
  fieldDefinitions,
  previewColumns,
  labels,
  onAiMap,
  onCleanup,
  onBack,
  onImportComplete,
  onImportProgress,
  onImportRow,
  onImportRows,
  onInfo,
  onError,
  onSuccess,
  presetAdapter,
  matchByConfig,
  matchByLabels,
  onMatchByConfigChange,
  onStateChange,
  className = "",
}: CSVImportWizardProps) {
  const initialFile = useInitialImportFile();
  const {
    step,
    setStep,
    csvData,
    csvFilename,
    mappings,
    presets,
    selectedPreset,
    saveDialogOpen,
    setSaveDialogOpen,
    progress,
    shouldCancelRef,
    loading,
    importing,
    error,
    aiMapping,
    fieldDefinitions: fields,
    labels: wizardLabels,
    presetAdapter: adapter,
    handleFile,
    handleMappingChange,
    handleImport,
    handleSavePreset,
    handleAiMapping,
    handleSelectPreset,
    handleBackClick,
    setErrorAndNotify,
  } = useCSVImportWizard({
    fieldDefinitions,
    initialFile,
    labels,
    matchByConfig,
    onAiMap,
    onCleanup,
    onBack,
    onImportComplete,
    onImportProgress,
    onImportRow,
    onImportRows,
    onInfo,
    onError,
    onMatchByConfigChange,
    onSuccess,
    presetAdapter,
  });

  const snapshotJson = JSON.stringify({
    columnCount: csvData?.headers.length ?? null,
    filename: csvFilename,
    mappedFields: mappings
      .filter((m) => m.csvColumnIndex !== null || m.isTemplate)
      .map((m) => m.fieldKey),
    rowCount: csvData?.totalRows ?? null,
    step,
    unmappedRequiredFields: fields
      .filter(
        (f) =>
          f.required &&
          !mappings.some(
            (m) =>
              m.fieldKey === f.key &&
              (m.csvColumnIndex !== null || m.isTemplate)
          )
      )
      .map((f) => f.key),
  } satisfies ImportWizardSnapshot);
  useEffect(() => {
    onStateChange?.(JSON.parse(snapshotJson) as ImportWizardSnapshot);
  }, [onStateChange, snapshotJson]);

  return (
    <div className={className}>
      {step === "upload" ? (
        <ImportUploadStep
          connectionImport={connectionImport}
          error={error}
          labels={wizardLabels}
          loading={loading}
          onError={setErrorAndNotify}
          onFileLoaded={handleFile}
        />
      ) : (
        csvData && (
          <ImportMappingStep
            aiMapping={aiMapping}
            csvData={csvData}
            csvFilename={csvFilename}
            error={error}
            fieldDefinitions={fields}
            importing={importing}
            labels={wizardLabels}
            mappings={mappings}
            matchByConfig={matchByConfig}
            matchByLabels={matchByLabels}
            onAiMap={onAiMap ? handleAiMapping : undefined}
            onCancel={() => setStep("upload" as const)}
            onCancelImport={() => {
              shouldCancelRef.current = true;
            }}
            onImport={() => void handleImport()}
            onMappingChange={handleMappingChange}
            onMatchByConfigChange={onMatchByConfigChange}
            onSavePresetClick={() => setSaveDialogOpen(true)}
            onSelectPreset={handleSelectPreset}
            presetAdapter={adapter}
            presets={presets}
            previewColumns={previewColumns}
            progress={progress}
            selectedPreset={selectedPreset}
          />
        )
      )}

      <SavePresetDialog
        currentPresetName={selectedPreset ?? undefined}
        description={labels.savePresetDescription}
        onOpenChange={setSaveDialogOpen}
        onSave={(name) => void handleSavePreset(name)}
        open={saveDialogOpen}
        saveLabel={labels.save}
        title={labels.savePresetTitle}
      />
    </div>
  );
}
