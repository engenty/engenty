import type { PluginServerApi } from "@engenty/plugin-sdk";
import { registerContactsRoutes } from "./contacts-routes.js";
import { registerContactsGatewayMethods } from "./gateway-methods.js";
import type { ContactRepoOrFactory } from "./helpers.js";
import { CONTACT_CREATE_DEFAULTS, getRepo } from "./helpers.js";
import { registerImportRoutes } from "./import-routes.js";
import { registerContactRelationGatewayMethods } from "./relation-gateway-methods.js";
import { registerContactRelationRoutes } from "./relation-routes.js";
import { registerRolesRoutes } from "./roles-routes.js";
import { registerSettingsRoutes } from "./settings-routes.js";

export function registerContactsApi(
  api: PluginServerApi,
  repoOrFactory: ContactRepoOrFactory
) {
  registerImportRoutes(api);
  registerSettingsRoutes(api, repoOrFactory, getRepo);
  registerContactsRoutes(api, repoOrFactory, getRepo, CONTACT_CREATE_DEFAULTS);
  registerContactRelationRoutes(api, repoOrFactory, getRepo);
  registerRolesRoutes(api, repoOrFactory, getRepo);
  registerContactsGatewayMethods(
    api,
    repoOrFactory,
    getRepo,
    CONTACT_CREATE_DEFAULTS
  );
  registerContactRelationGatewayMethods(api, repoOrFactory, getRepo);
}
