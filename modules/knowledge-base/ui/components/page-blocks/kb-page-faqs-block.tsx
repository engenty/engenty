/**
 * FAQs block renderer — question list with optional view-all link.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Skeleton } from "@engenty/ui-core";
import { Link } from "react-router-dom";
import type { KbPageFaqsBlock } from "../../../src/schema/page-blocks.js";
import { kbFaqPath, kbFaqsListPath } from "../../kb-paths.js";
import {
  kbFlatRowLinkClass,
  kbFlatRowListClassName,
} from "../../lib/kb-flat-list-styles.js";
import { faqsQueryParamsForBlock } from "../../lib/page-blocks/page-block-empty.js";
import { faqsQueryOptions } from "../../queries.js";

export interface KbPageFaqsBlockViewProps {
  block: KbPageFaqsBlock;
  editable?: boolean;
  kbId: string;
  kbSlug: string;
}

export function KbPageFaqsBlockView({
  block,
  editable = false,
  kbId,
  kbSlug,
}: KbPageFaqsBlockViewProps) {
  const { t } = useTranslation("kb");

  const faqsQuery = useQuery({
    ...faqsQueryOptions(faqsQueryParamsForBlock(block, kbId)),
  });

  const faqs = faqsQuery.data?.data ?? [];

  if (faqsQuery.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton className="h-8 w-full max-w-md" key={i} />
        ))}
      </div>
    );
  }

  if (faqs.length === 0) {
    if (!editable) {
      return null;
    }
    return (
      <p className="text-muted-foreground text-sm">
        {t("page_blocks.faqs.empty")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ul className={kbFlatRowListClassName}>
        {faqs.map((faq) => (
          <li key={faq.id}>
            <Link className={kbFlatRowLinkClass} to={kbFaqPath(kbSlug, faq.id)}>
              {faq.question}
            </Link>
          </li>
        ))}
      </ul>
      {block.show_view_all_link ? (
        <Link
          className="text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
          to={kbFaqsListPath(kbSlug)}
        >
          {t("hub.view_faqs")}
        </Link>
      ) : null}
    </div>
  );
}
