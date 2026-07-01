/**
 * FAQ read view header — mirrors article chrome (title, status, tags).
 */

import { useTranslation } from "@engenty/i18n/ui";
import { Badge, cn } from "@engenty/ui-core";
import type { Faq } from "../../src/schema/types.js";
import {
  articlePropertyChipClassName,
  articlePropertyTagChipToneClassName,
} from "./article-properties-panel/article-property-shell.js";

export interface FaqHeaderChromeProps {
  faq: Faq;
}

export function FaqHeaderChrome({ faq }: FaqHeaderChromeProps) {
  const { t } = useTranslation("kb");

  return (
    <div className="space-y-3 border-b pb-4">
      <div className="min-w-0">
        <h1 className="font-heading text-[28px] leading-9 tracking-tight">
          {faq.question}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge
            variant={
              faq.status === "published"
                ? "default"
                : faq.status === "archived"
                  ? "outline"
                  : "secondary"
            }
          >
            {t(`article.status.${faq.status}`)}
          </Badge>
          {faq.tags?.map((tag) => (
            <Badge
              className={cn(
                articlePropertyChipClassName,
                articlePropertyTagChipToneClassName,
                "py-0 font-normal"
              )}
              key={tag.id}
              variant="secondary"
            >
              {tag.name}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
