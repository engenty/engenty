import { registerConnectorModule } from "@engenty/connections-sdk";
import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { hubspotConnector } from "./connector.js";

/**
 * HubSpot connector module. The connections framework owns OAuth/credentials
 * routes and policy; this module only registers the HubSpot ConnectorDefinition
 * (`hubspot_list_contacts`).
 */
const registerConnectionsHubspotPlugin: EngentyPluginFactory = (engenty) => {
  registerConnectorModule(engenty, hubspotConnector);
};

export default registerConnectionsHubspotPlugin;
