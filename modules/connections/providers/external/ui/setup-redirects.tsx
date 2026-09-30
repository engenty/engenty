import { CONNECTIONS_CATALOG_PATH } from "@engenty/plugin-sdk";
import { Navigate } from "react-router-dom";

/** Install-owner setup area (not tenant Settings). */
export const SETUP_ROOT_PATH = "/setup";

/** Default Setup landing — plugins is the first Setup nav child. */
const SETUP_PLUGINS_PATH = "/setup/plugins";

export function SetupIndexRedirect() {
  return <Navigate replace to={SETUP_PLUGINS_PATH} />;
}

/** Imported connectors moved into Setup → Connections. */
export function LegacyConnectorsRedirect() {
  return <Navigate replace to={CONNECTIONS_CATALOG_PATH} />;
}
