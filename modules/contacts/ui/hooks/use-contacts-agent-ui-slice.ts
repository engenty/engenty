import {
  buildAgentUiPageBrief,
  useRegisterAgentUiSlice,
} from "@engenty/app-shell";
import { useMemo } from "react";
import type { ContactListItem } from "../api.js";
import {
  buildContactSnapshotForAgentUi,
  type ContactCopilotEntity,
} from "../copilot-context.js";

function contactDetailDescription(entity: ContactCopilotEntity): string {
  const kind = entity.type === "organisation" ? "organization" : "person";
  const title =
    entity.display_name?.trim() || entity.legal_name?.trim() || "contact";
  const city = entity.address_city?.trim();
  const location = city
    ? ` in ${city}${entity.address_country?.trim() ? `, ${entity.address_country.trim()}` : ""}`
    : "";
  return `Viewing ${kind} contact ${title}${location}.`;
}

export function useContactsDetailAgentUiSlice(
  entity: ContactCopilotEntity | null
) {
  const slice = useMemo(() => {
    if (!entity) {
      return null;
    }
    const title =
      entity.display_name?.trim() || entity.legal_name?.trim() || "Contact";
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "detail",
          page_title: title,
          page_description: contactDetailDescription(entity),
        }),
        contact_snapshot: buildContactSnapshotForAgentUi(entity),
        entity_title: title,
      },
      selection: {
        entity_id: entity.id,
        entity_type: "contact",
      },
    };
  }, [entity]);

  useRegisterAgentUiSlice("contacts_detail", slice);
}

export function useContactsListAgentUiSlice(input: {
  entities: ContactListItem[];
  roleFilter: string;
  search: string;
  total: number;
  typeFilter: string;
}) {
  const slice = useMemo(() => {
    const preview = input.entities.slice(0, 10).map((c) => ({
      id: c.id,
      label: c.display_name?.trim() || c.legal_name?.trim() || c.id,
      type: c.type,
    }));
    const filters: Record<string, string> = {};
    if (input.typeFilter) {
      filters.type = input.typeFilter;
    }
    if (input.roleFilter) {
      filters.role = input.roleFilter;
    }
    const filterBits = [
      input.typeFilter ? `type "${input.typeFilter}"` : null,
      input.roleFilter ? `role "${input.roleFilter}"` : null,
    ].filter(Boolean);
    const filterSuffix =
      filterBits.length > 0 ? ` filtered by ${filterBits.join(" and ")}` : "";
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "list",
          page_title: "Contacts",
          page_description: `Contacts list${filterSuffix} (${input.total} total).`,
          list_search: input.search,
          list_filters: filters,
          list_total: input.total,
          list_preview: preview,
        }),
        ...(preview.length > 0 ? { contacts_preview: preview } : {}),
      },
    };
  }, [
    input.entities,
    input.roleFilter,
    input.search,
    input.total,
    input.typeFilter,
  ]);

  useRegisterAgentUiSlice("contacts.list", slice);
}

export function useContactsEditAgentUiSlice(input: {
  draft: {
    dirty: boolean;
    fields: Record<string, unknown>;
  };
  entity: ContactCopilotEntity | null;
  entityId: string | undefined;
  title: string;
  visibleFields: string[];
}) {
  const slice = useMemo(() => {
    const kind =
      input.entity?.type === "organisation"
        ? "organization"
        : input.entity?.type === "person"
          ? "person"
          : "contact";
    return {
      draft: input.draft,
      page: {
        ...buildAgentUiPageBrief({
          page_type: "edit",
          page_title: input.title,
          page_description: input.draft.dirty
            ? `Editing ${kind} contact ${input.title} (unsaved changes).`
            : `Editing ${kind} contact ${input.title}.`,
        }),
        visible_fields: input.visibleFields,
        ...(input.entity
          ? { contact_snapshot: buildContactSnapshotForAgentUi(input.entity) }
          : {}),
      },
      selection: input.entityId
        ? {
            entity_id: input.entityId,
            entity_type: "contact",
          }
        : undefined,
    };
  }, [
    input.draft,
    input.entity,
    input.entityId,
    input.title,
    input.visibleFields,
  ]);

  useRegisterAgentUiSlice("contacts.edit", slice);
}

export function useContactsSettingsAgentUiSlice() {
  const slice = useMemo(
    () => ({
      page: {
        ...buildAgentUiPageBrief({
          page_type: "settings",
          page_title: "Contacts settings",
          page_description:
            "Contacts module settings (roles, ID format, languages).",
        }),
      },
    }),
    []
  );

  useRegisterAgentUiSlice("contacts.settings", slice);
}

export function useContactsImportAgentUiSlice() {
  const slice = useMemo(
    () => ({
      page: {
        ...buildAgentUiPageBrief({
          page_type: "import",
          page_title: "Import contacts",
          page_description: "CSV import wizard for contacts.",
        }),
      },
    }),
    []
  );

  useRegisterAgentUiSlice("contacts.import", slice);
}
