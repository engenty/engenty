import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@engenty/ui-core";
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useMemo, useState } from "react";
import { parseTemplate } from "../template-parser.js";
import type {
  ColumnMapping,
  ImportFieldDefinition,
  MatchByConfig,
} from "../types.js";

interface PreviewPanelProps {
  csvHeaders: string[];
  csvRows: string[][];
  emptyValueLabel: string;
  fields: ImportFieldDefinition[];
  fileName: string | null;
  importIdLabel?: string;
  labels: {
    preview: string;
    rowOf: string;
    templateTag: string;
    uploadedFileInfoTitle: string;
    uploadedFileName: string;
    uploadedFileColumns: string;
    uploadedFileRows: string;
    uploadedFilePreviewShow: string;
    uploadedFilePreviewHide: string;
    uploadedFilePreviewEmpty: string;
  };
  mappings: ColumnMapping[];
  matchByConfig?: MatchByConfig;
}

function computeMatchId(
  rawRow: string[],
  csvHeaders: string[],
  config: MatchByConfig,
  _processedData: Record<string, string>
): string {
  if (config.type === "column" && config.columnIndex !== undefined) {
    return rawRow[config.columnIndex]?.trim() ?? "";
  }
  if (config.type === "template" && config.template) {
    try {
      return parseTemplate(config.template, rawRow, csvHeaders).trim();
    } catch {
      return "";
    }
  }
  return "";
}

export function PreviewPanel({
  fields,
  mappings,
  csvRows,
  csvHeaders,
  labels,
  emptyValueLabel,
  fileName,
  importIdLabel,
  matchByConfig,
}: PreviewPanelProps) {
  const [currentRow, setCurrentRow] = useState(0);
  const [showRawPreview, setShowRawPreview] = useState(false);
  const rawPreviewRows = csvRows.slice(0, 10);

  const processedData = useMemo(() => {
    const row = csvRows[currentRow] ?? [];
    return fields.reduce<Record<string, string>>((acc, field) => {
      const mapping = mappings.find((m) => m.fieldKey === field.key);
      if (!mapping) {
        acc[field.key] = "";
        return acc;
      }
      if (mapping.isTemplate && mapping.template) {
        try {
          acc[field.key] = parseTemplate(mapping.template, row, csvHeaders);
        } catch (error) {
          acc[field.key] =
            `[Error: ${error instanceof Error ? error.message : "Template error"}]`;
        }
        return acc;
      }
      if (mapping.csvColumnIndex === null) {
        acc[field.key] = "";
      } else {
        acc[field.key] = row[mapping.csvColumnIndex] ?? "";
      }
      return acc;
    }, {});
  }, [csvRows, currentRow, fields, mappings, csvHeaders]);

  const matchId = useMemo(() => {
    if (!matchByConfig || matchByConfig.type === "none") {
      return "";
    }
    const row = csvRows[currentRow] ?? [];
    return computeMatchId(row, csvHeaders, matchByConfig, processedData);
  }, [matchByConfig, csvRows, currentRow, csvHeaders, processedData]);

  return (
    <div className="min-w-0 space-y-4">
      <div>
        <h3 className="mb-1 font-semibold text-lg">
          {labels.uploadedFileInfoTitle}
        </h3>
        {fileName ? (
          <p className="mb-1 truncate font-semibold text-foreground text-sm">
            {fileName}
          </p>
        ) : null}
        <p className="text-muted-foreground text-sm">
          {csvRows.length} {labels.uploadedFileRows}, {csvHeaders.length}{" "}
          {labels.uploadedFileColumns}
        </p>
        <Collapsible
          className="mt-2"
          onOpenChange={setShowRawPreview}
          open={showRawPreview}
        >
          <CollapsibleTrigger asChild className="w-full p-0">
            <div className="flex h-auto cursor-pointer items-center justify-start gap-2 p-inline-0 text-left text-muted-foreground text-sm no-underline hover:text-foreground hover:no-underline">
              {showRawPreview
                ? labels.uploadedFilePreviewHide
                : labels.uploadedFilePreviewShow}
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  showRawPreview ? "rotate-180" : ""
                }`}
              />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            {rawPreviewRows.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {labels.uploadedFilePreviewEmpty}
              </p>
            ) : (
              <div className="overflow-auto rounded-md border bg-background">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-muted/40">
                    <tr>
                      {csvHeaders.map((header, headerIndex) => (
                        <th
                          className="px-2 py-1.5 font-medium"
                          key={`${header}-${headerIndex}`}
                          title={
                            header?.trim()
                              ? `${headerIndex}: ${header}`
                              : undefined
                          }
                        >
                          <span className="font-mono text-muted-foreground">
                            [{headerIndex}]
                          </span>
                          {header?.trim() ? (
                            <span className="ml-1">{header}</span>
                          ) : null}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rawPreviewRows.map((row, rowIndex) => (
                      <tr
                        className="border-b last:border-0"
                        key={`row-${rowIndex}`}
                      >
                        {csvHeaders.map((_, colIndex) => (
                          <td
                            className="px-2 py-1.5 align-top"
                            key={`${rowIndex}-${colIndex}`}
                          >
                            {row[colIndex] || emptyValueLabel}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="mb-1 font-semibold text-lg">{labels.preview}</h3>
          <p className="text-muted-foreground text-sm">
            {labels.rowOf
              .replace("{{row}}", String(currentRow + 1))
              .replace("{{total}}", String(csvRows.length))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            disabled={currentRow === 0}
            onClick={() => setCurrentRow((row) => Math.max(0, row - 1))}
            size="sm"
            variant="outline"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            disabled={currentRow >= csvRows.length - 1}
            onClick={() =>
              setCurrentRow((row) => Math.min(csvRows.length - 1, row + 1))
            }
            size="sm"
            variant="outline"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border bg-muted/30">
        <div className="divide-y">
          {matchByConfig && importIdLabel && (
            <div className="border-b bg-muted/50 p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start gap-4">
                <div className="min-w-0">
                  <span className="font-bold text-muted-foreground text-xs">
                    {importIdLabel}
                  </span>
                </div>
                <div
                  className={`min-w-0 break-words text-sm ${
                    matchId ? "" : "text-muted-foreground italic"
                  }`}
                >
                  {matchId || emptyValueLabel}
                </div>
              </div>
            </div>
          )}
          {fields.map((field) => {
            const value = processedData[field.key] || "";
            const isError = value.startsWith("[Error:");
            const isEmpty = !value.trim();
            const mapping = mappings.find((m) => m.fieldKey === field.key);
            return (
              <div className="p-3" key={field.key}>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start gap-4">
                  <div className="min-w-0">
                    <span className="font-medium text-muted-foreground text-xs">
                      {field.label}
                    </span>
                    {mapping?.isTemplate && (
                      <span className="text-muted-foreground text-xs">
                        {" "}
                        ({labels.templateTag})
                      </span>
                    )}
                  </div>
                  <div
                    className={`min-w-0 break-words text-sm ${
                      isEmpty && !isError ? "text-muted-foreground italic" : ""
                    } ${isError ? "text-destructive" : ""}`}
                  >
                    {isError && <AlertCircle className="mr-1 inline h-3 w-3" />}
                    {value || emptyValueLabel}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
