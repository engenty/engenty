import type { EngentyPluginsApi } from "@engenty/ui-plugin-sdk";
import type { ComponentType } from "react";

export type {
  TeamMemberCatalogRow,
  TeamMembersPluginApi,
} from "@engenty/tasks/ui/assignee";

export interface EntityOption {
  display_name: string;
  id: string;
}

// biome-ignore lint/style/useConsistentTypeDefinitions: must be a type alias (not an interface) to satisfy the `Record<string, unknown>` plugin-API generic constraint below
export type CommercialDiscipline = {
  name: string;
  short: string;
};

// biome-ignore lint/style/useConsistentTypeDefinitions: must be a type alias (not an interface) to satisfy the `PluginMethodsRecord` plugin-API generic constraint below
export type CommercialSettingsPluginApi = {
  getDisciplines: (signal?: AbortSignal) => Promise<CommercialDiscipline[]>;
};

// biome-ignore lint/style/useConsistentTypeDefinitions: must be a type alias (not an interface) to satisfy the `Record<string, unknown>` plugin-API generic constraint below
export type ContactsPluginApi = {
  /** The contacts module's chooser — the same one the offers client dialog uses. */
  ContactChooser: ComponentType<{
    className?: string;
    entities: EntityOption[];
    onChange: (id: string | null) => void;
    value: string | null;
  }>;
  getContact: (
    id: string,
    signal?: AbortSignal
  ) => Promise<{
    address_city: string | null;
    address_country: string | null;
    address_street: string | null;
    address_zip: string | null;
    display_name: string;
    email: string | null;
    phone: string | null;
  }>;
  createContact: (input: {
    display_name: string;
    type: "organisation" | "person";
    [key: string]: unknown;
  }) => Promise<EntityOption>;
  getContacts: (
    params?: { search?: string; pageSize?: number },
    signal?: AbortSignal
  ) => Promise<EntityOption[]>;
};

// biome-ignore lint/style/useConsistentTypeDefinitions: must be a type alias (not an interface) to satisfy the `PluginMethodsRecord` plugin-API generic constraint below
export type TasksPluginUiApi = {
  getTeamMembersPluginState: () => {
    api: import("@engenty/tasks/ui/assignee").TeamMembersPluginApi | null;
    enabled: boolean;
  };
};

let pluginsApi: EngentyPluginsApi | null = null;

export function setProjectsPluginsApi(api: EngentyPluginsApi | null) {
  pluginsApi = api;
}

function getOptionalPluginApi<TMethods extends Record<string, unknown>>(
  pluginId: string
): TMethods | null {
  if (!pluginsApi?.isPluginEnabled(pluginId)) {
    return null;
  }

  const api = pluginsApi.get<TMethods>(pluginId);
  if (api) {
    return api;
  }

  throw new Error(
    `Plugin "${pluginId}" is enabled but did not expose its UI plugin API.`
  );
}

export function getContactsPluginApi(): ContactsPluginApi | null {
  return getOptionalPluginApi<ContactsPluginApi>("contacts");
}

export function getCommercialSettingsPluginApi(): CommercialSettingsPluginApi | null {
  return getOptionalPluginApi<CommercialSettingsPluginApi>(
    "commercial-settings"
  );
}

export function getTeamMembersPluginState(): {
  api: import("@engenty/tasks/ui/assignee").TeamMembersPluginApi | null;
  enabled: boolean;
} {
  const tasksApi = pluginsApi?.get<TasksPluginUiApi>("tasks");
  if (tasksApi?.getTeamMembersPluginState) {
    return tasksApi.getTeamMembersPluginState();
  }
  return { enabled: false, api: null };
}
