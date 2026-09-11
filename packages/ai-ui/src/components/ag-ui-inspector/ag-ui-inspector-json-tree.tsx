"use client";

import { Button, cn } from "@engenty/ui-core";
import { ChevronDown, ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { formatJson } from "./ag-ui-inspector-model.js";

const LONG_STRING = 120;

export function coerceJsonValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return value;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectionPreview(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.length}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value).length}}`;
  }
  return "";
}

function typeTone(value: unknown): string {
  if (value === null) {
    return "text-muted-foreground";
  }
  switch (typeof value) {
    case "string":
      return "text-emerald-700 dark:text-emerald-400";
    case "number":
      return "text-amber-700 dark:text-amber-400";
    case "boolean":
      return "text-violet-700 dark:text-violet-400";
    default:
      return "text-foreground/85";
  }
}

function formatPrimitive(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  return formatJson(value);
}

function PrimitiveValue({ value }: { value: unknown }) {
  const text = formatPrimitive(value);
  const truncated =
    typeof value === "string" && value.length > LONG_STRING
      ? `${JSON.stringify(`${value.slice(0, LONG_STRING)}…`)}`
      : text;
  return (
    <span className={cn("break-all", typeTone(value))} title={text}>
      {truncated}
    </span>
  );
}

function JsonNode({
  depth,
  defaultExpandedDepth,
  name,
  value,
}: {
  depth: number;
  defaultExpandedDepth: number;
  name?: string;
  value: unknown;
}) {
  const expandable = Array.isArray(value) || isPlainObject(value);
  const [open, setOpen] = useState(depth < defaultExpandedDepth);
  const entries = expandable
    ? Array.isArray(value)
      ? value.map((item, index) => [String(index), item] as const)
      : Object.entries(value)
    : [];

  if (!expandable) {
    return (
      <div className="flex gap-1.5 py-0.5 font-mono text-[11px] leading-5">
        {name === undefined ? null : (
          <>
            <span className="shrink-0 text-sky-700 dark:text-sky-400">
              {name}
            </span>
            <span className="text-muted-foreground">:</span>
          </>
        )}
        <PrimitiveValue value={value} />
      </div>
    );
  }

  const openBracket = Array.isArray(value) ? "[" : "{";
  const closeBracket = Array.isArray(value) ? "]" : "}";

  return (
    <div className="font-mono text-[11px] leading-5">
      <button
        className="flex w-full items-start gap-1 rounded-sm py-0.5 text-left hover:bg-muted/40"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="mt-0.5 shrink-0 text-muted-foreground">
          {open ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
        </span>
        {name === undefined ? null : (
          <>
            <span className="shrink-0 text-sky-700 dark:text-sky-400">
              {name}
            </span>
            <span className="text-muted-foreground">:</span>
          </>
        )}
        {open ? (
          <span className="text-muted-foreground">{openBracket}</span>
        ) : (
          <span className="text-muted-foreground">
            {openBracket}
            <span className="mx-0.5 text-foreground/55">
              {collectionPreview(value)}
            </span>
            {closeBracket}
          </span>
        )}
      </button>
      {open ? (
        <div className="ml-2 border-border-soft border-l pl-2.5">
          {entries.length === 0 ? (
            <div className="py-0.5 text-muted-foreground italic">empty</div>
          ) : (
            entries.map(([key, child]) => (
              <JsonNode
                defaultExpandedDepth={defaultExpandedDepth}
                depth={depth + 1}
                key={key}
                name={key}
                value={child}
              />
            ))
          )}
          <div className="py-0.5 text-muted-foreground">{closeBracket}</div>
        </div>
      ) : null}
    </div>
  );
}

export function InspectorJsonTree({
  className,
  defaultExpandedDepth = 2,
  toolbar,
  value,
}: {
  className?: string;
  defaultExpandedDepth?: number;
  toolbar?: ReactNode;
  value: unknown;
}) {
  const [expandDepth, setExpandDepth] = useState(defaultExpandedDepth);
  const [revision, setRevision] = useState(0);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-md border border-border-soft bg-muted/40",
        className
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-border-soft border-b bg-muted/25 px-2 py-1">
        <div className="flex items-center gap-1">
          <Button
            className="h-6 px-1.5 font-mono text-[10px]"
            onClick={() => {
              setExpandDepth(Number.POSITIVE_INFINITY);
              setRevision((current) => current + 1);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            Expand
          </Button>
          <Button
            className="h-6 px-1.5 font-mono text-[10px]"
            onClick={() => {
              setExpandDepth(0);
              setRevision((current) => current + 1);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            Collapse
          </Button>
        </div>
        {toolbar}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2.5">
        <JsonNode
          defaultExpandedDepth={expandDepth}
          depth={0}
          key={revision}
          value={value}
        />
      </div>
    </div>
  );
}
