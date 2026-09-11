/**
 * An .xlsx workbook, one sheet at a time, in the grid the CSV files use.
 *
 * Read-only on purpose. Reading a workbook is a parse; writing one back is a
 * different job — styles, formulas, number formats and everything this viewer
 * deliberately does not model would have to survive the round trip, and a save
 * that quietly dropped them would be worse than no save at all.
 *
 * What it will NOT do is pretend. A capped sheet says it was capped, a hidden
 * sheet is shown and marked rather than dropped, and a formula with no cached
 * result shows its formula instead of a blank cell.
 */
import { Button, cn } from "@engenty/ui-core";
import { useEffect, useRef, useState } from "react";
import {
  isXlsxSheetTruncated,
  readXlsxWorkbook,
  type XlsxWorkbook,
} from "../xlsx-workbook.js";
import { CsvGrid, type CsvTableLabels } from "./CsvGrid.jsx";

export interface XlsxViewerLabels {
  failed: string;
  hiddenSheet: string;
  noSheets: string;
  reading: string;
  /** `{{shown}}` and `{{total}}` are replaced. */
  truncatedColumns: string;
  /** `{{shown}}` and `{{total}}` are replaced. */
  truncatedRows: string;
}

const DEFAULT_LABELS: XlsxViewerLabels = {
  failed: "This workbook could not be read.",
  hiddenSheet: "hidden",
  noSheets: "This workbook has no sheets.",
  reading: "Reading workbook…",
  truncatedColumns: "Showing the first {{shown}} of {{total}} columns.",
  truncatedRows: "Showing the first {{shown}} of {{total}} rows.",
};

export interface XlsxViewerProps {
  className?: string;
  data: ArrayBuffer | Uint8Array;
  gridLabels?: Partial<CsvTableLabels>;
  labels?: Partial<XlsxViewerLabels>;
  /**
   * The parsed workbook, once. Here so a host can tell the copilot what the
   * reader is looking at without parsing the same megabyte a second time.
   */
  onWorkbook?: (workbook: XlsxWorkbook) => void;
}

type State =
  | { status: "failed" }
  | { status: "reading" }
  | { status: "ready"; workbook: XlsxWorkbook };

export function XlsxViewer({
  className,
  data,
  gridLabels,
  labels,
  onWorkbook,
}: XlsxViewerProps) {
  const t = { ...DEFAULT_LABELS, ...labels };
  const [state, setState] = useState<State>({ status: "reading" });
  const [activeSheet, setActiveSheet] = useState(0);
  // Read through a ref so a caller passing an inline arrow does not re-parse
  // the workbook on every render.
  const notify = useRef(onWorkbook);
  notify.current = onWorkbook;

  useEffect(() => {
    // A workbook swapped mid-parse must not be overwritten by the old one.
    let current = true;
    setState({ status: "reading" });
    setActiveSheet(0);
    readXlsxWorkbook(data)
      .then((workbook) => {
        if (current) {
          setState({ status: "ready", workbook });
          notify.current?.(workbook);
        }
      })
      .catch(() => {
        if (current) {
          setState({ status: "failed" });
        }
      });
    return () => {
      current = false;
    };
  }, [data]);

  if (state.status !== "ready") {
    return (
      <div
        className={cn(
          "flex min-h-0 flex-1 items-center justify-center rounded-md border p-6",
          className
        )}
      >
        <p className="text-muted-foreground text-sm">
          {state.status === "reading" ? t.reading : t.failed}
        </p>
      </div>
    );
  }

  const { sheets } = state.workbook;
  const sheet = sheets[Math.min(activeSheet, sheets.length - 1)];
  if (!sheet) {
    return (
      <div
        className={cn(
          "flex min-h-0 flex-1 items-center justify-center rounded-md border p-6",
          className
        )}
      >
        <p className="text-muted-foreground text-sm">{t.noSheets}</p>
      </div>
    );
  }

  const notice = isXlsxSheetTruncated(sheet) ? (
    <>
      {sheet.sourceRowCount > sheet.matrix.rows.length
        ? t.truncatedRows
            .replace("{{shown}}", String(sheet.matrix.rows.length))
            .replace("{{total}}", String(sheet.sourceRowCount))
        : null}{" "}
      {sheet.sourceColumnCount > sheet.matrix.columns.length
        ? t.truncatedColumns
            .replace("{{shown}}", String(sheet.matrix.columns.length))
            .replace("{{total}}", String(sheet.sourceColumnCount))
        : null}
    </>
  ) : null;

  return (
    <CsvGrid
      className={className}
      footerLeading={
        sheets.length > 1 ? (
          <span className="flex flex-wrap items-center gap-1">
            {sheets.map((candidate, index) => (
              <Button
                className={cn(
                  "h-6 px-2 text-xs",
                  index === activeSheet && "bg-background shadow-sm"
                )}
                key={`${candidate.name}-${String(index)}`}
                onClick={() => setActiveSheet(index)}
                size="sm"
                variant={index === activeSheet ? "outline" : "ghost"}
              >
                {candidate.name}
                {candidate.hidden ? (
                  <span className="ml-1 opacity-60">({t.hiddenSheet})</span>
                ) : null}
              </Button>
            ))}
          </span>
        ) : null
      }
      // Switching sheets is a new grid: the old selection points at cells that
      // are no longer there.
      key={`${String(activeSheet)}-${sheet.name}`}
      labels={gridLabels}
      matrix={sheet.matrix}
      notice={notice}
      readOnly
      showDelimiter={false}
    />
  );
}
