import {
  buildAgentUiPageBrief,
  useRegisterAgentUiSlice,
} from "@engenty/app-shell";
import { useMemo } from "react";

interface KbListPreviewItem {
  id: string;
  label: string;
  status?: string;
}

function faqLabel(item: { id: string; question?: string | null }) {
  return item.question?.trim() || item.id;
}

function sourceLabel(item: { id: string; name?: string | null }) {
  return item.name?.trim() || item.id;
}

export function useKbFaqsListAgentUiSlice(input: {
  faqs: Array<{ id: string; question?: string | null; status?: string }>;
  search: string;
  total: number;
}) {
  const slice = useMemo(() => {
    const q = input.search.trim();
    const preview: KbListPreviewItem[] = input.faqs.slice(0, 10).map((f) => ({
      id: f.id,
      label: faqLabel(f),
      ...(f.status ? { status: f.status } : {}),
    }));
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "list",
          page_title: "FAQs",
          page_description: q
            ? `Knowledge-base FAQs list filtered by search (${input.total} total).`
            : `Knowledge-base FAQs list (${input.total} total).`,
          list_search: q,
          list_total: input.total,
          list_preview: preview,
        }),
      },
    };
  }, [input.faqs, input.search, input.total]);

  useRegisterAgentUiSlice("kb.faqs", slice);
}

export function useKbFaqDetailAgentUiSlice(
  faq: {
    id: string;
    question?: string | null;
    status?: string;
  } | null
) {
  const slice = useMemo(() => {
    if (!faq) {
      return null;
    }
    const title = faqLabel(faq);
    const status = faq.status?.trim();
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "detail",
          page_title: title,
          page_description: status
            ? `Viewing knowledge-base FAQ ${title} (status ${status}).`
            : `Viewing knowledge-base FAQ ${title}.`,
        }),
        entity_title: title,
        ...(status ? { faq_status: status } : {}),
      },
      selection: {
        entity_id: faq.id,
        entity_type: "kb_faq",
      },
    };
  }, [faq]);

  useRegisterAgentUiSlice("kb.faq-detail", slice);
}

export function useKbFaqEditAgentUiSlice(input: {
  entityId: string | undefined;
  isNew: boolean;
  question: string;
  status: string;
}) {
  const slice = useMemo(() => {
    const title = input.question.trim() || (input.isNew ? "New FAQ" : "FAQ");
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "edit",
          page_title: title,
          page_description: input.isNew
            ? `Creating knowledge-base FAQ ${title}.`
            : `Editing knowledge-base FAQ ${title} (status ${input.status}).`,
        }),
        entity_title: title,
        faq_status: input.status,
      },
      selection: input.entityId
        ? {
            entity_id: input.entityId,
            entity_type: "kb_faq",
          }
        : undefined,
    };
  }, [input.entityId, input.isNew, input.question, input.status]);

  useRegisterAgentUiSlice("kb.faq-edit", slice);
}

export function useKbSourcesListAgentUiSlice(input: {
  search: string;
  sources: Array<{ id: string; name?: string | null; status?: string }>;
  statusFilter: string;
  total: number;
}) {
  const slice = useMemo(() => {
    const q = input.search.trim();
    const statusFilter =
      input.statusFilter && input.statusFilter !== "all"
        ? input.statusFilter
        : "";
    const preview: KbListPreviewItem[] = input.sources
      .slice(0, 10)
      .map((s) => ({
        id: s.id,
        label: sourceLabel(s),
        ...(s.status ? { status: s.status } : {}),
      }));
    const filters: Record<string, string> = {};
    if (statusFilter) {
      filters.status = statusFilter;
    }
    const filterSuffix = statusFilter
      ? ` filtered by status "${statusFilter}"`
      : "";
    const searchSuffix = q ? " filtered by search" : "";
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "list",
          page_title: "Sources",
          page_description: `Knowledge-base sources list${filterSuffix}${searchSuffix} (${input.total} total).`,
          list_search: q,
          list_filters: filters,
          list_total: input.total,
          list_preview: preview,
        }),
      },
    };
  }, [input.search, input.sources, input.statusFilter, input.total]);

  useRegisterAgentUiSlice("kb.sources", slice);
}

export function useKbSourceDetailAgentUiSlice(
  source: {
    adapter_id?: string;
    id: string;
    name?: string | null;
    status?: string;
  } | null
) {
  const slice = useMemo(() => {
    if (!source) {
      return null;
    }
    const title = sourceLabel(source);
    const status = source.status?.trim();
    const adapter = source.adapter_id?.trim();
    const bits = [
      status ? `status ${status}` : null,
      adapter ? `adapter ${adapter}` : null,
    ].filter(Boolean);
    const detail = bits.length > 0 ? ` (${bits.join(", ")})` : "";
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "detail",
          page_title: title,
          page_description: `Viewing knowledge-base source ${title}${detail}.`,
        }),
        entity_title: title,
        ...(status ? { source_status: status } : {}),
        ...(adapter ? { adapter_id: adapter } : {}),
      },
      selection: {
        entity_id: source.id,
        entity_type: "kb_source",
      },
    };
  }, [source]);

  useRegisterAgentUiSlice("kb.source-detail", slice);
}
