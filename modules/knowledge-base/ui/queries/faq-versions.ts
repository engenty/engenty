/**
 * Knowledge Base — TanStack Query options.
 */

import { queryOptions } from "@engenty/query-client";
import { getFaq, getFaqVersion, listFaqVersions } from "../api.js";

export function faqVersionsListQueryOptions(faqId: string) {
  return queryOptions({
    queryKey: ["kb", "faqs", "versions", faqId],
    queryFn: ({ signal }) => listFaqVersions(faqId, signal),
    enabled: !!faqId,
    staleTime: 15_000,
  });
}

export function faqVersionDetailQueryOptions(
  faqId: string,
  version: number | null
) {
  return queryOptions({
    queryKey: ["kb", "faqs", "versions", faqId, "detail", version],
    queryFn: ({ signal }) => getFaqVersion(faqId, version!, signal),
    enabled: !!faqId && version != null && version >= 1,
    staleTime: 60_000,
  });
}

export function faqDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["kb", "faqs", "detail", id],
    queryFn: ({ signal }) => getFaq(id, signal),
    enabled: !!id,
    staleTime: 15_000,
  });
}
