import { registerConnectorModule } from "@engenty/connections-sdk";
import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { slackConnector } from "./connector.js";

/**
 * Slack connector module. The connections framework module owns the shared
 * machinery (schema, OAuth routes, policy gate, approvals); this module only
 * contributes the Slack ConnectorDefinition, which projects one operation per
 * action (`slack_list_channels`, `slack_post_message`, ...).
 */
const registerConnectionsSlackPlugin: EngentyPluginFactory = (engenty) => {
  registerConnectorModule(engenty, slackConnector);
};

export default registerConnectionsSlackPlugin;
