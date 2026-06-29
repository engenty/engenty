import type { DragEvent } from "react";

export type SidebarListInsertPlace = "before" | "after";

export interface SidebarListInsertDropTarget {
  id: string;
  place: SidebarListInsertPlace;
}

export function computeSidebarListInsertPlace(
  clientY: number,
  rect: Pick<DOMRect, "top" | "height">
): SidebarListInsertPlace {
  return clientY < rect.top + rect.height / 2 ? "before" : "after";
}

export interface SidebarListInsertDropHandlersArgs {
  draggingId: string | null;
  dropTarget: SidebarListInsertDropTarget | null;
  onDragLeaveTarget: (id: string) => void;
  onDragOverRow: (id: string, place: SidebarListInsertPlace) => void;
  onDropRow: (
    sourceId: string,
    targetRowId: string,
    place: SidebarListInsertPlace
  ) => void;
  rowId: string;
}

export function attachSidebarListInsertDropHandlers(
  args: SidebarListInsertDropHandlersArgs
) {
  const {
    rowId,
    draggingId,
    dropTarget,
    onDragLeaveTarget,
    onDragOverRow,
    onDropRow,
  } = args;

  const showInsertBar =
    dropTarget?.id === rowId && draggingId !== null && draggingId !== rowId;

  return {
    showInsertBar,
    insertPlace: dropTarget?.id === rowId ? dropTarget.place : null,
    onDragLeave: (e: DragEvent<HTMLElement>) => {
      const next = e.relatedTarget;
      if (
        next instanceof Node &&
        e.currentTarget instanceof HTMLElement &&
        e.currentTarget.contains(next)
      ) {
        return;
      }
      onDragLeaveTarget(rowId);
    },
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!draggingId || draggingId === rowId) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = e.currentTarget.getBoundingClientRect();
      onDragOverRow(rowId, computeSidebarListInsertPlace(e.clientY, rect));
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (!draggingId) {
        return;
      }
      e.preventDefault();
      const sourceId = e.dataTransfer.getData("text/plain");
      if (!sourceId || sourceId === rowId) {
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      onDropRow(
        sourceId,
        rowId,
        computeSidebarListInsertPlace(e.clientY, rect)
      );
    },
  } as const;
}
