import { Button, Card } from "@engenty/ui-core";
import { Copy } from "lucide-react";
import type { PdfTemplateHelpSection } from "../types.js";

interface HelpTabProps {
  onCopy: (value: string) => Promise<void>;
  sections: PdfTemplateHelpSection[];
}

export function HelpTab({ onCopy, sections }: HelpTabProps) {
  return (
    <div className="space-y-2 overflow-auto p-2 sm:p-3">
      {sections.map((section) => (
        <Card className="space-y-2 p-3" key={section.title} variant="form">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-medium text-sm">{section.title}</h3>
              <p className="text-muted-foreground text-sm">
                {section.description}
              </p>
            </div>
            {section.code ? (
              <Button
                onClick={() => void onCopy(section.code ?? "")}
                size="sm"
                variant="outline"
              >
                <Copy className="h-4 w-4" />
                Copy
              </Button>
            ) : null}
          </div>
          {section.code ? (
            <pre className="overflow-auto rounded bg-muted p-2 font-mono text-[11px] leading-snug">
              {section.code}
            </pre>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
