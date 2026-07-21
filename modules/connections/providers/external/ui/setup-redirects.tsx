import { Navigate } from "react-router-dom";
import { EXTERNAL_IMPORT_PATH } from "./pages/external-import-page.js";

/** Default Setup landing — plugins is the first Setup nav child. */
const SETUP_PLUGINS_PATH = "/setup/plugins";

export function SetupIndexRedirect() {
  return <Navigate replace to={SETUP_PLUGINS_PATH} />;
}

export function LegacyImportRedirect() {
  return <Navigate replace to={EXTERNAL_IMPORT_PATH} />;
}
