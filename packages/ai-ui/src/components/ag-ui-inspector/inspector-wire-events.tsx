import {
  type AGUIEvent,
  formatWireJson,
  type JsonHighlightTokenKind,
  tokenizeJson,
} from "@engenty/ag-ui-bridge";
import { useMemo } from "react";
import { agUiEventType } from "./ag-ui-inspector-chrome.js";

function eventPreview(event: AGUIEvent): string {
  const record = event as unknown as Record<string, unknown>;
  if (typeof record.delta === "string" && record.delta.trim()) {
    return record.delta.replace(/\s+/g, " ").slice(0, 80);
  }
  const name = record.toolCallName ?? record.name;
  if (typeof name === "string" && name.trim()) {
    return name;
  }
  try {
    return JSON.stringify(event).slice(0, 80);
  } catch {
    return "";
  }
}

function jsonTokenClassName(kind: JsonHighlightTokenKind): string {
  switch (kind) {
    case "key":
      return "text-sky-700 dark:text-sky-400";
    case "string":
      return "text-emerald-700 dark:text-emerald-400";
    case "number":
      return "text-amber-700 dark:text-amber-400";
    case "keyword":
      return "text-violet-700 dark:text-violet-400";
    default:
      return "text-muted-foreground";
  }
}

function WireJsonCode({ value }: { value: unknown }) {
  const tokens = useMemo(() => tokenizeJson(formatWireJson(value)), [value]);
  return (
    <pre className="wrap-break-word m-0 w-full min-w-0 overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2 font-mono text-[11px] leading-4">
      {tokens.map((token, index) => (
        <span className={jsonTokenClassName(token.kind)} key={index}>
          {token.value}
        </span>
      ))}
    </pre>
  );
}

export function InspectorWireEvents({
  events,
}: {
  events: readonly AGUIEvent[];
}) {
  if (events.length === 0) {
    return null;
  }
  return (
    <div className="w-full min-w-0 divide-y divide-border-soft font-mono text-xs">
      {events.map((event, index) => {
        const type = agUiEventType(event);
        return (
          <details className="group w-full min-w-0" key={`${type}-${index}`}>
            <summary className="flex w-full min-w-0 cursor-pointer list-none items-baseline gap-2 px-3 py-1.5 marker:content-none hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
              <span className="w-8 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
                {index}
              </span>
              <span className="shrink-0 font-semibold text-[10px] uppercase tracking-wide">
                {type}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {eventPreview(event)}
              </span>
            </summary>
            <div className="w-full min-w-0 px-3 pb-2">
              <WireJsonCode value={event} />
            </div>
          </details>
        );
      })}
    </div>
  );
}
