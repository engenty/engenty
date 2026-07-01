import type { EngentyPluginsApi } from "@engenty/ui-plugin-sdk";

let pluginsApi: EngentyPluginsApi | null = null;

export function setContactsPluginsApi(api: EngentyPluginsApi) {
  pluginsApi = api;
}

export function getContactsPluginsApi(): EngentyPluginsApi | null {
  return pluginsApi;
}
