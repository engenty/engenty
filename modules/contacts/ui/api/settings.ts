import { apiRequest } from "./request.js";

export interface ContactSettings {
  default_language: string;
  id_offset: number;
  id_postfix: string;
  id_prefix: string;
  languages: string[];
  salutations: string[];
}

export async function getContactSettings(signal?: AbortSignal) {
  return await apiRequest<ContactSettings>("/api/contacts/settings", {
    method: "GET",
    signal,
  });
}

export async function getNextReferenceId(signal?: AbortSignal) {
  const data = await apiRequest<{ reference_id: string }>(
    "/api/contacts/next-reference-id",
    { method: "GET", signal }
  );
  return data.reference_id;
}

export async function setContactSettings(input: ContactSettings) {
  return await apiRequest<ContactSettings>("/api/contacts/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
