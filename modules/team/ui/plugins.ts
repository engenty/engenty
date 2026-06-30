import type { EngentyPluginsApi } from "@engenty/ui-plugin-sdk";

let pluginsApi: EngentyPluginsApi | null = null;

export function setTeamPluginsApi(api: EngentyPluginsApi) {
  pluginsApi = api;
}

export function getTeamPluginsApi(): EngentyPluginsApi | null {
  return pluginsApi;
}
