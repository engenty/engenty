export interface ParsedCSV {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

export interface ColumnMapping {
  confidence?: number;
  csvColumn: string | null;
  csvColumnIndex: number | null;
  fieldKey: string;
  isTemplate?: boolean;
  mappingSource: "ai" | "manual" | "deterministic";
  template?: string;
}

export interface ImportFieldDefinition {
  description: string;
  examples?: string[];
  key: string;
  label: string;
  required: boolean;
  type: "text" | "email" | "phone" | "url" | "number" | "date";
}

export interface ImportPreset {
  mappings: ColumnMapping[];
  /** Optional match-by config for upsert (Import ID). Saved/loaded with preset. */
  matchByConfig?: MatchByConfig;
  name: string;
}

export interface ImportRunProgress {
  canceled: boolean;
  currentLabel: string;
  failed: number;
  processed: number;
  success: number;
  total: number;
}

export interface ImportRunSummary {
  canceled: boolean;
  failed: number;
  processed: number;
  success: number;
  total: number;
}

export interface CSVImportWizardLabels {
  aiMapping: string;
  aiMappingFailed: string;
  aiMappingRunning: string;
  back: string;
  cancel: string;
  cancelImport: string;
  /** Optional: shown after automatic cleanup. `{{count}}` = number of fixes. */
  cleanedFile?: string;
  cleanupFailed?: string;
  columnMapping: string;
  dragDrop: string;
  errorEmptyPaste: string;
  errorInvalidFile: string;
  importFailed: string;
  /** Label for Import ID row in preview when match-by is configured. */
  importIdPreviewLabel?: string;
  importing: string;
  importStart: string;
  importSummary: string;
  loadedFile: string;
  lowConfidence: string;
  mappingPresets: string;
  mappingPresetsDescription: string;
  mapRequired: string;
  missingRequired: string;
  noPreset: string;
  notMapped: string;
  pasteAction: string;
  pasteContinue: string;
  pasteHint: string;
  pastePlaceholder: string;
  preview: string;
  previewRowOf: string;
  processing: string;
  save: string;
  savedPreset: string;
  savePresetDescription: string;
  savePresetTitle: string;
  selectColumn: string;
  selectFile: string;
  templateMode: string;
  templateModeDescription: string;
  templateSyntax: string;
  title: string;
  totalRows: string;
  uploadedFileColumns: string;
  uploadedFileInfoTitle: string;
  uploadedFileName: string;
  uploadedFilePreviewEmpty: string;
  uploadedFilePreviewHide: string;
  uploadedFilePreviewShow: string;
  uploadedFileRows: string;
  uploadHint: string;
  uploadTitle: string;
  valueEmpty: string;
}

export interface AiMappingRequest {
  csvHeaders: string[];
  currentMappings: ColumnMapping[];
  fieldDefinitions: ImportFieldDefinition[];
  sampleRows: string[][];
}

/** Optional server-side cleanup (deterministic + optional AI headers). */
export interface CsvCleanupRequest {
  csvText: string;
  fieldDefinitions: ImportFieldDefinition[];
  filename: string;
}

export interface CsvCleanupResponse {
  changes: Array<{ code: string; detail?: string }>;
  cleanedContent: string;
  headers: string[];
  rowCount: number;
  usedAiHeaders: boolean;
}

export interface PreviewColumn {
  key: string;
  label: string;
}

export interface ImportPresetAdapter {
  loadPresets: () => Promise<ImportPreset[]>;
  savePreset: (
    name: string,
    mappings: ColumnMapping[],
    matchByConfig?: MatchByConfig
  ) => Promise<void>;
}

export type MatchByType = "none" | "column" | "template";

export interface MatchByConfig {
  /** CSV column index when type is "column" - select column from imported file */
  columnIndex?: number;
  template?: string;
  type: MatchByType;
}

export interface MatchByLabels {
  /** Optional description shown below the label */
  description?: string;
  label: string;
  none: string;
  placeholder: string;
  templateMode: string;
  templateModeDescription: string;
  templateSyntax: string;
}

/** Optional connection-backed sources on the upload step. */
export interface ConnectionImportConfig {
  labels: {
    browseEmpty: string;
    browseDescription: string;
    browseTitle: string;
    cancel: string;
    connect: string;
    connecting: string;
    connectOrg: string;
    connectPersonal: string;
    connected: string;
    credentialsTitle: string;
    loadingCatalog: string;
    notConnected: string;
    openSettings: string;
    sectionTitle: string;
    submitCredentials: string;
    use: string;
    useAccount: string;
  };
  /** Same-app path for OAuth return (`?connected=1`). */
  redirectTo: string;
  /** Registered connection sources for this module domain. */
  sources: import("./import-sources.js").ConnectionImportSource[];
}

export interface CSVImportWizardProps {
  className?: string;
  /** When set, shows a connection catalog below upload/paste. */
  connectionImport?: ConnectionImportConfig;
  fieldDefinitions: ImportFieldDefinition[];
  labels: CSVImportWizardLabels;
  /** Optional match-by config for upsert (re-import) behavior. Rows will include __match_id__. */
  matchByConfig?: MatchByConfig;
  matchByLabels?: MatchByLabels;
  onAiMap?: (input: AiMappingRequest) => Promise<ColumnMapping[]>;
  onBack: () => void;
  /**
   * Optional server cleanup (AI headers). Deterministic cleanup always runs
   * locally first; this is called when headers were synthesized or when the
   * caller always wants a server pass.
   */
  onCleanup?: (input: CsvCleanupRequest) => Promise<CsvCleanupResponse>;
  onError?: (message: string) => void;
  onImportComplete?: (summary: ImportRunSummary) => void;
  onImportProgress?: (progress: ImportRunProgress) => void;
  onImportRow?: (
    row: Record<string, string>,
    rowIndex: number
  ) => Promise<void>;
  onImportRows?: (rows: Record<string, string>[]) => Promise<void>;
  onInfo?: (message: string) => void;
  onMatchByConfigChange?: (config: MatchByConfig) => void;
  onSuccess?: (message: string) => void;
  presetAdapter?: ImportPresetAdapter;
  previewColumns: PreviewColumn[];
}
