import { Navigate } from "react-router-dom";
import { TEAM_GLOBAL_SETTINGS_TAXONOMIES_PATH } from "../team-paths.js";

export function TeamGlobalSettingsIndexRedirectPage() {
  return <Navigate replace to={TEAM_GLOBAL_SETTINGS_TAXONOMIES_PATH} />;
}

export function TeamModuleSettingsRedirectPage() {
  return <Navigate replace to={TEAM_GLOBAL_SETTINGS_TAXONOMIES_PATH} />;
}
