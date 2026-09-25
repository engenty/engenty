"use client";

import { parseObjectRef, readA2uiRenderMeta } from "@engenty/ai-core/browser";
import {
  type EngentyA2uiAction,
  EngentyA2uiSurfaceView,
} from "@engenty/generative-a2ui";
import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { FileText, Link2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { EngentyA2uiHostBoundary } from "../../../a2ui/engenty-a2ui-host.js";
import { useOptionalAgentHost } from "../../../agent-provider/engenty-agent.js";
import { ENGENTY_COPILOT_HOST_KEY } from "../../../agent-provider/host-keys.js";
import { activateArtifact } from "../../../artifacts/artifact-store.js";
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

/**
 * The server writes an artifact teaser without knowing the reader's language;
 * its Open button is relabelled here, in the language the chat is read in.
 */
function withOpenLabel(messages: unknown[], label: string): unknown[] {
  return messages.map((message) => {
    const update = (message as { updateComponents?: { components?: unknown } })
      .updateComponents;
    if (!(update && Array.isArray(update.components))) {
      return message;
    }
    return {
      ...(message as Record<string, unknown>),
      updateComponents: {
        ...update,
        components: update.components.map((component) => {
          const c = component as {
            action?: { event?: { name?: unknown } };
            component?: unknown;
          };
          return c.component === "Button" &&
            c.action?.event?.name === "open_artifact"
            ? { ...c, label }
            : component;
        }),
      },
    };
  });
}

/**
 * The line above a surface bubble. A teaser of a stored artifact reads as a
 * document — its icon before the title, a link on hover — and opens it in the
 * side pane.
 */
function SurfaceTitleLine(props: {
  artifactId: string | null;
  hostKey: string;
  title: string;
}) {
  const { artifactId, hostKey, title } = props;
  if (!artifactId) {
    return (
      <div className="px-3.5 pb-1 font-medium text-primary text-xs">
        {title}
      </div>
    );
  }
  return (
    <button
      className="group flex items-center gap-1.5 px-3.5 pb-1 font-medium text-primary text-xs"
      onClick={() => activateArtifact(hostKey, artifactId)}
      type="button"
    >
      <FileText aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{title}</span>
      <Link2
        aria-hidden
        className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  );
}

export function A2uiToolCallCard(props: ToolCallCardProps) {
  const { toolName: _toolName, ...cardProps } = props;
  const { t } = useTranslation("ai-ui");
  const meta = readA2uiRenderMeta(props.output);
  const openLabel = t("agentMessage.openArtifact");
  const messages = useMemo(
    () =>
      meta?.artifact_id
        ? withOpenLabel(meta.messages, openLabel)
        : (meta?.messages ?? []),
    [meta?.artifact_id, meta?.messages, openLabel]
  );
  const { openInPanel, openLiveSurface } = useObjectDisplayIntent();
  const { submitMessage } = useCopilotToolCallActions();
  // The pane of the host this transcript belongs to — a desk opens its own.
  const hostKey = useOptionalAgentHost()?.hostKey ?? ENGENTY_COPILOT_HOST_KEY;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const liveKey = meta?.live ? meta.surface_id : null;

  useEffect(() => {
    const current = metaRef.current;
    if (
      current?.live &&
      openLiveSurface &&
      (props.state ?? "completed") === "completed"
    ) {
      openLiveSurface(current);
    }
  }, [liveKey, openLiveSurface, props.state]);

  const handleAction = useCallback(
    (action: EngentyA2uiAction) => {
      // The teaser in the chat, the whole asset in the pane beside it.
      if (action.name === "open_artifact") {
        const artifactId = action.context.artifact_id;
        if (typeof artifactId === "string" && artifactId.trim()) {
          activateArtifact(hostKey, artifactId.trim());
          return;
        }
      }
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
    [hostKey, openInPanel, submitMessage]
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
        messages={messages as typeof meta.messages}
        onAction={handleAction}
        surfaceId={meta.surface_id}
      />
    </EngentyA2uiHostBoundary>
  );

  if ((props.state ?? "completed") === "completed") {
    return (
      // The surface IS the message bubble — a card, shaped like a reply — with
      // its title above it, where a sender's name sits.
      <div className={cn("my-1 w-full", props.className)}>
        {meta.title ? (
          <SurfaceTitleLine
            artifactId={meta.artifact_id ?? null}
            hostKey={hostKey}
            title={meta.title}
          />
        ) : null}
        <div className="ui-card-panel overflow-hidden rounded-2xl px-3.5 py-2.5">
          {surface}
        </div>
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
