/**
 * A matrix of cells, shown as a table and worked like one.
 *
 * Deliberately NOT a spreadsheet: no formulas, no sorting, no types. It draws
 * what it is handed. What it DOES take from spreadsheets is the interaction
 * people already have in their fingers: click a cell, drag or shift-click to
 * select a rectangle, click a header to take the column or a row number to take
 * the row, arrows and Tab to move, Ctrl/Cmd-C to copy the selection as
 * TAB-separated text (which is what Excel and Sheets paste back as cells),
 * Ctrl/Cmd-V to paste a block in — growing the table when the block is bigger —
 * Delete to clear, and Enter, a double-click, or simply typing to edit.
 *
 * Cells are NOT inputs until they are being edited. An always-on input eats the
 * mousedown, and without the mousedown there is no drag-select.
 *
 * The matrix is the contract, so a CSV file (`CsvTable`) and a worksheet
 * (`XlsxViewer`) get the same grid without either knowing about the other.
 */
import { Badge, Button, cn } from "@engenty/ui-core";
import type {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type CsvCell,
  type CsvMatrix,
  clearCsvRange,
  csvRange,
  csvRangeContains,
  csvRangeToText,
  parseCsvBlock,
  setCsvCell,
  setCsvColumnName,
  writeCsvBlock,
} from "../csv-matrix.js";

/** Rows drawn before the reader asks for the rest. */
const ROW_WINDOW = 200;

/** The header row's index in the selection model. */
const HEADER_ROW = -1;

const DELIMITER_LABEL: Record<string, string> = {
  ",": "comma",
  ";": "semicolon",
  "\t": "tab",
};

export interface CsvTableLabels {
  columns: string;
  empty: string;
  /** `{{count}}` is replaced. */
  ragged: string;
  rows: string;
  selected: string;
  showAll: string;
}

const DEFAULT_LABELS: CsvTableLabels = {
  columns: "columns",
  empty: "This file has no rows.",
  ragged:
    "{{count}} rows had more cells than the header — kept as unnamed columns.",
  rows: "rows",
  selected: "{{count}} selected",
  showAll: "Show all {{count}} rows",
};

export interface CsvGridProps {
  className?: string;
  /** Opens the info bar — sheet tabs, mostly. */
  footerLeading?: ReactNode;
  labels?: Partial<CsvTableLabels>;
  matrix: CsvMatrix;
  /** Shown in the info bar as a warning: what is NOT on screen. */
  notice?: ReactNode;
  /** Absent or read-only: still selectable and copyable, never edited. */
  onChange?: (next: CsvMatrix) => void;
  readOnly?: boolean;
  /** A worksheet has no delimiter; a CSV's is worth naming. */
  showDelimiter?: boolean;
}

export function CsvGrid({
  className,
  footerLeading,
  labels,
  matrix,
  notice,
  onChange,
  readOnly,
  showDelimiter = true,
}: CsvGridProps) {
  const t = { ...DEFAULT_LABELS, ...labels };
  const [showAll, setShowAll] = useState(false);
  const [anchor, setAnchor] = useState<CsvCell | null>(null);
  const [focus, setFocus] = useState<CsvCell | null>(null);
  const [editing, setEditing] = useState<CsvCell | null>(null);
  const [draft, setDraft] = useState("");
  const dragging = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const editable = !readOnly && Boolean(onChange);
  const emit = useCallback((next: CsvMatrix) => onChange?.(next), [onChange]);

  const range = anchor && focus ? csvRange(anchor, focus) : null;
  const visibleRows = showAll ? matrix.rows : matrix.rows.slice(0, ROW_WINDOW);
  const hiddenCount = matrix.rows.length - visibleRows.length;

  // A drag that ends outside the table still ends: the mouseup lands on the
  // document, not on the cell the pointer started in.
  useEffect(() => {
    const stop = () => {
      dragging.current = false;
    };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

  const commitEdit = useCallback(() => {
    if (!editing) {
      return;
    }
    emit(
      editing.row === HEADER_ROW
        ? setCsvColumnName(matrix, editing.column, draft)
        : setCsvCell(matrix, editing.row, editing.column, draft)
    );
    setEditing(null);
  }, [draft, editing, emit, matrix]);

  const beginEdit = useCallback(
    (cell: CsvCell, seed?: string) => {
      if (!editable) {
        return;
      }
      const current =
        cell.row === HEADER_ROW
          ? (matrix.columns[cell.column] ?? "")
          : (matrix.rows[cell.row]?.[cell.column] ?? "");
      setDraft(seed ?? current);
      setEditing(cell);
    },
    [editable, matrix]
  );

  const selectCell = (cell: CsvCell, extend: boolean) => {
    if (editing) {
      commitEdit();
    }
    if (extend && anchor) {
      setFocus(cell);
      return;
    }
    setAnchor(cell);
    setFocus(cell);
  };

  const startSelection = (
    event: { preventDefault: () => void; shiftKey: boolean },
    from: CsvCell,
    to: CsvCell
  ) => {
    event.preventDefault();
    dragging.current = true;
    gridRef.current?.focus();
    if (editing) {
      commitEdit();
    }
    if (event.shiftKey && anchor) {
      setFocus(to);
      return;
    }
    setAnchor(from);
    setFocus(to);
  };

  const moveFocus = (
    rowDelta: number,
    columnDelta: number,
    extend: boolean
  ) => {
    const from = (extend ? focus : anchor) ?? { column: 0, row: 0 };
    const next: CsvCell = {
      column: Math.min(
        matrix.columns.length - 1,
        Math.max(0, from.column + columnDelta)
      ),
      row: Math.min(
        matrix.rows.length - 1,
        Math.max(HEADER_ROW, from.row + rowDelta)
      ),
    };
    if (extend) {
      setFocus(next);
      return;
    }
    setAnchor(next);
    setFocus(next);
  };

  /*
   * Clipboard through the NATIVE copy/cut/paste events, not through
   * `navigator.clipboard` on a Cmd-C keystroke.
   *
   * The async Clipboard API needs a permission for `readText` that the browser
   * may never grant and a secure context for `writeText`, and both fail by
   * returning a rejected promise — so the first cut of this looked exactly like
   * a grid whose copy did nothing. `event.clipboardData` inside a real clipboard
   * event needs no permission at all: the keystroke IS the user gesture.
   *
   * While a cell is being edited these belong to its input, which handles them
   * natively — so each one returns early rather than preventing the default.
   */
  const onGridCopy = (event: ReactClipboardEvent<HTMLDivElement>) => {
    if (editing || !range) {
      return;
    }
    event.clipboardData.setData("text/plain", csvRangeToText(matrix, range));
    event.preventDefault();
  };

  const onGridCut = (event: ReactClipboardEvent<HTMLDivElement>) => {
    if (editing || !range) {
      return;
    }
    event.clipboardData.setData("text/plain", csvRangeToText(matrix, range));
    event.preventDefault();
    // A cut from a read-only grid still COPIES — taking the text is not a write.
    if (editable) {
      emit(clearCsvRange(matrix, range));
    }
  };

  const onGridPaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
    if (editing || !(editable && anchor)) {
      return;
    }
    const block = parseCsvBlock(event.clipboardData.getData("text/plain"));
    event.preventDefault();
    if (block.length > 0) {
      emit(writeCsvBlock(matrix, anchor, block));
    }
  };

  const onGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (editing) {
      return;
    }
    const meta = event.metaKey || event.ctrlKey;
    if ((event.key === "Delete" || event.key === "Backspace") && editable) {
      if (range) {
        emit(clearCsvRange(matrix, range));
        event.preventDefault();
      }
      return;
    }
    const arrows: Record<string, [number, number]> = {
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
    };
    const delta = arrows[event.key];
    if (delta) {
      moveFocus(delta[0], delta[1], event.shiftKey);
      event.preventDefault();
      return;
    }
    if (event.key === "Tab") {
      moveFocus(0, event.shiftKey ? -1 : 1, false);
      event.preventDefault();
      return;
    }
    if (event.key === "Enter" && anchor) {
      beginEdit(anchor);
      event.preventDefault();
      return;
    }
    // Typing a printable character starts an edit with that character, the way
    // a spreadsheet does — no double-click needed to start over.
    if (
      editable &&
      anchor &&
      event.key.length === 1 &&
      !(meta || event.altKey)
    ) {
      beginEdit(anchor, event.key);
      event.preventDefault();
    }
  };

  const selectedClass = (cell: CsvCell) =>
    range && csvRangeContains(range, cell)
      ? "bg-primary/10 outline outline-1 -outline-offset-1 outline-primary/30"
      : "";

  if (matrix.columns.length === 0) {
    return (
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border",
          className
        )}
      >
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-muted-foreground text-sm">{t.empty}</p>
        </div>
        {footerLeading ? (
          <div className="flex flex-wrap items-center gap-2 border-t bg-paper-2 px-3 py-1.5 text-muted-foreground text-xs">
            {footerLeading}
          </div>
        ) : null}
      </div>
    );
  }

  const selectedCount = range
    ? (range.bottom - range.top + 1) * (range.right - range.left + 1)
    : 0;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border",
        className
      )}
    >
      {/* The table scrolls inside its own box and takes the height it is given:
          a wide sheet must never make the page scroll sideways, and a long one
          should use the window rather than a fixed strip of it. */}
      <div
        className="min-h-0 flex-1 overflow-auto outline-none"
        onCopy={onGridCopy}
        onCut={onGridCut}
        onKeyDown={onGridKeyDown}
        onPaste={onGridPaste}
        ref={gridRef}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the grid IS the keyboard target — arrows, Tab, copy and paste all land here, as they do in any spreadsheet.
        tabIndex={0}
      >
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead className="sticky top-0 z-10 bg-paper-2">
            <tr>
              <th className="w-10 border-b px-2 py-1.5 text-right font-normal text-muted-foreground text-xs">
                #
              </th>
              {matrix.columns.map((column, columnIndex) => {
                const cell = { column: columnIndex, row: HEADER_ROW };
                const isEditing =
                  editing?.row === HEADER_ROW && editing.column === columnIndex;
                return (
                  <th
                    className={cn(
                      "min-w-32 select-none border-b border-l text-left font-medium",
                      // While editing, the INPUT is the cell: the padding moves
                      // onto it so the text does not shift, and the selection
                      // tint stops painting a frame around a field that is
                      // already the whole cell.
                      isEditing ? "relative p-0" : "px-2 py-1.5",
                      isEditing ? "" : selectedClass(cell)
                    )}
                    // Column identity IS its position — two columns may share a
                    // name, and an edit must not re-key the header it renames.
                    key={`column-${String(columnIndex)}`}
                    onDoubleClick={() => beginEdit(cell)}
                    // A header click takes the whole column, as it does in a
                    // spreadsheet.
                    onMouseDown={(event) =>
                      startSelection(event, cell, {
                        column: columnIndex,
                        row: Math.max(0, matrix.rows.length - 1),
                      })
                    }
                    onMouseEnter={() => {
                      if (dragging.current) {
                        setFocus(cell);
                      }
                    }}
                  >
                    {isEditing ? (
                      <>
                        <span
                          aria-hidden
                          className="invisible block truncate px-2 py-1.5"
                        >
                          {column || " "}
                        </span>
                        <CellInput
                          className="px-2 font-medium"
                          onCancel={() => setEditing(null)}
                          onChange={setDraft}
                          onCommit={commitEdit}
                          value={draft}
                        />
                      </>
                    ) : (
                      <span className="block truncate">{column}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              // Row identity is its position too — a sheet row has no id, and
              // keying on content would remount a cell as it is typed in.
              <tr key={`row-${String(rowIndex)}`}>
                <td
                  className="w-10 select-none border-b px-2 py-1 text-right text-muted-foreground text-xs"
                  onMouseDown={(event) =>
                    startSelection(
                      event,
                      { column: 0, row: rowIndex },
                      { column: matrix.columns.length - 1, row: rowIndex }
                    )
                  }
                >
                  {rowIndex + 1}
                </td>
                {row.map((cellValue, columnIndex) => {
                  const cell = { column: columnIndex, row: rowIndex };
                  const isEditing =
                    editing?.row === rowIndex && editing.column === columnIndex;
                  return (
                    <td
                      className={cn(
                        "select-none border-b border-l align-top",
                        isEditing ? "relative p-0" : "px-2 py-1",
                        isEditing ? "" : selectedClass(cell)
                      )}
                      key={`cell-${String(columnIndex)}`}
                      onDoubleClick={() => beginEdit(cell)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        dragging.current = true;
                        gridRef.current?.focus();
                        selectCell(cell, event.shiftKey);
                      }}
                      onMouseEnter={() => {
                        if (dragging.current) {
                          setFocus(cell);
                        }
                      }}
                    >
                      {isEditing ? (
                        <>
                          {/* The value again, invisible, holding the cell open.
                              The input is absolute and contributes no height, so
                              a row whose TALLEST cell is the one being edited
                              would otherwise collapse the moment editing starts
                              — and it keeps the original height while typing,
                              rather than reflowing the table per keystroke. */}
                          <span
                            aria-hidden
                            className="invisible block whitespace-pre-wrap break-words px-2 py-1"
                          >
                            {cellValue || " "}
                          </span>
                          <CellInput
                            className="px-2"
                            onCancel={() => setEditing(null)}
                            onChange={setDraft}
                            onCommit={commitEdit}
                            value={draft}
                          />
                        </>
                      ) : (
                        <span className="block whitespace-pre-wrap break-words">
                          {cellValue}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The info bar: what the file IS, and what is not drawn. The window is a
          DOM budget, never a cap on what gets saved. */}
      <div className="flex flex-wrap items-center gap-2 border-t bg-paper-2 px-3 py-1.5 text-muted-foreground text-xs">
        {footerLeading}
        <span>
          {matrix.rows.length} {t.rows} · {matrix.columns.length} {t.columns}
        </span>
        {showDelimiter ? (
          <Badge variant="secondary">
            {DELIMITER_LABEL[matrix.delimiter] ?? matrix.delimiter}
          </Badge>
        ) : null}
        {selectedCount > 1 ? (
          <span>{t.selected.replace("{{count}}", String(selectedCount))}</span>
        ) : null}
        {matrix.raggedRows > 0 ? (
          <span className="text-amber-700 dark:text-amber-400">
            {t.ragged.replace("{{count}}", String(matrix.raggedRows))}
          </span>
        ) : null}
        {notice ? (
          <span className="text-amber-700 dark:text-amber-400">{notice}</span>
        ) : null}
        <span className="flex-1" />
        {hiddenCount > 0 ? (
          <Button
            className="h-6 px-2 text-xs"
            onClick={() => setShowAll(true)}
            size="sm"
            variant="ghost"
          >
            {t.showAll.replace("{{count}}", String(matrix.rows.length))}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The one cell being edited. Escape abandons, Enter and blur commit.
 *
 * It IS the cell: full width and height, with the cell's own padding passed in
 * so the text does not jump as the edit opens, and an INSET ring — an outset one
 * would spill over the borders it is meant to sit inside.
 */
function CellInput({
  className,
  onCancel,
  onChange,
  onCommit,
  value,
}: {
  className?: string;
  onCancel: () => void;
  onChange: (next: string) => void;
  onCommit: () => void;
  value: string;
}) {
  return (
    // The cell was just opened for editing — the caret belongs in it.
    <input
      autoFocus
      className={cn(
        "absolute inset-0 block h-full w-full bg-background text-sm outline-none ring-2 ring-primary ring-inset",
        className
      )}
      onBlur={onCommit}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onCommit();
          event.preventDefault();
        }
        if (event.key === "Escape") {
          onCancel();
          event.preventDefault();
        }
        // Arrows and Tab belong to the cell while typing, not to the grid.
        event.stopPropagation();
      }}
      value={value}
    />
  );
}
