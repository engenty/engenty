import type { ContactCreateInput, ContactListItem } from "@engenty/contacts/ui";
import type { EngentyPluginsApi } from "@engenty/ui-plugin-sdk";

export interface ContactsPluginApi {
  createContact: (input: ContactCreateInput) => Promise<ContactListItem>;
  getContacts: (
    params?: { search?: string; pageSize?: number },
    signal?: AbortSignal
  ) => Promise<ContactListItem[]>;
  [key: string]: unknown;
}

let pluginsApi: EngentyPluginsApi | null = null;

export function setInvoicesPluginsApi(api: EngentyPluginsApi | null) {
  pluginsApi = api;
}

export function getContactsPluginApi(): ContactsPluginApi | null {
  if (!pluginsApi?.isPluginEnabled("contacts")) {
    return null;
  }
  const api = pluginsApi.get<ContactsPluginApi>("contacts");
  if (api) {
    return api;
  }
  throw new Error(
    'Plugin "contacts" is enabled but did not expose its UI plugin API.'
  );
}
