"use client";

import { A2uiSurface } from "@a2ui/react/v0_9";
import { MessageProcessor } from "@a2ui/web_core/v0_9";
import { useMemo, useRef } from "react";
import { createEngentyA2uiCatalog } from "./catalog.js";

/**
 * Self-contained A2UI surface renderer: feed it the persisted v0.9 message
 * list and it builds a processor over the engenty catalog, processes the
 * messages, and renders the surface. Replay-safe by construction — the same
 * messages rebuild the same surface (doc §5b "Carriage in our stack").
 *
 * Deliberately the ONLY seam through which @a2ui/* types flow: the public
 * props are plain JSON + a plain action callback, so renderer/spec churn
 * stays inside this package (doc §5 risk note).
 */

export interface EngentyA2uiAction {
  context: Record<string, unknown>;
  name: string;
  sourceComponentId: string;
  surfaceId: string;
}

export interface EngentyA2uiSurfaceViewProps {
  /** Ordered A2UI v0.9 wire messages (createSurface → updateComponents → …). */
  messages: Record<string, unknown>[];
  onAction?: (action: EngentyA2uiAction) => void;
  surfaceId: string;
}

export function EngentyA2uiSurfaceView({
  messages,
  onAction,
  surfaceId,
}: EngentyA2uiSurfaceViewProps) {
  // Latest handler without rebuilding the processor (and thus the surface).
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const surface = useMemo(() => {
    const processor = new MessageProcessor(
      [createEngentyA2uiCatalog()],
      (action) => {
        onActionRef.current?.({
          context:
            action.context && typeof action.context === "object"
              ? (action.context as Record<string, unknown>)
              : {},
          name: action.name,
          sourceComponentId: action.sourceComponentId,
          surfaceId: action.surfaceId,
        });
      }
    );
    try {
      // Opaque wire payload — validated agent-side before persistence.
      processor.processMessages(
        messages as unknown as Parameters<
          (typeof processor)["processMessages"]
        >[0]
      );
    } catch {
      return null;
    }
    return processor.model.getSurface(surfaceId) ?? null;
  }, [messages, surfaceId]);

  if (!surface) {
    return null;
  }
  return <A2uiSurface surface={surface} />;
}
