"use client";

import type { ToolCallCardProps } from "./tool-call-card.types";
import { ToolCallCardBase } from "./tool-call-card-base";
import {
  collectWebSearchResults,
  findFirstStringDeep,
  formatHost,
} from "./tool-call-card-utils";

export function ToolCallWebSearchCard(props: ToolCallCardProps) {
  const { toolName: _toolName, ...baseProps } = props;
  const query =
    findFirstStringDeep(props.input, ["query", "search_query", "q"]) ??
    findFirstStringDeep(props.output, ["query", "search_query", "q"]);

  const results = collectWebSearchResults(props.output).slice(0, 3);

  const details = [
    results.length > 0 ? `${results.length} result(s)` : null,
    query ? `Query: ${query}` : null,
    ...results.map((result, index) => {
      const title = result.title ?? "Untitled result";
      const host = result.url ? formatHost(result.url) : "unknown source";
      return `${index + 1}. ${title} (${host})`;
    }),
  ].filter((row): row is string => Boolean(row));

  return (
    <ToolCallCardBase
      {...baseProps}
      details={details}
      headline={
        props.displayLabel ?? (query ? `Web search: ${query}` : "Web search")
      }
      tone="web_search"
    />
  );
}
