import { Navigate } from "react-router-dom";
import { EXTERNAL_IMPORT_PATH } from "./pages/external-import-page.js";

export function SetupIndexRedirect() {
  return <Navigate replace to={EXTERNAL_IMPORT_PATH} />;
}

export function LegacyImportRedirect() {
  return <Navigate replace to={EXTERNAL_IMPORT_PATH} />;
}
