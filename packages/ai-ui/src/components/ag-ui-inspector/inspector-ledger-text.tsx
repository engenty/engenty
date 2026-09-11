import {
  ledgerTagTone,
  ledgerTextAsCode,
  ledgerTextAsMarkdown,
  parseLedgerMarkup,
  splitLedgerDetail,
} from "@engenty/ag-ui-bridge";
import { cn, Tabs, TabsList, TabsTrigger } from "@engenty/ui-core";
import { Code2, Eye } from "lucide-react";
import { MessageResponse } from "../ai-elements/message.js";

export type LedgerTextMode = "code" | "markdown";

const LEDGER_MARKDOWN_CLASSNAME = [
  "font-sans text-xs leading-snug text-foreground",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_p]:my-1 [&_p]:leading-snug",
  "[&_h1]:mb-1 [&_h1]:mt-3 [&_h1]:font-semibold [&_h1]:text-sm",
  "[&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:font-semibold [&_h2]:text-sm",
  "[&_h3]:mb-0.5 [&_h3]:mt-2 [&_h3]:font-semibold [&_h3]:text-xs",
  "[&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0",
  "[&_pre]:my-1.5 [&_code]:text-[11px]",
].join(" ");

function tagClassName(name: string): string {
  switch (ledgerTagTone(name)) {
    case "tool":
      return "bg-amber-500/15 font-semibold text-amber-900 dark:text-amber-200";
    case "reasoning":
      return "bg-violet-500/10 text-violet-800 dark:text-violet-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function InspectorLedgerMarkup({
  className,
  text,
}: {
  className?: string;
  text: string;
}) {
  const parts = parseLedgerMarkup(text);
  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.kind === "text") {
          return <span key={index}>{part.value}</span>;
        }
        const label = part.arg ? `${part.name}: ${part.arg}` : part.name;
        return (
          <span
            className={cn(
              "mx-0.5 inline-flex rounded px-1 py-px align-middle font-mono text-[10px] leading-4",
              tagClassName(part.name)
            )}
            key={index}
          >
            {label}
          </span>
        );
      })}
    </span>
  );
}

export function InspectorLedgerBody({
  mode = "markdown",
  text,
}: {
  mode?: LedgerTextMode;
  text: string;
}) {
  if (mode === "markdown") {
    return (
      <MessageResponse className={LEDGER_MARKDOWN_CLASSNAME}>
        {ledgerTextAsMarkdown(text)}
      </MessageResponse>
    );
  }
  return (
    <span className="whitespace-pre-wrap break-words">
      <InspectorLedgerMarkup text={ledgerTextAsCode(text)} />
    </span>
  );
}

export function InspectorLedgerDetail({
  detail,
  mode = "markdown",
}: {
  detail: string;
  mode?: LedgerTextMode;
}) {
  const { body, meta } = splitLedgerDetail(detail);
  return (
    <span className="block break-words">
      {meta.length > 0 ? (
        <span className="mb-1.5 block space-y-0.5 font-mono text-[10px] text-muted-foreground leading-4">
          {meta.map((line) => (
            <span className="block" key={line}>
              {line}
            </span>
          ))}
        </span>
      ) : null}
      {body ? <InspectorLedgerBody mode={mode} text={body} /> : null}
    </span>
  );
}

export function LedgerTextModeSwitch({
  codeLabel = "Code",
  markdownLabel = "Markdown",
  onChange,
  value,
}: {
  codeLabel?: string;
  markdownLabel?: string;
  onChange: (mode: LedgerTextMode) => void;
  value: LedgerTextMode;
}) {
  return (
    <Tabs
      onValueChange={(next) => onChange(next as LedgerTextMode)}
      value={value}
    >
      <TabsList className="h-7">
        <TabsTrigger
          aria-label={markdownLabel}
          className="h-6 w-6 px-0"
          title={markdownLabel}
          value="markdown"
        >
          <Eye className="size-3.5" />
        </TabsTrigger>
        <TabsTrigger
          aria-label={codeLabel}
          className="h-6 w-6 px-0"
          title={codeLabel}
          value="code"
        >
          <Code2 className="size-3.5" />
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
