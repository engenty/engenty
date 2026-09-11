import {
  buildAgentUiPageBrief,
  useRegisterAgentUiSlice,
} from "@engenty/app-shell";
import { useMemo } from "react";

export function useKbHubAgentUiSlice(input: {
  isEditMode: boolean;
  kbId: string;
  kbName: string;
}) {
  const slice = useMemo(() => {
    const title = input.kbName.trim() || "Knowledge base";
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: input.isEditMode ? "edit" : "hub",
          page_title: title,
          page_description: input.isEditMode
            ? `Editing knowledge-base hub layout for ${title}.`
            : `Viewing knowledge-base hub for ${title}.`,
        }),
        entity_title: title,
        ...(input.kbId ? { kb_id: input.kbId } : {}),
      },
      selection: input.kbId
        ? {
            entity_id: input.kbId,
            entity_type: "knowledge_base",
          }
        : undefined,
    };
  }, [input.isEditMode, input.kbId, input.kbName]);

  useRegisterAgentUiSlice(input.isEditMode ? "kb.hub-edit" : "kb.hub", slice);
}

/** Legacy inbox list redirects to Sources — keep a thin brief. */
export function useKbInboxListAgentUiSlice() {
  const slice = useMemo(
    () => ({
      page: {
        ...buildAgentUiPageBrief({
          page_type: "list",
          page_title: "KB inbox",
          page_description:
            "Legacy knowledge-base inbox list; redirects to Sources.",
        }),
      },
    }),
    []
  );

  useRegisterAgentUiSlice("kb.inbox", slice);
}

/** Legacy inbox detail redirects to Sources — keep a thin brief. */
export function useKbInboxDetailAgentUiSlice(inboxId: string | undefined) {
  const slice = useMemo(
    () => ({
      page: {
        ...buildAgentUiPageBrief({
          page_type: "detail",
          page_title: "KB inbox item",
          page_description: inboxId
            ? `Legacy knowledge-base inbox detail for ${inboxId}; redirects to Sources.`
            : "Legacy knowledge-base inbox detail; redirects to Sources.",
        }),
      },
      selection: inboxId
        ? {
            entity_id: inboxId,
            entity_type: "kb_inbox_item",
          }
        : undefined,
    }),
    [inboxId]
  );

  useRegisterAgentUiSlice("kb.inbox-detail", slice);
}

export function useKbFavoritesListAgentUiSlice(input: {
  items: Array<{ subtitle?: string | null; title: string; to: string }>;
}) {
  const slice = useMemo(() => {
    const preview = input.items.slice(0, 10).map((item) => ({
      id: item.to,
      label: item.title.trim() || item.to,
      ...(item.subtitle?.trim() ? { subtitle: item.subtitle.trim() } : {}),
    }));
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "list",
          page_title: "Favorites",
          page_description: `Knowledge-base favorites list (${input.items.length} total).`,
          list_total: input.items.length,
          list_preview: preview,
        }),
      },
    };
  }, [input.items]);

  useRegisterAgentUiSlice("kb.favorites", slice);
}

export function useKbSettingsAgentUiSlice(input: {
  kbs: Array<{ id: string; name?: string | null; slug?: string | null }>;
}) {
  const slice = useMemo(() => {
    const preview = input.kbs.slice(0, 10).map((kb) => ({
      id: kb.id,
      label: kb.name?.trim() || kb.slug?.trim() || kb.id,
      ...(kb.slug?.trim() ? { slug: kb.slug.trim() } : {}),
    }));
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "settings",
          page_title: "Knowledge base settings",
          page_description: `Knowledge-base module settings (${input.kbs.length} knowledge base(s)).`,
          list_total: input.kbs.length,
          list_preview: preview,
        }),
      },
    };
  }, [input.kbs]);

  useRegisterAgentUiSlice("kb.settings", slice);
}

export function useKbScopedSettingsAgentUiSlice(input: {
  isDirty: boolean;
  kbId: string;
  kbName: string;
}) {
  const slice = useMemo(() => {
    if (!input.kbId) {
      return null;
    }
    const title = input.kbName.trim() || "Knowledge base";
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "settings",
          page_title: title,
          page_description: input.isDirty
            ? `Editing settings for knowledge base ${title} (unsaved changes).`
            : `Editing settings for knowledge base ${title}.`,
        }),
        entity_title: title,
        kb_id: input.kbId,
      },
      selection: {
        entity_id: input.kbId,
        entity_type: "knowledge_base",
      },
    };
  }, [input.isDirty, input.kbId, input.kbName]);

  useRegisterAgentUiSlice("kb.scoped-settings", slice);
}
