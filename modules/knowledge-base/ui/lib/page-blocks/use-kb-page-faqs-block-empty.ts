import { useQuery } from "@engenty/query-client";
import { useMemo } from "react";
import type { KbPageFaqsBlock } from "../../../src/schema/page-blocks.js";
import { faqsQueryOptions } from "../../queries.js";
import {
  faqsQueryParamsForBlock,
  isKbPageFaqsBlockEmpty,
} from "./page-block-empty.js";

export function useKbPageFaqsBlockEmpty(
  block: KbPageFaqsBlock | null,
  kbId: string
) {
  const faqsQuery = useQuery({
    ...(block
      ? faqsQueryOptions(faqsQueryParamsForBlock(block, kbId))
      : faqsQueryOptions({ kb_id: kbId, page_size: 1 })),
    enabled: block !== null,
  });

  const faqs = faqsQuery.data?.data ?? [];

  const isEmpty = useMemo(() => {
    if (!block) {
      return false;
    }
    return isKbPageFaqsBlockEmpty(block, faqs);
  }, [block, faqs]);

  return {
    isEmpty,
    isLoading: block !== null && faqsQuery.isLoading,
  };
}
