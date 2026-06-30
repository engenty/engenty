import { useCSVImportWizard } from "../hooks/useCSVImportWizard.js";
import type { CSVImportWizardProps } from "../types.js";
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
  fieldDefinitions,
  previewColumns,
  labels,
  onAiMap,
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
  className = "",
}: CSVImportWizardProps) {
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
    labels,
    matchByConfig,
    onAiMap,
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

  return (
    <div className={className}>
      {step === "upload" ? (
        <ImportUploadStep
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
