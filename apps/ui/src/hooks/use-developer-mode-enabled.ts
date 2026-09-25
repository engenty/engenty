import {
  getDeveloperModePreference,
  subscribeDeveloperModePreference,
} from "@engenty/environment";
import { useEffect, useState } from "react";
import { useWorkspaceContextQuery } from "@/lib/workspace-context-query";

/**
 * Reactive developer-mode UI flag: user-menu toggle, gated to superadmins. Not
 * tied to `ENV` — deployed workspaces have it too. A member who flips the
 * localStorage key gets nothing — the developer surfaces (the /admin/engenty
 * area, inspector tab, /setup/development, feature flags) all hang off this
 * hook, so the superadmin gate here is the single choke point.
 */
export function useDeveloperModeEnabled() {
  const [enabled, setEnabled] = useState(getDeveloperModePreference);
  const workspace = useWorkspaceContextQuery(true);
  const isSuperAdmin = workspace.data?.isSuperAdmin === true;

  useEffect(
    () =>
      subscribeDeveloperModePreference(() => {
        setEnabled(getDeveloperModePreference());
      }),
    []
  );

  return enabled && isSuperAdmin;
}
