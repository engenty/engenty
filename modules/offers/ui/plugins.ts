import type { ContactListItem } from "@engenty/contacts/ui";
import type { EngentyPluginsApi } from "@engenty/ui-plugin-sdk";
import type { ComponentType } from "react";

export type ContactChooserComponent = ComponentType<{
  value: string | null;
  onChange: (id: string | null) => void;
  entities: { id: string; display_name: string }[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}>;

export interface ContactsPluginApi {
  ContactChooser?: ContactChooserComponent;
  getContact: (id: string, signal?: AbortSignal) => Promise<ContactListItem>;
  getContacts: (
    params?: { search?: string; pageSize?: number },
    signal?: AbortSignal
  ) => Promise<ContactListItem[]>;
  [key: string]: unknown;
}

/** Minimal view of the projects UI plugin API for the accepted-state handoff. */
export interface ProjectsPluginApi {
  createProject: (input: {
    client_id: string | null;
    client_name: string | null;
    lead_id?: string | null;
    title: string;
  }) => Promise<{ id: string }>;
  [key: string]: unknown;
}

let pluginsApi: EngentyPluginsApi | null = null;

export function setOffersPluginsApi(api: EngentyPluginsApi) {
  pluginsApi = api;
}

export function getProjectsPluginApi(): ProjectsPluginApi | null {
  if (!pluginsApi?.isPluginEnabled("projects")) {
    return null;
  }
  return pluginsApi.get<ProjectsPluginApi>("projects") ?? null;
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
