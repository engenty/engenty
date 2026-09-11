import { Navigate } from "react-router-dom";
import { kbScopedSettingsTemplatesPath } from "../kb-paths.js";

/** `/kb/:slug/templates` → settings article-templates section. */
export function KbTemplatesIndexRedirect() {
  return <Navigate replace to={kbScopedSettingsTemplatesPath()} />;
}
