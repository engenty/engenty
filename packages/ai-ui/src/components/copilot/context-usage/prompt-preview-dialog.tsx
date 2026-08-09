"use client";

import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { Copy } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { formatTokenCount } from "./context-usage-model.js";
import {
  type PromptPreviewTool,
  type ThreadPromptPreview,
  useThreadPromptPreview,
} from "./prompt-preview-api.js";

/** Tools listed by default. The tail is long and uniformly small. */
const TOOL_PREVIEW_LIMIT = 12;

const SECTION_BAR_CLASS = {
  history: "bg-sky-500",
  system: "bg-primary",
  tools: "bg-amber-500",
} as const;

export interface PromptPreviewDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  threadId: string | null;
}

/**
 * Where the prompt's bytes go: system instructions, recalled history, tool
 * schemas.
 *
 * The point of the panel is the SPLIT, not the total — a 30k prompt is a
 * different problem when 20k of it is tool schemas than when 20k of it is
 * conversation, and only one of those is fixed by starting a new chat. So the
 * three sections lead, tools are listed heaviest-first, and the raw text sits
 * underneath for when the split alone does not explain it.
 */
export function PromptPreviewDialog({
  onOpenChange,
  open,
  threadId,
}: PromptPreviewDialogProps) {
  const { error, isLoading, preview } = useThreadPromptPreview({
    enabled: open,
    threadId,
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[85vh] w-[min(100vw-2rem,920px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Prompt breakdown</DialogTitle>
          <DialogDescription>
            {preview
              ? `${preview.agent_id}${
                  preview.model_id ? ` · ${preview.model_id}` : ""
                }`
              : "What the next run on this thread would send the model."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isLoading && !preview ? (
            <p className="text-muted-foreground text-sm">Assembling…</p>
          ) : null}
          {error && !preview ? (
            <p className="text-destructive text-sm">
              Could not build the preview: {error.message}
            </p>
          ) : null}
          {preview ? <PromptPreviewBody preview={preview} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PromptPreviewBody({ preview }: { preview: ThreadPromptPreview }) {
  const [showAllTools, setShowAllTools] = useState(false);
  const [copied, setCopied] = useState(false);

  const json = useMemo(() => JSON.stringify(preview, null, 2), [preview]);
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }, [json]);

  const total = preview.totals.chars || 1;
  const sections = [
    {
      chars: preview.totals.system_chars,
      key: "system" as const,
      label: "System instructions",
    },
    {
      chars: preview.totals.message_chars,
      key: "history" as const,
      label: `Recalled history (${preview.messages.length} messages)`,
    },
    {
      chars: preview.totals.tool_chars,
      key: "tools" as const,
      label: `Tool definitions (${preview.tools.length})`,
    },
  ];
  const tools = showAllTools
    ? preview.tools
    : preview.tools.slice(0, TOOL_PREVIEW_LIMIT);

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-medium text-sm">
            ~{formatTokenCount(preview.totals.estimated_tokens)} tokens
          </h3>
          <Button
            className="h-7 gap-1.5 text-xs"
            onClick={() => void handleCopy()}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Copy className="size-3.5" />
            {copied ? "Copied" : "Copy JSON"}
          </Button>
        </div>
        {/* One track, three segments: the relative weights are the finding. */}
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
          {sections.map((section) => (
            <div
              className={SECTION_BAR_CLASS[section.key]}
              key={section.key}
              style={{ width: `${(section.chars / total) * 100}%` }}
            />
          ))}
        </div>
        <dl className="space-y-1">
          {sections.map((section) => (
            <div
              className="flex items-baseline justify-between gap-3 text-xs"
              key={section.key}
            >
              <dt className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    SECTION_BAR_CLASS[section.key]
                  )}
                />
                <span className="truncate">{section.label}</span>
              </dt>
              <dd className="shrink-0 tabular-nums">
                ~{formatTokenCount(Math.round(section.chars / 4))} ·{" "}
                {Math.round((section.chars / total) * 100)}%
              </dd>
            </div>
          ))}
        </dl>
        {preview.recalled_tokens == null ? null : (
          <p className="text-[11px] text-muted-foreground">
            Memory reports {formatTokenCount(preview.recalled_tokens)} tokens
            for the recalled window.
          </p>
        )}
      </section>

      {preview.tools.length > 0 ? (
        <section className="space-y-1.5">
          <h4 className="text-muted-foreground text-xxs uppercase tracking-[0.1em]">
            Tools, heaviest first
          </h4>
          <ul className="divide-y rounded-md border">
            {tools.map((tool) => (
              <ToolRow key={tool.name} tool={tool} />
            ))}
          </ul>
          {preview.tools.length > TOOL_PREVIEW_LIMIT ? (
            <Button
              className="h-7 text-xs"
              onClick={() => setShowAllTools((current) => !current)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {showAllTools
                ? "Show fewer"
                : `Show all ${preview.tools.length} tools`}
            </Button>
          ) : null}
        </section>
      ) : null}

      {preview.messages.length > 0 ? (
        <section className="space-y-1.5">
          <h4 className="text-muted-foreground text-xxs uppercase tracking-[0.1em]">
            Recalled history
          </h4>
          <ul className="divide-y rounded-md border">
            {preview.messages.map((message, index) => (
              <li
                className="space-y-1 px-3 py-2"
                key={message.id ?? `${message.role}-${index}`}
              >
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-medium">{message.role}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    ~{formatTokenCount(message.estimated_tokens)}
                  </span>
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground text-xs">
                  {message.text || "—"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <details className="rounded-md border">
        <summary className="cursor-pointer px-3 py-2 font-medium text-sm">
          System instructions (
          {formatTokenCount(preview.system.estimated_tokens)} tokens)
        </summary>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap border-t px-3 py-2 text-muted-foreground text-xs">
          {preview.system.text || "—"}
        </pre>
      </details>

      {preview.caveats.length > 0 ? (
        // Verbatim, and never collapsed away: a breakdown that under-reports
        // without saying so sends the reader to prune the wrong section.
        <section className="space-y-1 rounded-md border border-dashed px-3 py-2">
          <h4 className="text-muted-foreground text-xxs uppercase tracking-[0.1em]">
            What this does not include
          </h4>
          <ul className="list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
            {preview.caveats.map((caveat) => (
              <li key={caveat}>{caveat}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ToolRow({ tool }: { tool: PromptPreviewTool }) {
  return (
    <li className="space-y-0.5 px-3 py-2">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="truncate font-mono">{tool.name}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          ~{formatTokenCount(tool.estimated_tokens)}
          {tool.schema_chars > 0
            ? ` · schema ${Math.round((tool.schema_chars / tool.chars) * 100)}%`
            : null}
        </span>
      </div>
      {tool.description ? (
        <p className="line-clamp-2 text-[11px] text-muted-foreground">
          {tool.description}
        </p>
      ) : null}
    </li>
  );
}
