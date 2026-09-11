// The Action, opened from a card: a large modal around the Action editor.
//
// The same editor the Action page renders — toolbar, canvas, rails, code view
// and the composer at the bottom. The modal adds only what a dialog owes its
// reader: the Action's name, and a place for the primary action, which is the
// human gate on tenant-authored automation and must never be out of reach.
import { Dialog, DialogContent, DialogTitle } from "@engenty/ui-core";
import { type ReactNode, useState } from "react";
import { WorkflowEditor } from "./workflow-editor.js";
import { useWorkflowQuery } from "./workflow-queries.js";

export interface WorkflowModalProps {
  graphId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function WorkflowModal({
  graphId,
  onOpenChange,
  open,
}: WorkflowModalProps) {
  const detail = useWorkflowQuery(graphId);
  const graphRow = detail.data?.graph ?? null;
  const [primaryAction, setPrimaryAction] = useState<ReactNode>(null);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex h-[86vh] max-w-[calc(100%-2rem)] flex-col gap-3 p-4 sm:max-w-[min(96vw,1200px)]">
        <div className="flex shrink-0 items-center gap-2 pr-8">
          <DialogTitle className="truncate font-semibold text-base">
            {graphRow?.title ?? graphRow?.name ?? "…"}
          </DialogTitle>
          <div className="ml-auto flex items-center gap-2">{primaryAction}</div>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border">
          <WorkflowEditor
            graphId={graphId}
            onPrimaryAction={setPrimaryAction}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
