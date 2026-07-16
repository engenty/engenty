"use client";

import {
  type ObjectDisplayItem,
  type ObjectRef,
  objectRefTypeKey,
  parseObjectRef,
  readObjectRenderMeta,
} from "@engenty/ai-core/browser";
import { useMemo } from "react";
import type { ToolCallCardProps } from "../components/copilot/tool-call/tool-call-card.types";
import { ToolCallCardBase } from "../components/copilot/tool-call/tool-call-card-base";
import { ObjectFallbackCard } from "./object-fallback-card";
import { useObjectDisplayIntent } from "./object-display-intent";
import { useObjectWidgets } from "./object-widget-registry";

/**
 * Generic inline card for `show_objects` (and any tool output carrying
 * `_meta.engenty.object_render`). Groups refs by `module:entity`, renders the
 * module's registered widget per group, and falls back to the snapshot card
 * for unregistered types. Registered as `core.object-render` in
 * tool-call-ui-defaults.
 */

interface RefGroup {
  typeKey: string;
  refs: ObjectRef[];
  items: ObjectDisplayItem[];
}

function groupRefs(
  refs: string[],
  items: ObjectDisplayItem[]
): { groups: RefGroup[]; invalid: string[] } {
  const itemByRef = new Map(items.map((item) => [item.ref, item] as const));
  const groups: RefGroup[] = [];
  const byKey = new Map<string, RefGroup>();
  const invalid: string[] = [];
  for (const raw of refs) {
    const ref = parseObjectRef(raw);
    if (!ref) {
      invalid.push(raw);
      continue;
    }
    const typeKey = objectRefTypeKey(ref);
    let group = byKey.get(typeKey);
    if (!group) {
      group = { typeKey, refs: [], items: [] };
      byKey.set(typeKey, group);
      groups.push(group);
    }
    group.refs.push(ref);
    const item = itemByRef.get(raw);
    if (item) {
      group.items.push(item);
    }
  }
  return { groups, invalid };
}

export function ObjectRenderToolCallCard(props: ToolCallCardProps) {
  const { toolName: _toolName, ...cardProps } = props;
  const meta = readObjectRenderMeta(props.output);
  // Subscribe so late plugin registration upgrades fallback → native card.
  useObjectWidgets();
  const { openInPanel } = useObjectDisplayIntent();

  const grouped = useMemo(
    () => (meta ? groupRefs(meta.refs, meta.items) : null),
    [meta]
  );

  if (!(meta && grouped) || (props.state ?? "completed") !== "completed") {
    const details = meta
      ? [
          `${meta.refs.length} object${meta.refs.length === 1 ? "" : "s"}`,
          ...(meta.provenance?.query ? [`Query: ${meta.provenance.query}`] : []),
        ]
      : ["Object display data was not available."];
    return (
      <ToolCallCardBase
        {...cardProps}
        details={details}
        headline={props.displayLabel ?? "Showing objects"}
        metadata={props.metadata}
      />
    );
  }

  return (
    <div className="my-1 flex w-full flex-col gap-2">
      {grouped.groups.map((group) => (
        <ObjectRefGroup
          group={group}
          key={group.typeKey}
          onOpenInPanel={openInPanel}
          provenance={meta.provenance}
        />
      ))}
      {grouped.invalid.length > 0 || (meta.dropped?.length ?? 0) > 0 ? (
        <div className="text-muted-foreground text-xs">
          {grouped.invalid.length > 0
            ? `${grouped.invalid.length} reference${grouped.invalid.length === 1 ? "" : "s"} could not be parsed. `
            : null}
          {(meta.dropped?.length ?? 0) > 0
            ? `${meta.dropped?.length} not shown (no access).`
            : null}
        </div>
      ) : null}
    </div>
  );
}

function ObjectRefGroup({
  group,
  provenance,
  onOpenInPanel,
}: {
  group: RefGroup;
  provenance?: { total?: number; query?: string };
  onOpenInPanel?: (ref: ObjectRef) => void;
}) {
  // Resolve inside the group component so a single unknown type degrades to
  // its own fallback without affecting sibling groups.
  const widgets = useObjectWidgets();
  const widget =
    widgets.find((reg) => objectRefTypeKey(reg) === group.typeKey) ?? null;

  if (!widget) {
    return <ObjectFallbackCard items={group.items} refs={group.refs} />;
  }
  const Card = widget.card;
  return (
    <Card
      items={group.items}
      onOpenInPanel={onOpenInPanel}
      provenance={provenance}
      refs={group.refs}
    />
  );
}

export function objectRenderToolCallMatch(ctx: {
  output?: unknown;
  toolName: string;
  resolvedToolName?: string;
}): boolean {
  return (
    ctx.toolName === "show_objects" ||
    ctx.resolvedToolName === "show_objects" ||
    readObjectRenderMeta(ctx.output) !== null
  );
}
