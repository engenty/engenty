import type { ConnectorDefinition } from "@engenty/connections-sdk";
import { calendarConnector } from "./connectors/calendar.js";
import { driveConnector } from "./connectors/drive.js";
import { gmailConnector } from "./connectors/gmail.js";

/** All connectors this module registers, in registration order. */
export const googleConnectors: ConnectorDefinition[] = [
  gmailConnector,
  driveConnector,
  calendarConnector,
];
