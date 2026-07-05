import { registerConnectorModule } from "@engenty/connections-sdk";
import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { microsoftOneDriveConnector } from "./onedrive.js";
import { microsoftOutlookConnector } from "./outlook.js";

export { microsoftOneDriveConnector } from "./onedrive.js";
export { microsoftOutlookConnector } from "./outlook.js";

/**
 * Microsoft connector module: registers the Outlook (mail + calendar) and
 * OneDrive connectors against the shared connections framework. The
 * connections module owns OAuth routes, policy enforcement, and approvals;
 * this module only contributes the connector definitions and their
 * per-action operations (all backed by Microsoft Graph v1.0).
 */
const registerConnectionsMicrosoftPlugin: EngentyPluginFactory = (engenty) => {
  registerConnectorModule(engenty, microsoftOutlookConnector);
  registerConnectorModule(engenty, microsoftOneDriveConnector);
};

export default registerConnectionsMicrosoftPlugin;
