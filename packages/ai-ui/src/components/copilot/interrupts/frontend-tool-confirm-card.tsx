"use client";

import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import { isFrontendToolOpenInterrupt } from "@engenty/ag-ui-bridge";
import { Button } from "@engenty/ui-core";

function formatToolInputPreview(input: unknown): string | null {
  if (input === undefined) {
    return null;
  }
  try {
    const text = JSON.stringify(input, null, 2);
    if (text.length <= 240) {
      return text;
    }
    return `${text.slice(0, 237)}…`;
  } catch {
    return String(input);
  }
}

export function frontendToolConfirmFromOpenInterrupt(
  open: AgUiOpenInterruptMetadata
): AgUiOpenInterruptMetadata | null {
  return isFrontendToolOpenInterrupt(open) ? open : null;
}

export function FrontendToolConfirmCard(props: {
  onApprove: () => void;
  onReject: () => void;
  open: AgUiOpenInterruptMetadata;
}) {
  const inputPreview = formatToolInputPreview(props.open.tool_input);
  return (
    <section className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="space-y-1">
        <h3 className="font-medium text-sm">{props.open.title}</h3>
        {props.open.tool_name ? (
          <p className="text-muted-foreground text-xs">
            {props.open.tool_name}
          </p>
        ) : null}
        {inputPreview ? (
          <pre className="max-h-32 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-snug">
            {inputPreview}
          </pre>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={props.onApprove} size="sm" type="button">
          Approve
        </Button>
        <Button
          onClick={props.onReject}
          size="sm"
          type="button"
          variant="outline"
        >
          Reject
        </Button>
      </div>
    </section>
  );
}
