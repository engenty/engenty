/**
 * The connections module's one connect dialog, for the agent desk and the
 * Copilot pane. ai-ui cannot import the module (cycle), so the dialog is
 * looked up on `globalThis` under a shared Symbol; until the module has
 * registered it, nothing renders.
 */

import { type ComponentType, type ReactNode, useEffect, useState } from "react";

const EXTENSIONS_DIALOG_KEY = Symbol.for(
  "engenty.connections.extensions-dialog"
);
const EXTENSIONS_DIALOG_READY = "engenty-extensions-dialog";

/** Structural copy of the module's ExtensionsDialogProps. */
export interface ExtensionsDialogSlotProps {
  agentId?: string | null;
  initialDetailsId?: string | null;
  initialTab?: "plugins" | "skills";
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** A Space's accounts, or the viewer's own (`"me"`). */
  owner: { spaceId: string } | "me";
  renderSkills?: (slot: {
    detailsId: string | null;
    onClose: () => void;
    setDetailsId: (id: string | null) => void;
  }) => ReactNode;
}

function readExtensionsDialog() {
  const g = globalThis as Record<symbol, unknown>;
  return g[EXTENSIONS_DIALOG_KEY] as
    | ComponentType<ExtensionsDialogSlotProps>
    | undefined;
}

export function ExtensionsDialogSlot(props: ExtensionsDialogSlotProps) {
  const [Dialog, setDialog] = useState(readExtensionsDialog);

  useEffect(() => {
    if (Dialog) {
      return;
    }
    const onReady = () => {
      const next = readExtensionsDialog();
      if (next) {
        setDialog(() => next);
      }
    };
    onReady();
    globalThis.addEventListener(EXTENSIONS_DIALOG_READY, onReady);
    return () =>
      globalThis.removeEventListener(EXTENSIONS_DIALOG_READY, onReady);
  }, [Dialog]);

  return Dialog ? <Dialog {...props} /> : null;
}
