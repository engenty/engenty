"use client";

import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import { isSandboxCommandOpenInterrupt } from "@engenty/ag-ui-bridge";
import { Button } from "@engenty/ui-core";

function formatCommandPreview(open: AgUiOpenInterruptMetadata): string | null {
  const input = open.tool_input;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return open.tool_name ?? null;
  }
  const record = input as Record<string, unknown>;
  const command =
    typeof record.command === "string"
      ? record.command
      : typeof record.cmd === "string"
        ? record.cmd
        : null;
  const args = Array.isArray(record.args)
    ? record.args.filter((entry): entry is string => typeof entry === "string")
    : [];
  if (!command) {
    return null;
  }
  return args.length > 0 ? `${command} ${args.join(" ")}` : command;
}

export function SandboxCommandConfirmCard(props: {
  onApprove: () => void;
  onReject: () => void;
  open: AgUiOpenInterruptMetadata;
}) {
  const commandPreview = formatCommandPreview(props.open);
  return (
    <section className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="space-y-1">
        <h3 className="font-medium text-sm">{props.open.title}</h3>
        <p className="text-muted-foreground text-xs">
          Shell command in sandbox workspace
        </p>
        {commandPreview ? (
          <pre className="max-h-32 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-snug">
            {commandPreview}
          </pre>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={props.onApprove} size="sm" type="button">
          Run command
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

export function sandboxCommandConfirmFromOpenInterrupt(
  open: AgUiOpenInterruptMetadata
): AgUiOpenInterruptMetadata | null {
  return isSandboxCommandOpenInterrupt(open) ? open : null;
}
