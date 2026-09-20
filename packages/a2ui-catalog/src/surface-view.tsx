"use client";

import { A2uiSurface } from "@a2ui/react/v0_9";
import { MessageProcessor } from "@a2ui/web_core/v0_9";
import { type RefObject, useCallback, useMemo, useRef, useState } from "react";
import { createEngentyA2uiCatalog } from "./catalog.js";
import {
  type RequiredFieldState,
  SurfaceFormContext,
  type SurfaceFormContextValue,
} from "./form-context.js";

/**
 * Self-contained A2UI surface renderer: feed it the persisted v0.9 message
 * list and it builds a processor over the engenty catalog, processes the
 * messages, and renders the surface. Replay-safe by construction — the same
 * messages rebuild the same surface (doc §5b "Carriage in our stack").
 *
 * Deliberately the ONLY seam through which @a2ui/* types flow: the public
 * props are plain JSON + plain callbacks, so renderer/spec churn stays inside
 * this package (doc §5 risk note).
 *
 * Two dispatch modes. Without `onSubmit` every action reaches `onAction`
 * (chat cards). With `onSubmit` the surface is a step: every action except
 * `open_object` is a submit and carries the whole data model — the inputs
 * wrote into it through their bindings — under the action's event name;
 * `open_object` still reaches `onAction`. A submit with an empty required
 * input is held back and the offending inputs show an error.
 */

export interface EngentyA2uiAction {
  context: Record<string, unknown>;
  name: string;
  sourceComponentId: string;
  surfaceId: string;
}

export interface EngentyA2uiSurfaceViewProps {
  /**
   * Values merged into the data model (shallow, per top-level key) after the
   * messages are processed — a previous answer to prefill. Compared by
   * content, so a new object with the same keys does not rebuild the surface.
   */
  initialData?: Record<string, unknown>;
  /** Ordered A2UI v0.9 wire messages (createSurface → updateComponents → …). */
  messages: Record<string, unknown>[];
  onAction?: (action: EngentyA2uiAction) => void;
  /** Step mode: receives the event name and the data model of every submit. */
  onSubmit?: (event: string, data: Record<string, unknown>) => void;
  /** Inputs render disabled. */
  readOnly?: boolean;
  surfaceId: string;
}

const OPEN_OBJECT = "open_object";
const NO_ERRORS: ReadonlySet<string> = new Set();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/** RFC 6901 escaping for one top-level key. */
function pointerFor(key: string): string {
  return `/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
}

export function EngentyA2uiSurfaceView({
  initialData,
  messages,
  onAction,
  onSubmit,
  readOnly = false,
  surfaceId,
}: EngentyA2uiSurfaceViewProps) {
  // Latest handlers without rebuilding the processor (and thus the surface).
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  // Required-field registry: component id → live { required, empty }.
  const fieldsRef = useRef(new Map<string, RefObject<RequiredFieldState>>());
  const [requiredErrors, setRequiredErrors] =
    useState<ReadonlySet<string>>(NO_ERRORS);

  const register = useCallback(
    (componentId: string, state: RefObject<RequiredFieldState>) => {
      fieldsRef.current.set(componentId, state);
      return () => {
        fieldsRef.current.delete(componentId);
      };
    },
    []
  );

  const initialKey = JSON.stringify(initialData ?? null);
  // Compared by content: a host that re-reads the same step (a refetch, a
  // parent re-render) must not rebuild the surface, because rebuilding wipes
  // the data model the inputs have been writing into.
  const messagesKey = JSON.stringify(messages);

  const surface = useMemo(() => {
    const wire = JSON.parse(messagesKey) as Record<string, unknown>[];
    const processor = new MessageProcessor(
      [createEngentyA2uiCatalog()],
      (action) => {
        const plain: EngentyA2uiAction = {
          context:
            action.context && typeof action.context === "object"
              ? (action.context as Record<string, unknown>)
              : {},
          name: action.name,
          sourceComponentId: action.sourceComponentId,
          surfaceId: action.surfaceId,
        };
        const submit = onSubmitRef.current;
        if (!submit || plain.name === OPEN_OBJECT) {
          onActionRef.current?.(plain);
          return;
        }
        const missing: string[] = [];
        for (const [componentId, state] of fieldsRef.current) {
          if (state.current.required && state.current.empty) {
            missing.push(componentId);
          }
        }
        if (missing.length > 0) {
          setRequiredErrors(new Set(missing));
          return;
        }
        setRequiredErrors(NO_ERRORS);
        const model = processor.model
          .getSurface(plain.surfaceId)
          ?.dataModel.get("/");
        submit(plain.name, isRecord(model) ? structuredClone(model) : {});
      }
    );
    try {
      // Opaque wire payload — validated agent-side before persistence.
      processor.processMessages(
        wire as unknown as Parameters<(typeof processor)["processMessages"]>[0]
      );
    } catch {
      return null;
    }
    const built = processor.model.getSurface(surfaceId) ?? null;
    const prefill: unknown = JSON.parse(initialKey);
    if (built && isRecord(prefill)) {
      for (const [key, value] of Object.entries(prefill)) {
        built.dataModel.set(pointerFor(key), value);
      }
    }
    return built;
  }, [messagesKey, surfaceId, initialKey]);

  const formContext = useMemo<SurfaceFormContextValue>(
    () => ({ readOnly, register, requiredErrors }),
    [readOnly, register, requiredErrors]
  );

  if (!surface) {
    return null;
  }
  return (
    <SurfaceFormContext.Provider value={formContext}>
      <A2uiSurface surface={surface} />
    </SurfaceFormContext.Provider>
  );
}
