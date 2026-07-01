import { Navigate, useParams } from "react-router-dom";
import { kbScopedSettingsTemplatesPath } from "../kb-paths.js";

/** `/kb/:slug/templates` → settings article-templates section. */
export function KbTemplatesIndexRedirect() {
  const { kbSlug = "" } = useParams<{ kbSlug: string }>();
  return <Navigate replace to={kbScopedSettingsTemplatesPath(kbSlug)} />;
}
