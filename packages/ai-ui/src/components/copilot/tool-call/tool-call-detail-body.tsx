"use client";

import { cn } from "@engenty/ui-core";
import type { ReactNode } from "react";
import type {
  ToolCallDetailField,
  ToolCallDetailSections,
} from "./tool-call-presentation";

function ToolCallDetailSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-1.5">
      <p className="font-medium text-[11px] text-foreground/65 uppercase tracking-wide">
        {title}
      </p>
      {children}
    </section>
  );
}

function ToolCallFieldGrid({ fields }: { fields: ToolCallDetailField[] }) {
  return (
    <dl className="space-y-1">
      {fields.map((field) => (
        <div
          className="flex gap-2 text-xs"
          key={`${field.label}-${field.value}`}
        >
          <dt className="w-20 shrink-0 text-foreground/55">{field.label}</dt>
          <dd
            className={cn(
              "min-w-0 break-all text-muted-foreground",
              field.mono && "font-mono text-[11px] leading-relaxed"
            )}
          >
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ToolCallOutputBlock({ text }: { text: string }) {
  return (
    <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-md border border-border-soft bg-muted/25 p-2.5 font-mono text-[11px] text-muted-foreground leading-relaxed">
      {text}
    </pre>
  );
}

export function ToolCallDetailBody({
  sections,
}: {
  sections: ToolCallDetailSections;
}) {
  const { errorMessage, fields, outputText } = sections;
  const hasContent =
    fields.length > 0 || Boolean(outputText) || Boolean(errorMessage);
  if (!hasContent) {
    return null;
  }

  return (
    <div className="space-y-3">
      {errorMessage ? (
        <ToolCallDetailSection title="Error">
          <p className="text-destructive/90 text-xs leading-relaxed">
            {errorMessage}
          </p>
        </ToolCallDetailSection>
      ) : null}
      {fields.length > 0 ? (
        <ToolCallDetailSection title="Input">
          <ToolCallFieldGrid fields={fields} />
        </ToolCallDetailSection>
      ) : null}
      {outputText ? (
        <ToolCallDetailSection title="Output">
          <ToolCallOutputBlock text={outputText} />
        </ToolCallDetailSection>
      ) : null}
    </div>
  );
}
