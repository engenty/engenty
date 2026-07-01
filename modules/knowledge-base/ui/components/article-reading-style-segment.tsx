/**
 * Segmented reading-style control (matches {@link ListDisplayConfigurator} view-mode row).
 */

import { Button } from "@engenty/ui-core";
import { BookOpen, CaseSensitive, Type } from "lucide-react";
import type { ArticleReadingStyle } from "../hooks/use-article-reading-style.js";

export interface ArticleReadingStyleSegmentProps {
  onChange: (style: ArticleReadingStyle) => void;
  t: (key: string, defaultValue?: string) => string;
  value: ArticleReadingStyle;
}

export function ArticleReadingStyleSegment({
  value,
  onChange,
  t,
}: ArticleReadingStyleSegmentProps) {
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
          <span className="text-xs">
            {t("article.overflow.reading_style.normal")}
          </span>
        </Button>
        <Button
          className="h-auto flex-col items-center gap-1 py-1.5"
          onClick={() => onChange("large")}
          size="sm"
          type="button"
          variant={value === "large" ? "outline" : "ghost"}
        >
          <CaseSensitive className="h-4 w-4" />
          <span className="text-xs">
            {t("article.overflow.reading_style.large")}
          </span>
        </Button>
        <Button
          className="h-auto flex-col items-center gap-1 py-1.5"
          onClick={() => onChange("tone")}
          size="sm"
          type="button"
          variant={value === "tone" ? "outline" : "ghost"}
        >
          <BookOpen className="h-4 w-4" />
          <span className="text-xs">
            {t("article.overflow.reading_style.tone")}
          </span>
        </Button>
      </div>
    </div>
  );
}
