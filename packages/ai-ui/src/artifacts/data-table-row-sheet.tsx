import type { TableColumn } from "@engenty/ai-core/browser";
import {
  SidePanel,
  SidePanelContent,
  SidePanelHeader,
  SidePanelTitle,
} from "@engenty/ui-core";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useState,
} from "react";
import { TableRowForm } from "./data-table-row-form.js";
import type {
  TableSheetDraft,
  TableWorkspaceRow,
} from "./table-workspace-model.js";

const WIDTH_STORAGE_KEY = "engenty.table-row-sheet.width";
const DEFAULT_WIDTH = 640;
const MIN_WIDTH = 400;

function readStoredWidth(): number {
  if (typeof window === "undefined") {
    return DEFAULT_WIDTH;
  }
  const saved = Number(window.localStorage.getItem(WIDTH_STORAGE_KEY));
  return Number.isFinite(saved) && saved >= MIN_WIDTH ? saved : DEFAULT_WIDTH;
}

function useRowSheetWidth() {
  const [width, setWidth] = useState(readStoredWidth);

  const startResize = useCallback((event: ReactPointerEvent) => {
    event.preventDefault();
    const onMove = (move: PointerEvent) => {
      const max = Math.round(window.innerWidth * 0.95);
      setWidth(
        Math.min(max, Math.max(MIN_WIDTH, window.innerWidth - move.clientX))
      );
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      setWidth((current) => {
        window.localStorage.setItem(WIDTH_STORAGE_KEY, String(current));
        return current;
      });
    };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  return { startResize, width };
}

export function TableRowSheet({
  columns,
  draft,
  error,
  onClose,
  onDelete,
  onSubmit,
  pending,
}: {
  columns: TableColumn[];
  draft: TableSheetDraft | null;
  error: string | null;
  onClose: () => void;
  onDelete: (row: TableWorkspaceRow) => void;
  onSubmit: (values: Record<string, unknown>) => void;
  pending: boolean;
}) {
  const row = draft?.kind === "edit" ? draft.row : null;
  const { startResize, width } = useRowSheetWidth();
  return (
    <SidePanel
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={draft !== null}
    >
      <SidePanelContent
        className="flex h-full w-full flex-col gap-0 p-0 [transition-property:transform,opacity] sm:max-w-none"
        style={{ maxWidth: "95vw", width }}
      >
        <button
          aria-label="Resize panel"
          className="absolute inset-y-0 left-0 z-50 w-1.5 cursor-col-resize transition-colors hover:bg-primary/40 active:bg-primary/60"
          onPointerDown={startResize}
          type="button"
        />
        <SidePanelHeader className="border-b px-6 py-4">
          <SidePanelTitle>
            {draft?.kind === "create" ? "New record" : "Record"}
          </SidePanelTitle>
        </SidePanelHeader>
        {draft ? (
          <TableRowForm
            columns={columns}
            error={error}
            onCancel={onClose}
            onDelete={
              row
                ? () => {
                    onDelete(row);
                  }
                : undefined
            }
            onSubmit={onSubmit}
            pending={pending}
            row={row}
          />
        ) : null}
      </SidePanelContent>
    </SidePanel>
  );
}
