import { useCallback, useRef, useState } from "react";
import { cleanupCSV } from "../cleanup-csv.js";
import { applyDeterministicMapping } from "../deterministic-mapping.js";
import { runImport } from "../import-runner.js";
import { parseCSV } from "../parse-csv.js";
import { parseTemplate } from "../template-parser.js";
import type {
  ColumnMapping,
  CSVImportWizardLabels,
  CsvCleanupRequest,
  CsvCleanupResponse,
  ImportFieldDefinition,
  ImportPreset,
  ImportPresetAdapter,
  ImportRunProgress,
  ImportRunSummary,
  MatchByConfig,
  ParsedCSV,
} from "../types.js";

export interface UseCSVImportWizardProps {
  fieldDefinitions: ImportFieldDefinition[];
  labels: CSVImportWizardLabels;
  matchByConfig?: MatchByConfig;
  onAiMap?: (input: {
    csvHeaders: string[];
    currentMappings: ColumnMapping[];
    fieldDefinitions: ImportFieldDefinition[];
    sampleRows: string[][];
  }) => Promise<ColumnMapping[]>;
  onBack: () => void;
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
}

export function useCSVImportWizard({
  fieldDefinitions,
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
  onMatchByConfigChange,
}: UseCSVImportWizardProps) {
  const [step, setStep] = useState<"upload" | "mapping">("upload");
  const [csvData, setCSVData] = useState<ParsedCSV | null>(null);
  const [csvFilename, setCsvFilename] = useState<string | null>(null);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [presets, setPresets] = useState<ImportPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [progress, setProgress] = useState<ImportRunProgress | null>(null);
  const shouldCancelRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiMapping, setAiMapping] = useState(false);

  const loadPresets = useCallback(async () => {
    if (!presetAdapter) {
      return;
    }
    const loaded = await presetAdapter.loadPresets();
    setPresets(loaded);
  }, [presetAdapter]);

  const handleFile = useCallback(
    async (content: string, filename: string) => {
      setError(null);
      setLoading(true);
      try {
        let workingContent = content;
        let cleanupChangeCount = 0;

        // Always run deterministic cleanup in-process (no network).
        const local = cleanupCSV(workingContent);
        workingContent = local.cleanedContent;
        cleanupChangeCount = local.changes.length;

        // Optional server pass: AI header naming when headers were synthesized.
        if (onCleanup && local.suggestAiHeaders) {
          try {
            const remote = await onCleanup({
              csvText: workingContent,
              filename,
              fieldDefinitions,
            });
            if (remote.cleanedContent.trim()) {
              workingContent = remote.cleanedContent;
              cleanupChangeCount = Math.max(
                cleanupChangeCount,
                remote.changes?.length ?? 0
              );
            }
          } catch (cleanupErr: unknown) {
            const message =
              cleanupErr instanceof Error
                ? cleanupErr.message
                : (labels.cleanupFailed ?? "CSV cleanup failed");
            // Non-fatal: keep deterministic result and surface a warning.
            onError?.(message);
          }
        }

        const parsed = parseCSV(workingContent);
        setCSVData(parsed);
        setCsvFilename(filename);
        setMappings(
          applyDeterministicMapping(parsed.headers, fieldDefinitions)
        );
        setStep("mapping");
        await loadPresets();
        if (cleanupChangeCount > 0) {
          onInfo?.(
            (labels.cleanedFile ?? "Cleaned upload ({{count}} fixes)")
              .replace("{{count}}", String(cleanupChangeCount))
              .replace("{{filename}}", filename)
          );
        }
        onInfo?.(
          labels.loadedFile
            .replace("{{count}}", String(parsed.totalRows))
            .replace("{{filename}}", filename)
        );
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : labels.errorInvalidFile;
        setError(message);
        onError?.(message);
      } finally {
        setLoading(false);
      }
    },
    [
      fieldDefinitions,
      labels.cleanedFile,
      labels.cleanupFailed,
      labels.errorInvalidFile,
      labels.loadedFile,
      loadPresets,
      onCleanup,
      onError,
      onInfo,
    ]
  );

  const handleMappingChange = useCallback(
    (
      fieldKey: string,
      csvColumnIndex: number | null,
      template?: { isTemplate: boolean; templateStr: string }
    ) => {
      setMappings((prev) => {
        const existing = prev.find((m) => m.fieldKey === fieldKey);
        const newMapping: ColumnMapping = {
          fieldKey,
          csvColumn:
            csvColumnIndex !== null && csvData
              ? csvData.headers[csvColumnIndex]
              : null,
          csvColumnIndex,
          mappingSource: "manual",
          isTemplate: template?.isTemplate,
          template: template?.templateStr,
        };
        if (existing) {
          return prev.map((m) => (m.fieldKey === fieldKey ? newMapping : m));
        }
        return [...prev, newMapping];
      });
      setSelectedPreset(null);
    },
    [csvData]
  );

  const getMappedRow = useCallback(
    (row: string[]) => {
      const out: Record<string, string> = {};
      for (const m of mappings) {
        if (m.isTemplate && m.template && csvData) {
          try {
            const value = parseTemplate(
              m.template,
              row,
              csvData.headers
            ).trim();
            if (value) {
              out[m.fieldKey] = value;
            }
          } catch {
            // Invalid template evaluation gets surfaced in preview panel.
          }
          continue;
        }
        if (m.csvColumnIndex !== null) {
          const v = row[m.csvColumnIndex]?.trim();
          if (v) {
            out[m.fieldKey] = v;
          }
        }
      }
      return out;
    },
    [csvData, mappings]
  );

  const handleImport = useCallback(async () => {
    if (!csvData) {
      return;
    }

    const required = fieldDefinitions.filter((f) => f.required);
    const missing = required.filter((f) => {
      const m = mappings.find((x) => x.fieldKey === f.key);
      return !m || (!m.isTemplate && m.csvColumnIndex === null);
    });
    if (missing.length > 0) {
      setError(
        `${labels.mapRequired}: ${missing.map((f) => f.label).join(", ")}`
      );
      return;
    }

    setError(null);
    setImporting(true);
    shouldCancelRef.current = false;
    try {
      const rows = csvData.rows.map((rawRow) => {
        const mapped = getMappedRow(rawRow);
        if (
          matchByConfig?.type === "column" &&
          matchByConfig.columnIndex !== undefined
        ) {
          const v = rawRow[matchByConfig.columnIndex]?.trim();
          if (v) {
            mapped.__match_id__ = v;
          }
        } else if (
          matchByConfig?.type === "template" &&
          matchByConfig.template
        ) {
          try {
            const v = parseTemplate(
              matchByConfig.template,
              rawRow,
              csvData.headers
            ).trim();
            if (v) {
              mapped.__match_id__ = v;
            }
          } catch {
            // Skip invalid template
          }
        } else if (matchByConfig?.type === "none" || !matchByConfig) {
          // Fallback: use reference_id or import_id from mapped row when match-by not configured
          const ref = mapped.reference_id?.trim();
          const imp = mapped.import_id?.trim();
          if (ref) {
            mapped.__match_id__ = ref;
            mapped.__match_field__ = "reference_id";
          } else if (imp) {
            mapped.__match_id__ = imp;
            mapped.__match_field__ = "import_id";
          }
        }
        return mapped;
      });
      if (onImportRows) {
        await onImportRows(rows);
        const summary: ImportRunSummary = {
          canceled: false,
          failed: 0,
          processed: rows.length,
          success: rows.length,
          total: rows.length,
        };
        onImportComplete?.(summary);
      } else if (onImportRow) {
        const summary = await runImport({
          items: rows,
          onItem: onImportRow,
          shouldCancel: () => shouldCancelRef.current,
          onProgress: (next) => {
            setProgress(next);
            onImportProgress?.(next);
          },
        });
        onImportComplete?.(summary);
      } else {
        throw new Error("Provide onImportRows or onImportRow");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : labels.importFailed;
      setError(message);
      onError?.(message);
    } finally {
      setImporting(false);
      setProgress(null);
      shouldCancelRef.current = false;
    }
  }, [
    csvData,
    fieldDefinitions,
    getMappedRow,
    matchByConfig,
    labels.importFailed,
    labels.importSummary,
    labels.mapRequired,
    mappings,
    onError,
    onImportComplete,
    onImportProgress,
    onImportRow,
    onImportRows,
    onSuccess,
  ]);

  const handleSavePreset = useCallback(
    async (name: string) => {
      if (!presetAdapter) {
        return;
      }
      await presetAdapter.savePreset(name, mappings, matchByConfig);
      await loadPresets();
      setSelectedPreset(name);
      onSuccess?.(labels.savedPreset.replace("{{name}}", name));
    },
    [
      labels.savedPreset,
      loadPresets,
      mappings,
      matchByConfig,
      onSuccess,
      presetAdapter,
    ]
  );

  const handleAiMapping = useCallback(async () => {
    if (!(csvData && onAiMap) || aiMapping) {
      return;
    }
    setAiMapping(true);
    setError(null);
    try {
      const suggested = await onAiMap({
        csvHeaders: csvData.headers,
        sampleRows: csvData.rows.slice(0, 8),
        fieldDefinitions,
        currentMappings: mappings,
      });
      if (!suggested.length) {
        return;
      }
      setMappings((prev) => {
        const nextByField = new Map(
          prev.map((mapping) => [mapping.fieldKey, mapping])
        );
        for (const mapping of suggested) {
          const existing = nextByField.get(mapping.fieldKey);
          const shouldReplace =
            !existing ||
            existing.csvColumnIndex === null ||
            existing.mappingSource === "deterministic";
          if (shouldReplace) {
            nextByField.set(mapping.fieldKey, {
              ...mapping,
              mappingSource: "ai",
            });
          }
        }
        return Array.from(nextByField.values());
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : labels.aiMappingFailed;
      setError(message);
      onError?.(message);
    } finally {
      setAiMapping(false);
    }
  }, [
    aiMapping,
    csvData,
    fieldDefinitions,
    labels.aiMappingFailed,
    mappings,
    onAiMap,
    onError,
  ]);

  const handleSelectPreset = useCallback(
    (name: string | null) => {
      if (!name) {
        setSelectedPreset(null);
        return;
      }
      const preset = presets.find((item) => item.name === name);
      if (!preset) {
        return;
      }
      setMappings(preset.mappings);
      setSelectedPreset(name);
      onMatchByConfigChange?.(preset.matchByConfig ?? { type: "none" });
    },
    [onMatchByConfigChange, presets]
  );

  const handleBackClick = useCallback(() => {
    if (step === "mapping") {
      setStep("upload");
      setCSVData(null);
      setCsvFilename(null);
      setMappings([]);
      setError(null);
      setProgress(null);
    } else {
      onBack();
    }
  }, [step, onBack]);

  const setErrorAndNotify = useCallback(
    (message: string) => {
      setError(message);
      onError?.(message);
    },
    [onError]
  );

  return {
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
    fieldDefinitions,
    labels,
    onAiMap,
    presetAdapter,
    handleFile,
    handleMappingChange,
    handleImport,
    handleSavePreset,
    handleAiMapping,
    handleSelectPreset,
    handleBackClick,
    setErrorAndNotify,
  };
}
