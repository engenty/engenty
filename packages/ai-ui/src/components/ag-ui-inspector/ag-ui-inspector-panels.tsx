"use client";

import type { AGUIEvent } from "@engenty/ag-ui-bridge";
import { Badge, Button, cn, ScrollArea, Separator } from "@engenty/ui-core";
import { AnimatedCheckIcon, AnimatedCopyIcon } from "@engenty/ui-icons";
import { ChevronDown, ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { EngentyAgUiMessage } from "../../ag-ui/conversation.js";
import {
  agUiEventType,
  formatDisplayText,
  formatToolParameters,
  resolveToolDisplayStatus,
  timelineEventClassName,
  timelineMessageClassName,
  toolStatusClassName,
  toolStatusLabel,
  truncateInline,
} from "./ag-ui-inspector-chrome.js";
import {
  coerceJsonValue,
  InspectorJsonTree,
} from "./ag-ui-inspector-json-tree.js";
import {
  buildToolCallNameIndex,
  eventFullText,
  eventIdentifiers,
  eventSummary,
  foldStreamedDeltas,
  formatJson,
  type InspectorInitialPrompt,
  type InspectorToolCall,
  messagePreview,
} from "./ag-ui-inspector-model.js";

interface TimelineRow {
  count: number;
  detail: string;
  /** Complete payload — what expanding and copying show. */
  full: string;
  id: string;
  /** messageId / toolCallId / runId, shown muted only when expanded. */
  identifiers: string | null;
  label: string;
  tone: "divider" | "event" | "message";
}

function compactTimelineRows(rows: TimelineRow[]): TimelineRow[] {
  return rows.reduce<TimelineRow[]>((out, row) => {
    const previous = out.at(-1);
    if (
      previous &&
      previous.label === row.label &&
      previous.detail === row.detail &&
      previous.tone === row.tone
    ) {
      previous.count += row.count;
      return out;
    }

    out.push({ ...row });
    return out;
  }, []);
}

function buildTimelineRows(input: {
  events: readonly AGUIEvent[];
  messages: readonly EngentyAgUiMessage[];
}): TimelineRow[] {
  const messageRows = input.messages.map(
    (message): TimelineRow => ({
      count: 1,
      detail: messagePreview(message),
      full: messagePreview(message),
      id: `message-${message.id}`,
      identifiers: message.id ? `message ${message.id}` : null,
      label: message.role,
      tone: "message",
    })
  );
  const toolCallNames = buildToolCallNameIndex(input.events);
  // Fold BEFORE reversing: runs are adjacent in arrival order, and newest-first
  // would otherwise assemble every streamed value backwards.
  const folded = foldStreamedDeltas(input.events);
  const eventRows = folded
    .slice()
    .reverse()
    .map(({ chunks, event }, index): TimelineRow => {
      const label = agUiEventType(event);
      return {
        count: chunks,
        detail: eventSummary(event, toolCallNames),
        full: eventFullText(event),
        id: `event-${folded.length - index}-${label}`,
        identifiers: eventIdentifiers(event),
        label,
        tone: "event",
      };
    });
  if (messageRows.length === 0 || eventRows.length === 0) {
    return compactTimelineRows([...messageRows, ...eventRows]);
  }
  // The two halves run in OPPOSITE directions and used to sit in one unbroken
  // list, which reads as a thread that lost its ordering (or replayed itself).
  // Messages are a conversation, so oldest-first; raw events are a live tail, so
  // newest-first — both are right, and the seam between them has to say so.
  return compactTimelineRows([
    ...messageRows,
    {
      count: 1,
      detail: "newest first ↑ — the conversation above runs oldest first",
      full: "",
      id: "divider-events",
      identifiers: null,
      label: "raw events",
      tone: "divider",
    },
    ...eventRows,
  ]);
}

function copyText(value: string) {
  void navigator.clipboard?.writeText(value);
}

function CopyButton({
  reveal = "hover",
  value,
}: {
  reveal?: "always" | "hover";
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      className={cn(
        "h-6 gap-1 px-1.5",
        reveal === "hover" &&
          "opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
      )}
      onClick={() => {
        copyText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
      size="sm"
      type="button"
      variant="ghost"
    >
      {copied ? (
        <AnimatedCheckIcon size={12} />
      ) : (
        <AnimatedCopyIcon size={12} />
      )}
      <span className="text-[11px]">{copied ? "Copied" : "Copy"}</span>
    </Button>
  );
}

function PanelEmpty({ children }: { children: string }) {
  return (
    <div className="flex h-48 items-center justify-center p-6 text-center text-muted-foreground text-sm">
      {children}
    </div>
  );
}

function SectionCard({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-border/80 bg-card shadow-sm">
      <div className="border-border/60 border-b px-3 py-2">
        <h3 className="font-medium font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
          {title}
        </h3>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function PromptPanel({
  initialPrompt,
}: {
  initialPrompt: InspectorInitialPrompt | null;
}) {
  const runtime =
    initialPrompt?.runtimeContextInstructions ||
    "Waiting for the next copilot run…";

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-3">
        <SectionCard title="Runtime context">
          <CopyablePre value={runtime} />
        </SectionCard>
        <SectionCard title="Model messages">
          <JsonViewer value={initialPrompt?.modelMessages ?? []} />
        </SectionCard>
      </div>
    </ScrollArea>
  );
}

export function TimelinePanel({
  events,
  messages,
}: {
  events: readonly AGUIEvent[];
  messages: readonly EngentyAgUiMessage[];
}) {
  const rows = buildTimelineRows({ events, messages });
  // The whole stream as text, oldest-first — the order you want when pasting it
  // into an issue or handing it to someone to read.
  const transcript = rows
    .filter((row) => row.tone !== "divider")
    .reverse()
    .map((row) =>
      [
        `${row.label}${row.count > 1 ? ` ×${row.count}` : ""}`,
        row.full || row.detail,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");

  return (
    <ScrollArea className="h-full">
      <div className="flex items-center justify-between gap-2 border-border/60 border-b px-3 py-2">
        <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
          Application stream
        </p>
        {rows.length > 0 ? (
          <CopyButton reveal="always" value={transcript} />
        ) : null}
      </div>
      {rows.length === 0 ? (
        <PanelEmpty>No messages or AG-UI events yet.</PanelEmpty>
      ) : (
        <div className="divide-y divide-border/60 font-mono text-xs">
          {rows.map((row) => (
            <TimelineRowView key={row.id} row={row} />
          ))}
        </div>
      )}
    </ScrollArea>
  );
}

function TimelineRowView({ row }: { row: TimelineRow }) {
  const [expanded, setExpanded] = useState(false);
  if (row.tone === "divider") {
    return (
      <div className="bg-muted/40 px-3 py-1.5">
        <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
          {row.label} · {row.detail}
        </p>
      </div>
    );
  }
  const labelClass =
    row.tone === "message"
      ? timelineMessageClassName(row.label)
      : timelineEventClassName(row.label);
  // Expandable when there is MORE to see than the inline summary — a folded
  // args run is short in preview but carries the whole assembled JSON.
  const canExpand =
    row.detail.length > 72 ||
    row.full.length > row.detail.length ||
    Boolean(row.identifiers);

  return (
    <div className="group px-3 py-2 hover:bg-muted/30">
      <div className="grid grid-cols-[10rem_1fr_auto] items-start gap-2">
        <button
          className={cn(
            "truncate text-left uppercase",
            labelClass,
            canExpand && "cursor-pointer"
          )}
          disabled={!canExpand}
          onClick={() => canExpand && setExpanded((v) => !v)}
          type="button"
        >
          {row.label}
        </button>
        <button
          className={cn(
            "min-w-0 text-left text-foreground/85",
            canExpand && "cursor-pointer"
          )}
          disabled={!canExpand}
          onClick={() => canExpand && setExpanded((v) => !v)}
          type="button"
        >
          {expanded ? (
            <span className="block">
              <span className="block whitespace-pre-wrap break-words">
                {row.full || row.detail || "…"}
              </span>
              {row.identifiers ? (
                <span className="mt-1 block break-all text-[10px] text-muted-foreground/70">
                  {row.identifiers}
                </span>
              ) : null}
            </span>
          ) : (
            truncateInline(row.detail || "…", 72)
          )}
        </button>
        <span className="flex shrink-0 items-center gap-1">
          {row.count > 1 ? (
            <Badge
              className="h-5 px-1.5 font-mono text-xxs"
              variant="secondary"
            >
              ×{row.count}
            </Badge>
          ) : null}
          <CopyButton value={`${row.label}\n${row.full || row.detail}`} />
        </span>
      </div>
    </div>
  );
}

export function ToolsPanel({
  toolCalls,
}: {
  toolCalls: readonly InspectorToolCall[];
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <ScrollArea className="h-full">
      <div className="border-border/60 border-b px-3 py-2">
        <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
          Tool calls
        </p>
      </div>
      {toolCalls.length === 0 ? (
        <PanelEmpty>No tool calls observed yet.</PanelEmpty>
      ) : (
        <div className="divide-y divide-border/60">
          {toolCalls.map((tool, index) => {
            const expanded = open[tool.id] ?? false;
            const displayStatus = resolveToolDisplayStatus(tool);
            const params = formatToolParameters(tool.args);

            return (
              <div className="group" key={tool.id}>
                <button
                  className="flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-muted/35"
                  onClick={() =>
                    setOpen((current) => ({
                      ...current,
                      [tool.id]: !expanded,
                    }))
                  }
                  type="button"
                >
                  <span className="flex items-center gap-2">
                    {expanded ? (
                      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium font-mono text-sm">
                      {tool.name}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-mono text-[11px] uppercase",
                        toolStatusClassName(displayStatus)
                      )}
                    >
                      {toolStatusLabel(displayStatus)}
                    </span>
                    <span className="shrink-0 font-mono text-muted-foreground text-xxs tabular-nums">
                      #{toolCalls.length - index}
                    </span>
                  </span>
                  <span className="pl-5 font-mono text-[11px] text-muted-foreground">
                    Parameters:{" "}
                    <span className="text-foreground/75">
                      {truncateInline(params, 88)}
                    </span>
                  </span>
                </button>
                {expanded ? (
                  <div className="space-y-2 border-border/50 border-t bg-muted/20 px-3 py-3">
                    <JsonViewer label="Arguments" value={tool.args || "{}"} />
                    <Separator />
                    <JsonViewer label="Result" value={tool.result ?? "null"} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </ScrollArea>
  );
}

export function JsonPanel({ value }: { value: unknown }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-border/60 border-b px-3 py-2">
        <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
          Shared state (agent.state)
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <JsonViewer fill value={value} />
      </div>
    </div>
  );
}

function JsonViewer({
  fill = false,
  label,
  value,
}: {
  fill?: boolean;
  label?: string;
  value: unknown;
}) {
  const parsed = coerceJsonValue(value);
  const text = typeof value === "string" ? value : formatJson(value);
  const structured =
    parsed !== null &&
    typeof parsed === "object" &&
    (Array.isArray(parsed) || isPlainRecord(parsed));

  if (!structured) {
    return (
      <CopyablePre
        className={fill ? "min-h-[80%] flex-1" : undefined}
        label={label}
        value={text}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col gap-1.5",
        fill && "min-h-[80%] flex-1"
      )}
    >
      {label ? (
        <span className="shrink-0 font-medium font-mono text-[11px] text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
      ) : null}
      <InspectorJsonTree
        className={fill ? "min-h-0 flex-1" : undefined}
        toolbar={<CopyButton reveal="always" value={formatJson(parsed)} />}
        value={parsed}
      />
    </div>
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function CopyablePre({
  className,
  label,
  value,
}: {
  className?: string;
  label?: string;
  value: string;
}) {
  const display = formatDisplayText(value);
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-md border border-border/50 bg-muted/40",
        className
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-border/40 border-b bg-muted/25 px-2 py-1">
        {label ? (
          <span className="font-medium font-mono text-[11px] text-muted-foreground uppercase tracking-wide">
            {label}
          </span>
        ) : (
          <span />
        )}
        <CopyButton reveal="always" value={value} />
      </div>
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed">
        {display}
      </pre>
    </div>
  );
}
