"use client";

import { isEngentyDeveloperModeUiEnabled } from "@engenty/environment";
import { Button } from "@engenty/ui-core";
import { Copy } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

export function CopilotDebugDetails({
  payload,
  title,
}: {
  payload: unknown;
  title: string;
}) {
  const [copied, setCopied] = useState(false);
  const jsonText = useMemo(() => JSON.stringify(payload, null, 2), [payload]);

  const handleCopy = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1400);
    },
    [jsonText]
  );

  if (payload === undefined) {
    return null;
  }
  if (!isEngentyDeveloperModeUiEnabled()) {
    return null;
  }

  return (
    <details className="shrink-0 rounded-md border bg-muted/30 px-3 py-2 text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <Button
          aria-label={copied ? "Copied JSON" : `Copy ${title} JSON`}
          className="size-7 shrink-0"
          onClick={(event) => {
            void handleCopy(event);
          }}
          size="icon"
          title={copied ? "Copied" : "Copy JSON"}
          type="button"
          variant="ghost"
        >
          <Copy className="size-3.5" />
        </Button>
      </summary>
      <pre className="wrap-break-word mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-muted-foreground">
        {jsonText}
      </pre>
    </details>
  );
}

export function CopilotTitle({ title }: { title: string }) {
  return (
    <h2 className="min-w-0 flex-1 truncate text-left font-medium text-foreground text-sm leading-none">
      {title}
    </h2>
  );
}
