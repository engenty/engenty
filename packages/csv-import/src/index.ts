// Types

// Functions
export {
  applyCsvHeaders,
  type CsvCleanupIssue,
  type CsvCleanupIssueCode,
  type CsvCleanupOptions,
  type CsvCleanupResult,
  cleanupCSV,
} from "./cleanup-csv.js";
// Components
export {
  CSVImportWizard,
  type CSVImportWizardLabels,
  type CSVImportWizardProps,
  CsvGrid,
  type CsvGridProps,
  CsvTable,
  type CsvTableLabels,
  type CsvTableProps,
  type ImportPresetAdapter,
  type PreviewColumn,
  XlsxViewer,
  type XlsxViewerLabels,
  type XlsxViewerProps,
} from "./components/index.jsx";
export {
  appendCsvColumn,
  appendCsvRow,
  type CsvCell,
  type CsvMatrix,
  type CsvRange,
  clearCsvRange,
  csvRange,
  csvRangeContains,
  csvRangeToText,
  EMPTY_CSV_MATRIX,
  parseCsvBlock,
  parseCsvMatrix,
  removeCsvColumn,
  removeCsvRow,
  serializeCsvMatrix,
  setCsvCell,
  setCsvColumnName,
  writeCsvBlock,
} from "./csv-matrix.js";
export { applyDeterministicMapping } from "./deterministic-mapping.js";
export {
  normalizeImportPresets,
  serializeImportPresets,
  upsertImportPreset,
} from "./import-presets.js";
export { type RunImportOptions, runImport } from "./import-runner.js";
export {
  ALL_CONNECTION_IMPORT_SOURCES,
  type ConnectionFetchMode,
  type ConnectionImportSource,
  connectionImportSourcesForDomain,
  FILE_CONNECTION_IMPORT_SOURCES,
  type ImportDomain,
  type ImportSourceKind,
  isImportableConnectionFile,
  TYPED_CONNECTION_IMPORT_SOURCES,
} from "./import-sources.js";
export {
  ImportPageShell,
  importPageContentClassName,
  importPageScrollShellClassName,
} from "./page-shell.js";
export { detectDelimiter, parseCSV, parseCSVRows } from "./parse-csv.js";
export {
  normalizeListRecordsPayload,
  recordsToDelimitedText,
} from "./records-to-csv.js";
export {
  escapeDelimitedField,
  serializeDelimitedMatrix,
} from "./serialize-csv.js";
export {
  getTemplateExamples,
  parseTemplate,
  validateTemplate,
} from "./template-parser.js";
export {
  createTenantImportPresetClient,
  type ImportAiMapMappingResponse,
  mapImportAiMapResponse,
  type TenantImportPresetClientOptions,
} from "./tenant-import-presets.js";
export type {
  ColumnMapping,
  ConnectionImportConfig,
  CsvCleanupRequest,
  CsvCleanupResponse,
  ImportFieldDefinition,
  ImportPreset,
  ImportRunProgress,
  ImportRunSummary,
  MatchByConfig,
  MatchByLabels,
  MatchByType,
  ParsedCSV,
} from "./types.js";
export {
  columnLetter,
  isXlsxSheetTruncated,
  readXlsxWorkbook,
  XLSX_MAX_COLUMNS,
  XLSX_MAX_ROWS,
  type XlsxSheet,
  type XlsxWorkbook,
  xlsxCellText,
} from "./xlsx-workbook.js";
