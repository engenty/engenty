/**
 * Segmented reading-style control for the markdown page ⋯ menu.
 */

import { Button } from "@engenty/ui-core";
import { BookOpen, CaseSensitive, Type } from "lucide-react";
import type { MarkdownReadingStyle } from "./markdown-reading-style.js";

export interface MarkdownReadingStyleSegmentProps {
  labels: {
    large: string;
    normal: string;
    tone: string;
  };
  onChange: (style: MarkdownReadingStyle) => void;
  value: MarkdownReadingStyle;
}

export function MarkdownReadingStyleSegment({
  labels,
  onChange,
  value,
}: MarkdownReadingStyleSegmentProps) {
  return (
    <div className="p-1">
      <div
        className="grid rounded-lg outline outline-muted -outline-offset-1"
        style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
      >
        <Button
          className="h-auto flex-col items-center gap-1 py-1.5"
          onClick={() => onChange("normal")}
          size="sm"
          type="button"
          variant={value === "normal" ? "outline" : "ghost"}
        >
          <Type className="h-4 w-4" />
          <span className="text-xs">{labels.normal}</span>
        </Button>
        <Button
          className="h-auto flex-col items-center gap-1 py-1.5"
          onClick={() => onChange("large")}
          size="sm"
          type="button"
          variant={value === "large" ? "outline" : "ghost"}
        >
          <CaseSensitive className="h-4 w-4" />
          <span className="text-xs">{labels.large}</span>
        </Button>
        <Button
          className="h-auto flex-col items-center gap-1 py-1.5"
          onClick={() => onChange("tone")}
          size="sm"
          type="button"
          variant={value === "tone" ? "outline" : "ghost"}
        >
          <BookOpen className="h-4 w-4" />
          <span className="text-xs">{labels.tone}</span>
        </Button>
      </div>
    </div>
  );
}
