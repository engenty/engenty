"use client";

import {
  type EngentyA2uiAction,
  EngentyA2uiSurfaceView,
} from "@engenty/a2ui-catalog";
import { parseObjectRef, readA2uiRenderMeta } from "@engenty/ai-core/browser";
import { cn } from "@engenty/ui-core";
import { useCallback } from "react";
import { EngentyA2uiHostBoundary } from "../../../a2ui/engenty-a2ui-host.js";
import { useObjectDisplayIntent } from "../../../objects/object-display-intent.js";
import { useCopilotToolCallActions } from "../interrupts/copilot-tool-call-actions";
import type { ToolCallCardProps } from "./tool-call-card.types";
import { ToolCallCardBase } from "./tool-call-card-base";

/**
 * Chat card for declarative A2UI surfaces (`_meta.engenty.a2ui`, doc §5b):
 * replays the persisted v0.9 message list through the engenty-catalog
 * renderer. Actions land on seams that already exist — `open_object` promotes
 * the record through ObjectDisplayIntent, everything else goes back to the
 * agent as a user message over the AG-UI stream. The record cards, pickers
 * and documents inside come from the shared ai-ui host boundary.
 */

function actionFallbackMessage(action: EngentyA2uiAction): string {
  const readable = action.name.replace(/_/g, " ").trim();
  const context = Object.fromEntries(
    Object.entries(action.context).filter(([key]) => key !== "prompt")
  );
  return Object.keys(context).length > 0
    ? `${readable} (${JSON.stringify(context)})`
    : readable;
}

export function A2uiToolCallCard(props: ToolCallCardProps) {
  const { toolName: _toolName, ...cardProps } = props;
  const meta = readA2uiRenderMeta(props.output);
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

  if (!meta) {
    return (
      <ToolCallCardBase
        {...cardProps}
        details={["A2UI surface metadata was not available."]}
        headline={props.displayLabel ?? "UI surface"}
      />
    );
  }

  const surface = (
    <EngentyA2uiHostBoundary>
      <EngentyA2uiSurfaceView
        messages={meta.messages}
        onAction={handleAction}
        surfaceId={meta.surface_id}
      />
    </EngentyA2uiHostBoundary>
  );

  if ((props.state ?? "completed") === "completed") {
    return (
      <div
        className={cn(
          "my-1 w-full overflow-hidden rounded-lg bg-background p-1.5 shadow-sm ring-1 ring-border/60",
          props.className
        )}
      >
        {meta.title ? (
          <div className="px-2 pt-1 pb-0.5 font-medium text-muted-foreground text-xs">
            {meta.title}
          </div>
        ) : null}
        {surface}
      </div>
    );
  }

  return (
    <ToolCallCardBase
      {...cardProps}
      defaultOpen={props.defaultOpen ?? true}
      details={meta.title ? [meta.title] : []}
      headline={props.displayLabel ?? "Composing UI"}
    >
      <div className="overflow-hidden rounded-lg bg-background p-1.5 ring-1 ring-border/60">
        {surface}
      </div>
    </ToolCallCardBase>
  );
}
