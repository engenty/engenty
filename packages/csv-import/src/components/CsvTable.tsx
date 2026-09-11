/**
 * A CSV file, shown as a table and worked like one.
 *
 * The grid itself is `CsvGrid`; this is the text end of it. Reads and writes
 * through this package's own parser, so what is drawn is the same cells the
 * import wizard would read from the same bytes.
 *
 * Controlled on TEXT: `value` is the file, `onChange` gets the file back. Every
 * edit re-serializes, so what is on screen is what will be saved, quoting
 * included.
 */
import { useCallback, useMemo } from "react";
import {
  type CsvMatrix,
  parseCsvMatrix,
  serializeCsvMatrix,
} from "../csv-matrix.js";
import { CsvGrid, type CsvTableLabels } from "./CsvGrid.jsx";

export interface CsvTableProps {
  className?: string;
  labels?: Partial<CsvTableLabels>;
  /** Absent or read-only: still selectable and copyable, never edited. */
  onChange?: (next: string) => void;
  readOnly?: boolean;
  value: string;
}

export function CsvTable({
  className,
  labels,
  onChange,
  readOnly,
  value,
}: CsvTableProps) {
  const matrix = useMemo(() => parseCsvMatrix(value), [value]);
  const emit = useCallback(
    (next: CsvMatrix) => onChange?.(serializeCsvMatrix(next)),
    [onChange]
  );

  return (
    <CsvGrid
      className={className}
      labels={labels}
      matrix={matrix}
      onChange={onChange ? emit : undefined}
      readOnly={readOnly}
    />
  );
}
