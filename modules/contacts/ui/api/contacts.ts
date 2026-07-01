import { getCurrentUserId } from "@engenty/auth-ui";
import type {
  ContactCreateInput,
  ContactListItem,
  ContactRelation,
  ContactRelationCreateInput,
  ContactRelationListItem,
  ContactRelationUpdateInput,
  ContactRole,
  ContactsPaginatedResponse,
  ContactsQueryParams,
  ContactsSearchParams,
  ContactsSearchResponse,
  ContactUpdateInput,
} from "../../src/schema/index.js";
import { apiRequest, apiRequestEnvelope } from "./request.js";

export type {
  ContactCreateInput,
  ContactListItem,
  ContactRelation,
  ContactRelationCreateInput,
  ContactRelationListItem,
  ContactRelationUpdateInput,
  ContactRole,
  ContactsPaginatedResponse,
  ContactsQueryParams,
  ContactsSearchParams,
  ContactsSearchResponse,
  ContactUpdateInput,
} from "../../src/schema/index.js";

function buildQuery(
  params: ContactsQueryParams | ContactsSearchParams
): string {
  const searchParams = new URLSearchParams();
  if (params.page) {
    searchParams.set("page", String(params.page));
  }
  if (params.pageSize) {
    searchParams.set("pageSize", String(params.pageSize));
  }
  if (params.role) {
    searchParams.set("role", params.role);
  }
  if (params.type === "organisation" || params.type === "person") {
    searchParams.set("type", params.type);
  }
  if (params.sortBy) {
    searchParams.set("sortBy", params.sortBy);
  }
  if (params.sortOrder) {
    searchParams.set("sortOrder", params.sortOrder);
  }
  if (params.search?.trim()) {
    searchParams.set("search", params.search.trim());
  }
  if ("strategy" in params && params.strategy) {
    searchParams.set("strategy", params.strategy);
  }
  if (params.include_linked_invoice_counts === false) {
    searchParams.set("include_linked_invoice_counts", "false");
  }
  const q = searchParams.toString();
  return q ? `?${q}` : "";
}

export async function getContacts(
  params: ContactsQueryParams = {},
  signal?: AbortSignal
) {
  const response = await apiRequestEnvelope<
    ContactListItem[],
    { page: number; pageSize: number; total: number }
  >(`/api/contacts${buildQuery(params)}`, { method: "GET", signal });
  return {
    data: response.data,
    page: response.meta?.page ?? params.page ?? 1,
    pageSize:
      response.meta?.pageSize ?? params.pageSize ?? response.data.length,
    total: response.meta?.total ?? response.data.length,
  } satisfies ContactsPaginatedResponse;
}

export async function searchContacts(
  params: ContactsSearchParams = {},
  signal?: AbortSignal
) {
  const response = await apiRequestEnvelope<
    ContactsSearchResponse["data"],
    { page: number; pageSize: number; total: number }
  >(`/api/contacts/search${buildQuery(params)}`, { method: "GET", signal });
  return {
    data: response.data,
    page: response.meta?.page ?? params.page ?? 1,
    pageSize:
      response.meta?.pageSize ?? params.pageSize ?? response.data.length,
    total: response.meta?.total ?? response.data.length,
  } satisfies ContactsSearchResponse;
}

export async function createContact(input: ContactCreateInput) {
  const createdBy = input.created_by ?? (await getCurrentUserId()) ?? "system";
  return await apiRequest<ContactListItem>("/api/contacts", {
    method: "POST",
    body: JSON.stringify({ ...input, created_by: createdBy }),
  });
}

export async function getContact(id: string, signal?: AbortSignal) {
  return await apiRequest<ContactListItem>(`/api/contacts/${id}`, {
    method: "GET",
    signal,
  });
}

export async function findContactByImportId(
  importId: string,
  signal?: AbortSignal
): Promise<ContactListItem | null> {
  try {
    return await apiRequest<ContactListItem>(
      `/api/contacts/by-import-id?import_id=${encodeURIComponent(importId)}`,
      { method: "GET", signal }
    );
  } catch {
    return null;
  }
}

export async function findContactByReferenceId(
  referenceId: string,
  signal?: AbortSignal
): Promise<ContactListItem | null> {
  try {
    return await apiRequest<ContactListItem>(
      `/api/contacts/by-reference-id?reference_id=${encodeURIComponent(referenceId)}`,
      { method: "GET", signal }
    );
  } catch {
    return null;
  }
}

export async function addContactRole(id: string, role: ContactRole) {
  return await apiRequest<ContactListItem>(`/api/contacts/${id}/roles`, {
    method: "POST",
    body: JSON.stringify({ role }),
  });
}

export async function getContactRelations(
  id: string,
  options?: { includeInactive?: boolean },
  signal?: AbortSignal
) {
  const searchParams = new URLSearchParams();
  if (options?.includeInactive) {
    searchParams.set("include_inactive", "true");
  }
  const query = searchParams.toString();
  return await apiRequest<ContactRelationListItem[]>(
    `/api/contacts/${id}/relations${query ? `?${query}` : ""}`,
    { method: "GET", signal }
  );
}

export async function createContactRelation(input: ContactRelationCreateInput) {
  return await apiRequest<ContactRelation>("/api/contacts/relations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateContactRelation(
  relationId: string,
  patch: ContactRelationUpdateInput
) {
  return await apiRequest<ContactRelation>(
    `/api/contacts/relations/${relationId}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    }
  );
}

export async function deleteContactRelation(relationId: string) {
  return await apiRequest<ContactRelation>(
    `/api/contacts/relations/${relationId}`,
    {
      method: "DELETE",
    }
  );
}

export async function removeContactRole(id: string, role: ContactRole) {
  return await apiRequest<ContactListItem>(
    `/api/contacts/${id}/roles/${encodeURIComponent(role)}`,
    { method: "DELETE" }
  );
}

export async function deleteContact(id: string) {
  return await apiRequest<{ ok: true; id: string }>(`/api/contacts/${id}`, {
    method: "DELETE",
  });
}

export async function updateContact(id: string, patch: ContactUpdateInput) {
  return await apiRequest<ContactListItem>(`/api/contacts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
