"use client";

import { parseObjectRef } from "@engenty/ai-core/browser";
import {
  type EngentyA2uiAction,
  EngentyA2uiSurfaceView,
} from "@engenty/generative-a2ui";
import { useCallback } from "react";
import type { A2uiSurfacePaneTab } from "../artifacts/artifact-store.js";
import { useCopilotToolCallActions } from "../components/copilot/interrupts/copilot-tool-call-actions";
import { useObjectDisplayIntent } from "../objects/object-display-intent.js";
import { EngentyA2uiHostBoundary } from "./engenty-a2ui-host.js";

function actionFallbackMessage(action: EngentyA2uiAction): string {
  const readable = action.name.replace(/_/g, " ").trim();
  const context = Object.fromEntries(
    Object.entries(action.context).filter(([key]) => key !== "prompt")
  );
  return Object.keys(context).length > 0
    ? `${readable} (${JSON.stringify(context)})`
    : readable;
}

/** Live A2UI spec in the workspace end-pane — same catalog as the chat card. */
export function A2uiSurfacePaneBody({ tab }: { tab: A2uiSurfacePaneTab }) {
  const { openInPanel } = useObjectDisplayIntent();
  const { submitMessage } = useCopilotToolCallActions();
  const handleAction = useCallback(
    (action: EngentyA2uiAction) => {
      if (action.name === "open_object") {
        const refValue = action.context.ref;
        const ref =
          typeof refValue === "string" ? parseObjectRef(refValue) : null;
        if (ref && openInPanel) {
          openInPanel(ref);
          return;
        }
      }
      const prompt =
        typeof action.context.prompt === "string" &&
        action.context.prompt.trim()
          ? action.context.prompt
          : actionFallbackMessage(action);
      submitMessage?.(prompt);
    },
    [openInPanel, submitMessage]
  );
  return (
    <div className="min-h-0 flex-1 overflow-auto p-2">
      <EngentyA2uiHostBoundary>
        <EngentyA2uiSurfaceView
          messages={tab.messages}
          onAction={handleAction}
          surfaceId={tab.surfaceId}
        />
      </EngentyA2uiHostBoundary>
    </div>
  );
}
