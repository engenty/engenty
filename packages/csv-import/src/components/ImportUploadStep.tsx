import type { CSVImportWizardLabels } from "../types.js";
import { CSVUploadZone } from "./CSVUploadZone.js";

export interface ImportUploadStepProps {
  error: string | null;
  labels: CSVImportWizardLabels;
  loading: boolean;
  onError: (message: string) => void;
  onFileLoaded: (content: string, filename: string) => void;
}

export function ImportUploadStep({
  labels,
  loading,
  error,
  onFileLoaded,
  onError,
}: ImportUploadStepProps) {
  return (
    <div>
      {error && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-6">
        <CSVUploadZone
          errorInvalidFile={labels.errorInvalidFile}
          isLoading={loading}
          onError={onError}
          onFileLoaded={onFileLoaded}
          processingLabel={labels.processing}
          selectFileLabel={labels.selectFile}
          uploadHint={labels.uploadHint}
          uploadTitle={labels.uploadTitle}
        />
        <div className="rounded-lg bg-muted/30 p-4">
          <h3 className="mb-2 font-semibold text-sm">{labels.totalRows}</h3>
          <p className="text-muted-foreground text-xs">{labels.dragDrop}</p>
        </div>
      </div>
    </div>
  );
}
