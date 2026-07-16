"use client";

import {
  type ObjectDisplayItem,
  type ObjectRef,
  objectRefTypeKey,
} from "@engenty/ai-core/browser";
import type { ComponentType } from "react";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Registry of module-provided object widgets, keyed by `module:entity`.
 * Modules register from their plugin init (like `registerToolCallUi`); chat
 * surfaces resolve by ref type. Objects render by REFERENCE — widgets fetch
 * live data client-side as the viewing user, so module authz applies
 * naturally and cards never go stale. Unresolved types fall back to the
 * generic snapshot card, which is the not-installed / not-loaded safety net.
 */

export interface ObjectWidgetCardProps {
  /** Snapshot items by canonical ref string — fallback data only. */
  items?: ObjectDisplayItem[];
  onOpenInPanel?: (ref: ObjectRef) => void;
  provenance?: { total?: number; query?: string };
  /** 1 ref = single card, n refs = list rendering. */
  refs: ObjectRef[];
}

export interface ObjectWidgetPanelProps {
  /** Snapshot fallback for skeleton/header rendering. */
  item?: ObjectDisplayItem;
  objectRef: ObjectRef;
}

export interface ObjectWidgetRegistration {
  /** Inline chat card — required. Renders single card or list. */
  card: ComponentType<ObjectWidgetCardProps>;
  entity: string;
  /** Deep link into the module route ("open full page"). */
  getHref?: (ref: ObjectRef) => string | null;
  /** Registry id, conventionally `${module}.${entity}`. */
  id: string;
  /**
   * Reverse mapping for link-chip upgrades: return the ref for an app
   * pathname this module owns (e.g. `/mdl/offers/<id>`), else null.
   */
  matchHref?: (pathname: string) => ObjectRef | null;
  module: string;
  order?: number;
  /** Side-panel / expanded renderer; falls back to `card` when absent. */
  panel?: ComponentType<ObjectWidgetPanelProps>;
}

const registrations = new Map<string, ObjectWidgetRegistration>();
const listeners = new Set<() => void>();
// Referentially-stable snapshot for useSyncExternalStore.
let snapshot: readonly ObjectWidgetRegistration[] | null = null;

function emit() {
  snapshot = null;
  for (const listener of listeners) {
    listener();
  }
}

export function registerObjectWidget(
  reg: ObjectWidgetRegistration
): () => void {
  registrations.set(objectRefTypeKey(reg), reg);
  emit();
  return () => {
    registrations.delete(objectRefTypeKey(reg));
    emit();
  };
}

export function clearObjectWidgetsForTests() {
  registrations.clear();
  emit();
}

export function resolveObjectWidget(
  ref: Pick<ObjectRef, "module" | "entity">
): ObjectWidgetRegistration | null {
  return registrations.get(objectRefTypeKey(ref)) ?? null;
}

export function listObjectWidgets(): readonly ObjectWidgetRegistration[] {
  if (!snapshot) {
    snapshot = [...registrations.values()].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );
  }
  return snapshot;
}

export function subscribeObjectWidgetRegistry(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Reactive resolution — modules register lazily at plugin-init time, which can
 * land after chat has rendered; late registration re-renders consumers.
 */
export function useObjectWidget(
  ref: Pick<ObjectRef, "module" | "entity"> | null
): ObjectWidgetRegistration | null {
  const getSnapshot = useCallback(
    () => (ref ? resolveObjectWidget(ref) : null),
    [ref?.module, ref?.entity]
  );
  return useSyncExternalStore(
    subscribeObjectWidgetRegistry,
    getSnapshot,
    getSnapshot
  );
}

/** Reactive full-list variant (link-chip matching sweeps all registrations). */
export function useObjectWidgets(): readonly ObjectWidgetRegistration[] {
  return useSyncExternalStore(
    subscribeObjectWidgetRegistry,
    listObjectWidgets,
    listObjectWidgets
  );
}
