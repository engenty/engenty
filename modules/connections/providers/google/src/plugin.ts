import { registerConnectorModule } from "@engenty/connections-sdk";
import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { googleConnectors } from "./definitions.js";

/**
 * Google connector module: registers the google-gmail, google-drive,
 * google-calendar and google-contacts connectors with the connections
 * framework. Each connector action is projected as a module operation
 * (`gmail_*`, `gdrive_*`, `gcal_*`, `gcontacts_*`); OAuth routes, token
 * storage and the policy gate live in the connections module /
 * @engenty/connections-sdk.
 */
const registerConnectionsGooglePlugin: EngentyPluginFactory = (engenty) => {
  for (const connector of googleConnectors) {
    registerConnectorModule(engenty, connector);
  }
};

export default registerConnectionsGooglePlugin;
