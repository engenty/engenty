"use client";

import type { ObjectRef } from "@engenty/ai-core/browser";
import { useObjectDisplayIntent } from "../../../objects/object-display-intent.js";
import { useObjectWidgets } from "../../../objects/object-widget-registry.js";
import type { ContextBoxItem } from "./context-box-view.js";
import { iconForObjectRef } from "./thread-context-icons.js";

export interface ContextObjectItem {
  href?: string | null;
  key: string;
  ref: ObjectRef;
  title: string;
}

/** Shared object-row behavior for transcript and durable domain contexts. */
export function useContextObjectItems(
  objects: readonly ContextObjectItem[],
  options?: {
    openInPanel?: (
      ref: ObjectRef,
      opts?: { expanded?: boolean; title?: string }
    ) => void;
  }
): ContextBoxItem[] {
  const displayIntent = useObjectDisplayIntent();
  const openInPanel = options?.openInPanel ?? displayIntent.openInPanel;
  const widgets = useObjectWidgets();

  return objects.map((item) => {
    const widget = widgets.find(
      (entry) =>
        entry.module === item.ref.module && entry.entity === item.ref.entity
    );
    const href = item.href ?? widget?.getHref?.(item.ref) ?? null;
    return {
      ...(openInPanel
        ? {
            onClick: () => openInPanel(item.ref, { title: item.title }),
          }
        : href
          ? { href }
          : {}),
      icon: iconForObjectRef(item.ref),
      key: item.key,
      label: item.title,
    };
  });
}
